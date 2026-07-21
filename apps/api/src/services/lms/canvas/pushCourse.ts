import type { CanvasPushSummary } from '@coursewise/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../../db/client';
import { assignments, lmsIdMap, modules } from '../../../db/schema';
import { randomUuid, sha256Hex } from '../../../lib/crypto';
import { ApiException } from '../../../lib/errors';
import type { CanvasAssignment, CanvasClient, CanvasModule, CanvasModuleItem } from './client';

// One-way CW→Canvas structure push (explicit teacher action).
// Policy (docs/plans/2026-07-04-canvas-sync-v3 §3.7, one-way subset; hardening
// per docs/plans/2026-07-21-canvas-sync-status-and-roadmap §五 stage 0):
// - Only CW-NATIVE entities are pushed. Rows whose id-map origin is 'import'
//   came FROM Canvas — pushing them back could overwrite the Canvas original,
//   so they are skipped and counted.
// - Re-push updates previously pushed objects: CourseWise wins; manual Canvas
//   edits to pushed objects are overwritten (stated in the confirm dialog) —
//   and a pre-update GET + fingerprint comparison DETECTS such edits and
//   reports the overwritten titles in the run summary (read-compare guard,
//   v3 §2.3 minimal form).
// - Canvas-side deletions of pushed modules/assignments never fail the run
//   and are never auto-recreated: the mapping is tombstoned (remoteMissingAt)
//   and reported every run until the teacher acts. Tombstones are re-verified
//   each push (the guard GET runs anyway), so a Canvas-side undelete or a
//   one-off spurious 404 self-heals (v3 §2.7 resurrection detection).
//   Module ITEMS are the exception: an item is placement metadata, not
//   content — desired-state reconciliation recreates/moves items to match CW.
// - Create paths are crash-safe against the Workflow's whole-step retry:
//   assignments carry a hidden <span data-coursewise-id="<localId>"> marker
//   and adopt a marker-matching orphan instead of duplicating (same marker
//   convention as v2 §7.2 drift recovery); modules write a pending-intent
//   id-map row BEFORE the Canvas POST, so a retry that finds the pending row
//   adopts an unmapped same-name module instead of minting a twin; items
//   reconcile against the actual item lists, adopting any unmapped item that
//   already references the assignment.
// - Pushed assignments are notification/calendar carriers: submission_types
//   ['none'] with a "submit in CourseWise" note — the student workflow stays
//   in CourseWise.
// - Draft CW entities push as unpublished; published ones as published.

// Server-side summary = the shared wire type with every field required, so the
// two can never drift apart silently (RunRow reads the shared type).
type SharedPush = CanvasPushSummary['push'];
export type PushStructureSummary = {
  [K in keyof SharedPush]-?: NonNullable<SharedPush[K]> extends unknown[]
    ? NonNullable<SharedPush[K]>
    : Required<NonNullable<SharedPush[K]>>;
};

const SUMMARY_TITLE_CAP = 20;

