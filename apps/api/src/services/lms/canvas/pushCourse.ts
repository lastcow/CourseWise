import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client';
import { assignments, lmsIdMap, modules } from '../../../db/schema';
import { randomUuid } from '../../../lib/crypto';
import type { CanvasClient } from './client';

// One-way CW→Canvas structure push (explicit teacher action).
// Policy (docs/plans/2026-07-04-canvas-sync-v3 §3.7, one-way subset):
// - Only CW-NATIVE entities are pushed. Rows whose id-map origin is 'import'
//   came FROM Canvas — pushing them back could overwrite the Canvas original,
//   so they are skipped and counted.
// - Re-push updates previously pushed objects: CourseWise wins; manual Canvas
//   edits to pushed objects are overwritten (stated in the confirm dialog).
// - Pushed assignments are notification/calendar carriers: submission_types
//   ['none'] with a "submit in CourseWise" note — the student workflow stays
//   in CourseWise.
// - Draft CW entities push as unpublished; published ones as published.

export interface PushStructureSummary {
  modules: { created: number; updated: number; skippedImported: number };
  assignments: { created: number; updated: number; skippedImported: number; skippedNoModule: number };
  moduleItems: { created: number };
}

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

interface IdMapEntry {
  externalId: string;
  origin: string | null;
}

async function loadIdMap(
  db: Db,
  courseLinkId: string,
  localType: 'module' | 'assignment' | 'module_item',
): Promise<Map<string, IdMapEntry>> {
  const rows = await db
    .select({ localId: lmsIdMap.localId, externalId: lmsIdMap.externalId, origin: lmsIdMap.origin })
    .from(lmsIdMap)
    .where(and(eq(lmsIdMap.courseLinkId, courseLinkId), eq(lmsIdMap.localType, localType)));
  return new Map(rows.map((r) => [r.localId, { externalId: r.externalId, origin: r.origin }]));
}

export async function pushCourseStructure(
  db: Db,
  client: CanvasClient,
  args: { courseId: string; courseLinkId: string; externalCourseId: string },
): Promise<PushStructureSummary> {
  const { courseId, courseLinkId, externalCourseId } = args;
  const now = new Date().toISOString();
  const summary: PushStructureSummary = {
    modules: { created: 0, updated: 0, skippedImported: 0 },
    assignments: { created: 0, updated: 0, skippedImported: 0, skippedNoModule: 0 },
    moduleItems: { created: 0 },
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

  const moduleMap = await loadIdMap(db, courseLinkId, 'module');
  const assignmentMap = await loadIdMap(db, courseLinkId, 'assignment');
  const itemMap = await loadIdMap(db, courseLinkId, 'module_item');

  // --- Modules (serial; the client is serial by contract) ---
  const canvasModuleIdByLocal = new Map<string, string>();
  for (const m of cwModules) {
    const mapped = moduleMap.get(m.id);
    if (mapped?.origin === 'import') {
      // Came from Canvas: the Canvas original stays authoritative over there.
      canvasModuleIdByLocal.set(m.id, mapped.externalId);
      summary.modules.skippedImported += 1;
      continue;
    }
    const published = m.status === 'published';
    if (mapped) {
      await client.updateModule(externalCourseId, mapped.externalId, {
        name: m.title,
        position: m.position,
        published,
      });
      canvasModuleIdByLocal.set(m.id, mapped.externalId);
      await db
        .update(lmsIdMap)
        .set({ syncedAt: now, updatedAt: now })
        .where(
          and(
            eq(lmsIdMap.courseLinkId, courseLinkId),
            eq(lmsIdMap.localType, 'module'),
            eq(lmsIdMap.localId, m.id),
          ),
        );
      summary.modules.updated += 1;
    } else {
      const created = await client.createModule(externalCourseId, {
        name: m.title,
        position: m.position,
      });
      if (published) {
        await client.updateModule(externalCourseId, String(created.id), { published: true });
      }
      canvasModuleIdByLocal.set(m.id, String(created.id));
      await db.insert(lmsIdMap).values({
        id: randomUuid(),
        courseLinkId,
        localType: 'module',
        localId: m.id,
        externalId: String(created.id),
        origin: 'push',
        syncedAt: now,
      });
      summary.modules.created += 1;
    }
  }

  // --- Assignments (only those inside a module; the push mirrors the module
  // skeleton, not the whole gradebook) ---
  for (const a of cwAssignments) {
    const mapped = assignmentMap.get(a.id);
    if (mapped?.origin === 'import') {
      summary.assignments.skippedImported += 1;
      continue;
    }
    if (!a.moduleId || !canvasModuleIdByLocal.has(a.moduleId)) {
      summary.assignments.skippedNoModule += 1;
      continue;
    }
    const published = a.status === 'published';
    const descriptionHtml = markdownToHtml(a.description);
    const payload: Record<string, unknown> = {
      name: a.title,
      description: [descriptionHtml, SUBMIT_IN_CW_NOTE].filter(Boolean).join('\n'),
      due_at: a.dueDate,
      unlock_at: a.startDate,
      lock_at: a.untilDate,
      points_possible: a.maxScore != null ? Number(a.maxScore) : undefined,
      submission_types: ['none'],
      published,
    };
    let canvasAssignmentId: string;
    if (mapped) {
      await client.updateAssignment(externalCourseId, mapped.externalId, payload);
      canvasAssignmentId = mapped.externalId;
      await db
        .update(lmsIdMap)
        .set({ syncedAt: now, updatedAt: now })
        .where(
          and(
            eq(lmsIdMap.courseLinkId, courseLinkId),
            eq(lmsIdMap.localType, 'assignment'),
            eq(lmsIdMap.localId, a.id),
          ),
        );
      summary.assignments.updated += 1;
    } else {
      const created = await client.createAssignment(externalCourseId, payload);
      canvasAssignmentId = String(created.id);
      await db.insert(lmsIdMap).values({
        id: randomUuid(),
        courseLinkId,
        localType: 'assignment',
        localId: a.id,
        externalId: canvasAssignmentId,
        origin: 'push',
        syncedAt: now,
      });
      summary.assignments.created += 1;
    }

    // Module item hangs the assignment inside its module (create-once).
    if (!itemMap.has(a.id)) {
      const canvasModuleId = canvasModuleIdByLocal.get(a.moduleId);
      if (canvasModuleId) {
        const item = await client.createModuleItem(externalCourseId, canvasModuleId, {
          type: 'Assignment',
          content_id: Number(canvasAssignmentId),
          position: a.position,
        });
        await db.insert(lmsIdMap).values({
          id: randomUuid(),
          courseLinkId,
          localType: 'module_item',
          localId: a.id,
          externalId: String(item.id),
          origin: 'push',
          syncedAt: now,
        });
        summary.moduleItems.created += 1;
      }
    }
  }

  return summary;
}