// Best-effort Markdown → HTML for Canvas rich content. Handles the subset our
// own HTML→MD conversion emits plus common teacher-authored Markdown.
export function markdownToHtml(md: string | null | undefined): string | null {
  if (!md || !md.trim()) return null;
  const escape = (t: string): string =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (t: string): string =>
    escape(t)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const blocks = md.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const html = blocks
    .map((block) => {
      const lines = block.split('\n').filter((l) => l.trim().length > 0);
      if (lines.length === 0) return '';
      const heading = lines[0]?.match(/^(#{1,6})\s+(.*)$/);
      if (heading?.[1] && lines.length === 1) {
        return `<h${heading[1].length}>${inline(heading[2] ?? '')}</h${heading[1].length}>`;
      }
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        const items = lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      if (lines.every((l) => /^\s*>\s?/.test(l))) {
        const inner = lines.map((l) => inline(l.replace(/^\s*>\s?/, ''))).join('<br>');
        return `<blockquote>${inner}</blockquote>`;
      }
      return `<p>${lines.map(inline).join('<br>')}</p>`;
    })
    .filter(Boolean)
    .join('\n');
  return html || null;
}

const SUBMIT_IN_CW_NOTE =
  '<p><em>Submit in CourseWise — this Canvas entry is a schedule/notification mirror managed by CourseWise.</em></p>';

export function cwMarker(localId: string): string {
  return `<span data-coursewise-id="${localId}"></span>`;
}

export function extractCwMarker(description: string | null | undefined): string | null {
  const match = description?.match(/data-coursewise-id="([0-9a-fA-F-]{36})"/);
  return match?.[1] ?? null;
}

// Pending-intent module rows: written BEFORE the Canvas POST so a crashed
// create is visible to the retry (which then adopts instead of duplicating).
// The externalId encodes the name the create was ATTEMPTED with, so adoption
// matches what the crashed run actually sent to Canvas — not the current CW
// title, which the teacher may have edited between the crash and the retry.
const PENDING_PREFIX = 'pending:';

export function pendingExternalId(attemptedName: string): string {
  return `${PENDING_PREFIX}${attemptedName}`;
}

export function isPendingExternalId(externalId: string): boolean {
  return externalId.startsWith(PENDING_PREFIX);
}

export function pendingAttemptedName(externalId: string): string {
  return externalId.slice(PENDING_PREFIX.length);
}

// Echo-bookkeeping fingerprints are computed from Canvas RESPONSE objects so
// that a later GET compares against Canvas's own normalization of the same
// fields. Deliberately excluded:
// - description: Canvas rewrites HTML on save (links, data-api-* attributes),
//   so it never round-trips byte-equal — telling real description edits apart
//   needs the v3 normalization layer (P4).
// - module position: Canvas cascades position renumbering across siblings on
//   any insert/reorder, so including it turns unrelated teacher actions into
//   phantom "edited" reports for every module.
// The scheme prefix versions the field set: when a future scheme changes it,
// stored fingerprints become incomparable (no detection that run) instead of
// mass-reporting phantom edits.
const FP_SCHEME = 'v1';

export function fingerprintComparable(stored: string | null): boolean {
  return stored != null && stored.startsWith(`${FP_SCHEME}:`);
}

export async function moduleRemoteFingerprint(m: CanvasModule): Promise<string> {
  return `${FP_SCHEME}:${await sha256Hex(
    JSON.stringify({
      name: m.name ?? null,
      // Boolean-coerced: create/update responses may omit the field where a
      // later GET returns false — null vs false must not read as an edit.
      published: m.published === true,
    }),
  )}`;
}

export async function assignmentRemoteFingerprint(a: CanvasAssignment): Promise<string> {
  return `${FP_SCHEME}:${await sha256Hex(
    JSON.stringify({
      name: a.name ?? null,
      due_at: a.due_at ?? null,
      unlock_at: a.unlock_at ?? null,
      lock_at: a.lock_at ?? null,
      points_possible: a.points_possible ?? null,
      published: a.published === true,
    }),
  )}`;
}

function isNotFound(err: unknown): boolean {
  return err instanceof ApiException && err.status === 404;
}

interface IdMapEntry {
  externalId: string;
  origin: string | null;
  lastPushFingerprint: string | null;
  remoteMissingAt: string | null;
}

type PushLocalType = 'module' | 'assignment' | 'module_item';
const PUSH_LOCAL_TYPES: PushLocalType[] = ['module', 'assignment', 'module_item'];

export async function pushCourseStructure(
  db: Db,
  client: CanvasClient,
  args: { courseId: string; courseLinkId: string; externalCourseId: string },
): Promise<PushStructureSummary> {
  const { courseId, courseLinkId, externalCourseId } = args;
  const summary: PushStructureSummary = {
    modules: { created: 0, updated: 0, unchanged: 0, skippedImported: 0, remoteMissing: 0 },
    assignments: {
      created: 0,
      updated: 0,
      adopted: 0,
      skippedImported: 0,
      skippedNoModule: 0,
      remoteMissing: 0,
    },
    moduleItems: { created: 0, updated: 0, unchanged: 0 },
    remoteEdits: [],
    remoteMissingTitles: [],
  };

  const whereMapRow = (localType: PushLocalType, localId: string) =>
    and(
      eq(lmsIdMap.courseLinkId, courseLinkId),
      eq(lmsIdMap.localType, localType),
      eq(lmsIdMap.localId, localId),
    );

  const recordPush = async (
    localType: PushLocalType,
    localId: string,
    patch: { externalId?: string; fingerprint?: string | null; remoteUpdatedAt?: string | null },
  ): Promise<void> => {
    const now = new Date().toISOString();
    await db
      .update(lmsIdMap)
      .set({
        ...(patch.externalId !== undefined ? { externalId: patch.externalId } : {}),
        ...(patch.fingerprint !== undefined ? { lastPushFingerprint: patch.fingerprint } : {}),
        ...(patch.remoteUpdatedAt !== undefined
          ? { lastPushRemoteUpdatedAt: patch.remoteUpdatedAt }
          : {}),
        syncedAt: now,
        lastPushAt: now,
        remoteMissingAt: null,
        updatedAt: now,
      })
      .where(whereMapRow(localType, localId));
  };

  const insertPushed = async (
    localType: PushLocalType,
    localId: string,
    externalId: string,
    fingerprint: string | null,
    remoteUpdatedAt: string | null,
  ): Promise<void> => {
    const now = new Date().toISOString();
    await db.insert(lmsIdMap).values({
      id: randomUuid(),
      courseLinkId,
      localType,
      localId,
      externalId,
      origin: 'push',
      syncedAt: now,
      lastPushAt: now,
      lastPushFingerprint: fingerprint,
      lastPushRemoteUpdatedAt: remoteUpdatedAt,
    });
  };

  // Tombstone (or refresh the tombstone report for) a mapping whose Canvas
  // object is gone. Titles are re-emitted EVERY run so the report never decays
  // into a bare count.
  const markRemoteMissing = async (
    localType: PushLocalType,
    localId: string,
    title: string,
  ): Promise<void> => {
    const now = new Date().toISOString();
    await db
      .update(lmsIdMap)
      .set({ remoteMissingAt: now, updatedAt: now })
      .where(whereMapRow(localType, localId));
    summary.remoteMissingTitles.push(title);
  };

  const cwModules = await db
    .select()
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .orderBy(asc(modules.position));
  const cwAssignments = await db
    .select()
    .from(assignments)
    .where(eq(assignments.courseId, courseId))
    .orderBy(asc(assignments.position));

  // One query for all three localTypes, bucketed in JS.
  const idMapRows = await db
    .select({
      localType: lmsIdMap.localType,
      localId: lmsIdMap.localId,
      externalId: lmsIdMap.externalId,
      origin: lmsIdMap.origin,
      lastPushFingerprint: lmsIdMap.lastPushFingerprint,
      remoteMissingAt: lmsIdMap.remoteMissingAt,
    })
    .from(lmsIdMap)
    .where(
      and(eq(lmsIdMap.courseLinkId, courseLinkId), inArray(lmsIdMap.localType, PUSH_LOCAL_TYPES)),
    );
  const buckets: Record<PushLocalType, Map<string, IdMapEntry>> = {
    module: new Map(),
    assignment: new Map(),
    module_item: new Map(),
  };
  for (const { localType, localId, ...entry } of idMapRows) {
    buckets[localType as PushLocalType]?.set(localId, entry);
  }
  const moduleMap = buckets.module;
  const assignmentMap = buckets.assignment;
  const itemMap = buckets.module_item;

  // Reap pending-intent rows whose CW module no longer exists: the push loop
  // only visits live CW modules, so nothing would ever revisit them, and a
  // stale row could match a future adoption attempt for an unrelated module.
  const cwModuleLocalIds = new Set(cwModules.map((m) => m.id));
  for (const [localId, entry] of [...moduleMap.entries()]) {
    if (isPendingExternalId(entry.externalId) && !cwModuleLocalIds.has(localId)) {
      await db.delete(lmsIdMap).where(whereMapRow('module', localId));
      moduleMap.delete(localId);
    }
  }

  // Remote module inventory (one GET). Feeds two things:
  // 1. Pending-orphan adoption: a retry that finds a pending-intent row adopts
  //    the unmapped same-name module a crashed create left behind. Adoption is
  //    gated on the pending row existing — we never adopt by name alone.
  // 2. The ordering-contention rule: positions are enforced only while every
  //    Canvas module is one of ours (all mapped). Once the teacher creates a
  //    Canvas-native module, the course's ordering is contested and pushing
  //    our dense sequence would endlessly shove their module around.
  const remoteModules = await client.listModules(externalCourseId);
  const mappedModuleExternalIds = new Set(
    [...moduleMap.values()].map((e) => e.externalId).filter((id) => !isPendingExternalId(id)),
  );
  const unmappedRemoteModules = remoteModules.filter(
    (rm) => !mappedModuleExternalIds.has(String(rm.id)),
  );
  const enforceModuleOrder = unmappedRemoteModules.length === 0;
  const claimedRemoteModuleIds = new Set<string>();
  const adoptPendingModule = async (attemptedName: string): Promise<CanvasModule | null> => {
    for (const rm of unmappedRemoteModules) {
      if (rm.name !== attemptedName || claimedRemoteModuleIds.has(String(rm.id))) continue;
      // Provenance checks: a crashed create leaves an UNPUBLISHED module with
      // ZERO items (the publish follow-up and all item creation happen only
      // after the real id is recorded, which is what didn't happen). A
      // teacher's own same-name module fails these and is never seized.
      if (rm.published === true) continue;
      const items = await client.listModuleItems(externalCourseId, String(rm.id));
      if (items.length > 0) continue;
      claimedRemoteModuleIds.add(String(rm.id));
      return rm;
    }
    return null;
  };

  // --- Modules (serial; the client is serial by contract) ---
  // Positions sent to Canvas are the dense 1-based iteration order, not raw CW
  // position values: CW positions are 0-based and may have gaps, while Canvas
  // clamps/renumbers to a dense 1-based sequence — comparing raw values would
  // make the unchanged check never match and re-push "move" phantom noise.
  const canvasModuleIdByLocal = new Map<string, string>();
  let modulePosition = 0;
  for (const m of cwModules) {
    modulePosition += 1;
    const mapped = moduleMap.get(m.id);
    if (mapped?.origin === 'import') {
      // Came from Canvas: the Canvas original stays authoritative over there.
      canvasModuleIdByLocal.set(m.id, mapped.externalId);
      summary.modules.skippedImported += 1;
      continue;
    }
    const published = m.status === 'published';
    if (mapped && !isPendingExternalId(mapped.externalId)) {
      // Read-compare guard + tombstone re-verification in one GET: a 404
      // (re-)tombstones, a hit on a tombstoned row resurrects it.
      // Known limitation (no cross-system transaction): a crash between a
      // successful Canvas write and its recordPush leaves a stale fingerprint,
      // so the retry can misreport our own write as a Canvas-side edit — and
      // an edit a crashed attempt genuinely detected is absent from the final
      // summary. One-run reporting noise only; content itself converges.
      let remote: CanvasModule;
      try {
        remote = await client.getModule(externalCourseId, mapped.externalId);
      } catch (err) {
        if (isNotFound(err)) {
          await markRemoteMissing('module', m.id, m.title);
          summary.modules.remoteMissing += 1;
          // A tombstoned module occupies no remote slot — keep the dense
          // sequence aligned with what actually exists over there.
          modulePosition -= 1;
          continue;
        }
        throw err;
      }
      const remoteFp = await moduleRemoteFingerprint(remote);
      if (fingerprintComparable(mapped.lastPushFingerprint) && remoteFp !== mapped.lastPushFingerprint) {
        summary.remoteEdits.push(m.title);
      }
      canvasModuleIdByLocal.set(m.id, mapped.externalId);
      const inDesiredState =
        remote.name === m.title &&
        (remote.published === true) === published &&
        (!enforceModuleOrder || remote.position === modulePosition);
      if (inDesiredState) {
        // No-op PUT skipped; still clear tombstones / backfill fingerprints.
        if (mapped.remoteMissingAt || mapped.lastPushFingerprint !== remoteFp) {
          await recordPush('module', m.id, { fingerprint: remoteFp });
        }
        summary.modules.unchanged += 1;
      } else {
        const updated = await client.updateModule(externalCourseId, mapped.externalId, {
          name: m.title,
          ...(enforceModuleOrder ? { position: modulePosition } : {}),
          published,
        });
        await recordPush('module', m.id, { fingerprint: await moduleRemoteFingerprint(updated) });
        summary.modules.updated += 1;
      }
    } else {
      let canvasModuleId: string;
      if (mapped) {
        // Pending-intent row from a crashed create: adopt what that run made
        // (matched by the name it SENT, not the current CW title), or fall
        // through to a fresh create against the same row.
        const orphan = await adoptPendingModule(pendingAttemptedName(mapped.externalId));
        if (!orphan && pendingAttemptedName(mapped.externalId) !== m.title) {
          // Re-creating under a NEW title: refresh the recorded attempt so a
          // second crash still matches what this create is about to send.
          await db
            .update(lmsIdMap)
            .set({ externalId: pendingExternalId(m.title), updatedAt: new Date().toISOString() })
            .where(whereMapRow('module', m.id));
        }
        if (orphan) {
          const updated = await client.updateModule(externalCourseId, String(orphan.id), {
            name: m.title,
            ...(enforceModuleOrder ? { position: modulePosition } : {}),
            published,
          });
          canvasModuleId = String(orphan.id);
          await recordPush('module', m.id, {
            externalId: canvasModuleId,
            fingerprint: await moduleRemoteFingerprint(updated),
          });
          summary.modules.updated += 1;
          canvasModuleIdByLocal.set(m.id, canvasModuleId);
          continue;
        }
      } else {
        await insertPushed('module', m.id, pendingExternalId(m.title), null, null);
      }
      const created = await client.createModule(externalCourseId, {
        name: m.title,
        position: modulePosition,
      });
      canvasModuleId = String(created.id);
      // Persist the real id BEFORE the publish follow-up: if publish fails,
      // the retry heals via the normal update path instead of re-creating.
      await recordPush('module', m.id, {
        externalId: canvasModuleId,
        fingerprint: await moduleRemoteFingerprint(created),
      });
      if (published) {
        // Canvas ignores published on create; a follow-up update publishes.
        const publishedResp = await client.updateModule(externalCourseId, canvasModuleId, {
          published: true,
        });
        await recordPush('module', m.id, {
          fingerprint: await moduleRemoteFingerprint(publishedResp),
        });
      }
      canvasModuleIdByLocal.set(m.id, canvasModuleId);
      summary.modules.created += 1;
    }
  }

  // Lazily fetched once, only when an assignment create is about to happen:
  // lets the create path adopt a marker-bearing orphan (a previous run's
  // Canvas POST whose id-map insert never landed) instead of a duplicate.
  let orphansByLocalId: Map<string, CanvasAssignment> | null = null;
  const findMarkerOrphan = async (localId: string): Promise<CanvasAssignment | null> => {
    if (!orphansByLocalId) {
      const remoteAssignments = await client.listAssignments(externalCourseId);
      const mappedExternalIds = new Set(
        [...assignmentMap.values()].map((entry) => entry.externalId),
      );
      orphansByLocalId = new Map();
      for (const remote of remoteAssignments) {
        if (remote.workflow_state === 'deleted') continue;
        if (mappedExternalIds.has(String(remote.id))) continue;
        const marker = extractCwMarker(remote.description);
        if (marker) orphansByLocalId.set(marker, remote);
      }
    }
    return orphansByLocalId.get(localId) ?? null;
  };

  // --- Assignments (only those inside a pushed module; the push mirrors the
  // module skeleton, not the whole gradebook). Desired item placements are
  // collected here and reconciled against actual Canvas item lists below. ---
  const desiredItems: Array<{
    localId: string;
    title: string;
    canvasAssignmentId: string;
    canvasModuleId: string;
    position: number;
  }> = [];
  // Same dense 1-based ordering rule as modules, per target module.
  const nextItemPosition = new Map<string, number>();
  for (const a of cwAssignments) {
    const mapped = assignmentMap.get(a.id);
    if (mapped?.origin === 'import') {
      summary.assignments.skippedImported += 1;
      continue;
    }
    if (!a.moduleId || !cwModuleLocalIds.has(a.moduleId)) {
      summary.assignments.skippedNoModule += 1;
      continue;
    }
    const canvasModuleId = canvasModuleIdByLocal.get(a.moduleId) ?? null;
    if (!mapped && !canvasModuleId) {
      // Only CREATION requires a live Canvas module (the mirror is placed on
      // creation); already-pushed assignments keep syncing even when their
      // module is tombstoned — Canvas deletes items, not assignments, when a
      // module is deleted.
      summary.assignments.skippedNoModule += 1;
      continue;
    }
    const published = a.status === 'published';
    const descriptionHtml = markdownToHtml(a.description);
    const payload: Record<string, unknown> = {
      name: a.title,
      description: [cwMarker(a.id), descriptionHtml, SUBMIT_IN_CW_NOTE].filter(Boolean).join('\n'),
      due_at: a.dueDate,
      unlock_at: a.startDate,
      lock_at: a.untilDate,
      points_possible: a.maxScore != null ? Number(a.maxScore) : undefined,
      submission_types: ['none'],
      published,
    };
    let canvasAssignmentId: string;
    if (mapped) {
      // Read-compare guard + tombstone re-verification, mirroring modules.
      let remote: CanvasAssignment | null;
      try {
        remote = await client.getAssignment(externalCourseId, mapped.externalId);
      } catch (err) {
        if (!isNotFound(err)) throw err;
        remote = null;
      }
      if (!remote || remote.workflow_state === 'deleted') {
        await markRemoteMissing('assignment', a.id, a.title);
        summary.assignments.remoteMissing += 1;
        continue;
      }
      if (fingerprintComparable(mapped.lastPushFingerprint)) {
        const remoteFp = await assignmentRemoteFingerprint(remote);
        // Fingerprint over the stable field subset is the real signal;
        // updated_at alone is noisy (grading/reorder side-effects bump it).
        if (remoteFp !== mapped.lastPushFingerprint) summary.remoteEdits.push(a.title);
      }
      const resp = await client.updateAssignment(externalCourseId, mapped.externalId, payload);
      canvasAssignmentId = mapped.externalId;
      await recordPush('assignment', a.id, {
        fingerprint: await assignmentRemoteFingerprint(resp),
        remoteUpdatedAt: resp.updated_at ?? null,
      });
      summary.assignments.updated += 1;
    } else {
      const orphan = await findMarkerOrphan(a.id);
      if (orphan) {
        // Recovered a lost mapping: bring the orphan up to date, don't duplicate.
        const resp = await client.updateAssignment(externalCourseId, String(orphan.id), payload);
        canvasAssignmentId = String(orphan.id);
        await insertPushed(
          'assignment',
          a.id,
          canvasAssignmentId,
          await assignmentRemoteFingerprint(resp),
          resp.updated_at ?? null,
        );
        summary.assignments.adopted += 1;
      } else {
        const created = await client.createAssignment(externalCourseId, payload);
        canvasAssignmentId = String(created.id);
        await insertPushed(
          'assignment',
          a.id,
          canvasAssignmentId,
          await assignmentRemoteFingerprint(created),
          created.updated_at ?? null,
        );
        summary.assignments.created += 1;
      }
    }
    if (canvasModuleId) {
      const position = (nextItemPosition.get(canvasModuleId) ?? 0) + 1;
      nextItemPosition.set(canvasModuleId, position);
      desiredItems.push({
        localId: a.id,
        title: a.title,
        canvasAssignmentId,
        canvasModuleId,
        position,
      });
    }
    // else: module tombstoned — the assignment itself synced above; its
    // placement is unrepresentable until the module situation is resolved,
    // which the module's own remote-missing report already surfaces.
  }

  // --- Module items: desired-state reconciliation against the ACTUAL item
  // lists (one GET per known module). Items are placement metadata, not
  // teacher content: CW wins outright — moved items are moved back, deleted
  // items are recreated, and orphaned items (a crashed run's create) are
  // adopted by their assignment reference within the desired module.
  // Residual blind spots: an item dragged into a Canvas-only (unmapped)
  // module — or one whose CW module was deleted locally — is invisible here
  // and would be recreated in its CW module. Note the content_id match uses
  // Canvas's LOCAL numeric ids on both sides (item lists never return
  // shard-qualified forms, and our stored assignment externalIds are minted
  // from response.id, which is also local). ---
  if (desiredItems.length > 0) {
    const mappedItemIds = new Set([...itemMap.values()].map((e) => e.externalId));
    const ourAssignmentExternalIds = new Set(desiredItems.map((d) => d.canvasAssignmentId));
    const actualByItemId = new Map<string, { item: CanvasModuleItem; canvasModuleId: string }>();
    const actualByContentId = new Map<
      string,
      Array<{ item: CanvasModuleItem; canvasModuleId: string }>
    >();
    // Per-module ordering-contention rule (same as modules): item positions
    // are enforced only inside modules whose every item is ours — otherwise
    // the teacher's Canvas-native items own the ordering and we only manage
    // membership (which module), not position.
    const positionEnforcedModules = new Set<string>();
    for (const canvasModuleId of new Set(canvasModuleIdByLocal.values())) {
      const items = await client.listModuleItems(externalCourseId, canvasModuleId);
      let allOurs = true;
      for (const item of items) {
        const located = { item, canvasModuleId };
        actualByItemId.set(String(item.id), located);
        if (item.type === 'Assignment' && item.content_id != null) {
          const key = String(item.content_id);
          const list = actualByContentId.get(key) ?? [];
          list.push(located);
          actualByContentId.set(key, list);
          if (!mappedItemIds.has(String(item.id)) && !ourAssignmentExternalIds.has(key)) {
            allOurs = false;
          }
        } else {
          allOurs = false;
        }
      }
      if (allOurs) positionEnforcedModules.add(canvasModuleId);
    }

    // Membership pass: ensure each desired item exists and lives in its
    // desired module. Position PUTs are deferred to the ordering pass below —
    // every per-item position write renumbers siblings server-side, which
    // would invalidate the snapshot comparisons for the rest of this loop.
    const claimedItemIds = new Set<string>();
    const modulesNeedingReorder = new Set<string>();
    const itemExternalIdByLocal = new Map<string, string>();
    for (const desired of desiredItems) {
      const entry = itemMap.get(desired.localId);
      const enforcePosition = positionEnforcedModules.has(desired.canvasModuleId);
      let actual = entry ? actualByItemId.get(entry.externalId) : undefined;
      let externalId = entry?.externalId ?? null;
      if (!actual) {
        // Mapped item vanished, or no mapping yet: adopt an unmapped item
        // that already references this assignment — but only inside the
        // DESIRED module. A stray in another module may be the teacher's own
        // deliberate second placement; seizing it would hijack their layout,
        // and the crash-orphan this recovery exists for was created in the
        // desired module.
        const stray = (actualByContentId.get(desired.canvasAssignmentId) ?? []).find(
          (candidate) =>
            candidate.canvasModuleId === desired.canvasModuleId &&
            !mappedItemIds.has(String(candidate.item.id)) &&
            !claimedItemIds.has(String(candidate.item.id)),
        );
        if (stray) {
          claimedItemIds.add(String(stray.item.id));
          actual = stray;
          externalId = String(stray.item.id);
        }
      }
      if (!actual || externalId == null) {
        const created = await client.createModuleItem(externalCourseId, desired.canvasModuleId, {
          type: 'Assignment',
          content_id: desired.canvasAssignmentId,
          // In a contested module, append instead of wedging into the
          // teacher's ordering.
          ...(enforcePosition ? { position: desired.position } : {}),
        });
        if (entry) {
          await recordPush('module_item', desired.localId, { externalId: String(created.id) });
        } else {
          await insertPushed('module_item', desired.localId, String(created.id), null, null);
        }
        itemExternalIdByLocal.set(desired.localId, String(created.id));
        // Creation shifts sibling positions — settle the order afterwards.
        if (enforcePosition) modulesNeedingReorder.add(desired.canvasModuleId);
        summary.moduleItems.created += 1;
        continue;
      }
      itemExternalIdByLocal.set(desired.localId, externalId);
      const moduleOk = actual.canvasModuleId === desired.canvasModuleId;
      const positionOk = !enforcePosition || actual.item.position === desired.position;
      if (moduleOk && positionOk && entry && externalId === entry.externalId && !entry.remoteMissingAt) {
        summary.moduleItems.unchanged += 1;
        continue;
      }
      if (!moduleOk) {
        // The update route addresses the item via its CURRENT module.
        await client.updateModuleItem(externalCourseId, actual.canvasModuleId, externalId, {
          module_id: desired.canvasModuleId,
        });
        if (enforcePosition) modulesNeedingReorder.add(desired.canvasModuleId);
      } else if (!positionOk) {
        modulesNeedingReorder.add(desired.canvasModuleId);
      }
      if (entry) {
        await recordPush('module_item', desired.localId, { externalId });
      } else {
        await insertPushed('module_item', desired.localId, externalId, null, null);
      }
      summary.moduleItems.updated += 1;
    }

    // Ordering pass: wherever membership changed or a position mismatch was
    // seen, re-assert ALL desired positions of that module in CW order.
    // Sequential 1..N writes land a deterministic final order regardless of
    // how Canvas renumbered along the way; only uncontested modules qualify.
    for (const canvasModuleId of modulesNeedingReorder) {
      for (const desired of desiredItems) {
        if (desired.canvasModuleId !== canvasModuleId) continue;
        const externalId = itemExternalIdByLocal.get(desired.localId);
        if (!externalId) continue;
        await client.updateModuleItem(externalCourseId, canvasModuleId, externalId, {
          position: desired.position,
        });
      }
    }
  }

  summary.remoteEdits = summary.remoteEdits.slice(0, SUMMARY_TITLE_CAP);
  summary.remoteMissingTitles = summary.remoteMissingTitles.slice(0, SUMMARY_TITLE_CAP);
  return summary;
}
