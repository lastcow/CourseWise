import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client';
import {
  assignmentGroups,
  assignments,
  courses,
  lmsCourseLinks,
  lmsIdMap,
  lmsRosterEntries,
  modules,
} from '../../../db/schema';
import { randomUuid, sha256Hex } from '../../../lib/crypto';
import type {
  CanvasAssignment,
  CanvasClient,
  CanvasCourse,
  CanvasEnrollmentUser,
} from './client';

// One-time import of an existing Canvas course into CourseWise (P1 of
// docs/plans/2026-07-04-canvas-sync-v2). Everything lands as a DRAFT the
// teacher reviews inside CourseWise; imported rows become plain CourseWise
// rows afterwards. Re-import only ever ADDS new entities: rows already in
// lms_id_map are skipped (never overwritten — CourseWise owns them after
// import), with Canvas-side changes surfaced in the summary counts.
// The roster snapshot is a read-only reference (lms_roster_entries) for the
// later manual identity-linking step; it NEVER creates users or enrollments.

export interface ImportStructureSummary {
  assignmentGroups: { imported: number; skipped: number; weightRounded: string[] };
  assignments: { imported: number; skipped: number; quizStubs: number; scoreDropped: number };
  modules: { imported: number; skipped: number };
  courseFields: { updated: string[]; keptLocal: string[] };
}

export interface RosterSnapshotSummary {
  entries: number;
  withEmail: number;
  withSisId: number;
  withLoginId: number;
}

// Best-effort HTML → Markdown for Canvas rich content (syllabus_body,
// assignment descriptions). Complex constructs degrade to plain text — the
// import is a scaffold, not an authoritative copy.
export function htmlToMarkdown(html: string | null | undefined): string | null {
  if (!html) return null;
  let s = html;
  // Normalize whitespace-only content early.
  if (!s.replace(/<[^>]*>/g, '').trim()) return null;
  s = s.replace(/\r\n?/g, '\n');
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|tr|table|ul|ol|blockquote)>/gi, '\n\n');
  s = s.replace(/<h([1-6])[^>]*>/gi, (_, n: string) => `\n\n${'#'.repeat(Number(n))} `);
  s = s.replace(/<\/h[1-6]>/gi, '\n\n');
  s = s.replace(/<li[^>]*>/gi, '\n- ');
  s = s.replace(/<\/li>/gi, '');
  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');
  s = s.replace(
    /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, href: string, text: string) => `[${text.replace(/<[^>]*>/g, '').trim() || href}](${href})`,
  );
  s = s.replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '$1');
  s = s.replace(/<[^>]+>/g, '');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  const out = s.trim();
  return out.length > 0 ? out : null;
}

async function existingExternalIds(
  db: Db,
  courseLinkId: string,
  localType: 'assignment' | 'assignment_group' | 'module',
): Promise<Set<string>> {
  const rows = await db
    .select({ externalId: lmsIdMap.externalId })
    .from(lmsIdMap)
    .where(and(eq(lmsIdMap.courseLinkId, courseLinkId), eq(lmsIdMap.localType, localType)));
  return new Set(rows.map((r) => r.externalId));
}

function isQuizAssignment(a: CanvasAssignment): boolean {
  const types = a.submission_types ?? [];
  return a.is_quiz_assignment === true || types.includes('online_quiz') || types.includes('external_tool');
}

// assignments.max_score is numeric(6,2) — values outside its range would abort
// the whole insert, so unrepresentable scores import as null (teacher sets one
// manually; counted in the summary as scoreDropped).
const MAX_SCORE_LIMIT = 9999.99;

function numericScore(a: CanvasAssignment): string | null {
  if (a.grading_type !== 'points' && a.grading_type !== 'percent') return null;
  if (typeof a.points_possible !== 'number' || !Number.isFinite(a.points_possible)) return null;
  if (a.points_possible < 0 || a.points_possible > MAX_SCORE_LIMIT) return null;
  return a.points_possible.toFixed(2);
}

// Fill course metadata from Canvas ONLY where the CourseWise field is still
// empty — never overwrite what the teacher already wrote.
async function fillCourseMetadata(
  db: Db,
  courseId: string,
  canvasCourse: CanvasCourse,
): Promise<{ updated: string[]; keptLocal: string[] }> {
  const [row] = await db
    .select({
      termLabel: courses.termLabel,
      startDate: courses.startDate,
      endDate: courses.endDate,
      syllabusMd: courses.syllabusMd,
    })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  if (!row) throw new Error('course not found');

  const updates: Record<string, string> = {};
  const updated: string[] = [];
  const keptLocal: string[] = [];
  const candidates: Array<[key: 'termLabel' | 'startDate' | 'endDate' | 'syllabusMd', value: string | null]> = [
    ['termLabel', canvasCourse.term?.name ?? null],
    ['startDate', canvasCourse.start_at ?? null],
    ['endDate', canvasCourse.end_at ?? null],
    ['syllabusMd', htmlToMarkdown(canvasCourse.syllabus_body)],
  ];
  for (const [key, value] of candidates) {
    if (value === null) continue;
    if (row[key] === null || row[key] === '') {
      updates[key] = value;
      updated.push(key);
    } else if (row[key] !== value) {
      keptLocal.push(key);
    }
  }
  if (updated.length > 0) {
    await db
      .update(courses)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(courses.id, courseId));
  }
  return { updated, keptLocal };
}

export async function importCourseStructure(
  db: Db,
  client: CanvasClient,
  args: { courseId: string; courseLinkId: string; externalCourseId: string },
): Promise<ImportStructureSummary> {
  const { courseId, courseLinkId, externalCourseId } = args;
  const now = new Date().toISOString();

  // Serial fetches (client is serial by contract; do not fan out).
  const canvasCourse = await client.getCourse(externalCourseId);
  const canvasGroups = await client.listAssignmentGroups(externalCourseId);
  const canvasAssignments = await client.listAssignments(externalCourseId);
  const canvasModules = await client.listModules(externalCourseId);

  const courseFields = await fillCourseMetadata(db, courseId, canvasCourse);

  // --- Assignment groups ---
  const groupSummary = { imported: 0, skipped: 0, weightRounded: [] as string[] };
  const seenGroups = await existingExternalIds(db, courseLinkId, 'assignment_group');
  const existingGroupNames = new Set(
    (
      await db
        .select({ name: assignmentGroups.name })
        .from(assignmentGroups)
        .where(eq(assignmentGroups.courseId, courseId))
    ).map((g) => g.name.toLowerCase()),
  );
  const groupIdByExternal = new Map<string, string>();
  // Pre-load already-mapped groups so assignments can attach to them.
  for (const row of await db
    .select({ localId: lmsIdMap.localId, externalId: lmsIdMap.externalId })
    .from(lmsIdMap)
    .where(and(eq(lmsIdMap.courseLinkId, courseLinkId), eq(lmsIdMap.localType, 'assignment_group')))) {
    groupIdByExternal.set(row.externalId, row.localId);
  }

  let groupPosition = existingGroupNames.size;
  for (const g of canvasGroups) {
    const externalId = String(g.id);
    if (seenGroups.has(externalId)) {
      groupSummary.skipped += 1;
      continue;
    }
    const name = g.name?.trim() || `Canvas group ${externalId}`;
    if (existingGroupNames.has(name.toLowerCase())) {
      // Unique per course on lower(name): reuse is not safe (different weight
      // semantics); count as skipped and let the teacher reconcile manually.
      groupSummary.skipped += 1;
      continue;
    }
    const rawWeight = typeof g.group_weight === 'number' ? g.group_weight : 0;
    const weight = Math.round(rawWeight);
    if (weight !== rawWeight) groupSummary.weightRounded.push(`${name}: ${rawWeight} → ${weight}`);
    // Entity + provenance land in ONE atomic batch: a fault between separate
    // inserts would leave the entity unmapped, and the workflow step retry
    // would insert it a second time.
    const groupLocalId = randomUuid();
    await db.batch([
      db.insert(assignmentGroups).values({
        id: groupLocalId,
        courseId,
        name,
        weight,
        position: g.position ?? groupPosition,
      }),
      db.insert(lmsIdMap).values({
        courseLinkId,
        localType: 'assignment_group',
        localId: groupLocalId,
        externalId,
        lastSyncedFingerprint: await sha256Hex(`${name}|${rawWeight}|${g.position ?? ''}`),
        syncedAt: now,
      }),
    ]);
    groupPosition += 1;
    groupIdByExternal.set(externalId, groupLocalId);
    existingGroupNames.add(name.toLowerCase());
    groupSummary.imported += 1;
  }

  // --- Modules (always draft; module items are intentionally not imported) ---
  const moduleSummary = { imported: 0, skipped: 0 };
  const seenModules = await existingExternalIds(db, courseLinkId, 'module');
  let modulePosition = 0;
  for (const m of canvasModules) {
    const externalId = String(m.id);
    modulePosition += 1;
    if (seenModules.has(externalId)) {
      moduleSummary.skipped += 1;
      continue;
    }
    const title = m.name?.trim() || `Canvas module ${externalId}`;
    const moduleLocalId = randomUuid();
    await db.batch([
      db.insert(modules).values({
        id: moduleLocalId,
        courseId,
        title,
        position: m.position ?? modulePosition,
        status: 'draft',
      }),
      db.insert(lmsIdMap).values({
        courseLinkId,
        localType: 'module',
        localId: moduleLocalId,
        externalId,
        lastSyncedFingerprint: await sha256Hex(`${title}|${m.position ?? ''}`),
        syncedAt: now,
      }),
    ]);
    moduleSummary.imported += 1;
  }

  // --- Assignments (always draft; quizzes become stub assignments) ---
  const assignmentSummary = { imported: 0, skipped: 0, quizStubs: 0, scoreDropped: 0 };
  const seenAssignments = await existingExternalIds(db, courseLinkId, 'assignment');
  let assignmentPosition = 0;
  for (const a of canvasAssignments) {
    const externalId = String(a.id);
    assignmentPosition += 1;
    if (a.workflow_state === 'deleted') continue;
    if (seenAssignments.has(externalId)) {
      assignmentSummary.skipped += 1;
      continue;
    }
    const quiz = isQuizAssignment(a);
    const title = a.name?.trim() || `Canvas assignment ${externalId}`;
    const descriptionMd = htmlToMarkdown(a.description);
    const description = quiz
      ? [
          '> Imported quiz stub — the quiz content stays in Canvas; rebuild the questions in CourseWise Quizzes.',
          descriptionMd,
        ]
          .filter(Boolean)
          .join('\n\n')
      : descriptionMd;
    const groupLocalId = a.assignment_group_id
      ? (groupIdByExternal.get(String(a.assignment_group_id)) ?? null)
      : null;
    const maxScore = numericScore(a);
    if (
      maxScore === null &&
      typeof a.points_possible === 'number' &&
      (a.grading_type === 'points' || a.grading_type === 'percent')
    ) {
      assignmentSummary.scoreDropped += 1;
    }
    const assignmentLocalId = randomUuid();
    await db.batch([
      db.insert(assignments).values({
        id: assignmentLocalId,
        courseId,
        groupId: groupLocalId,
        title,
        description,
        dueDate: a.due_at ?? null,
        startDate: a.unlock_at ?? null,
        untilDate: a.lock_at ?? null,
        maxScore,
        status: 'draft',
        position: a.position ?? assignmentPosition,
      }),
      db.insert(lmsIdMap).values({
        courseLinkId,
        localType: 'assignment',
        localId: assignmentLocalId,
        externalId,
        lastSyncedFingerprint: await sha256Hex(
          `${title}|${a.due_at ?? ''}|${a.unlock_at ?? ''}|${a.lock_at ?? ''}|${a.points_possible ?? ''}`,
        ),
        syncedAt: now,
      }),
    ]);
    assignmentSummary.imported += 1;
    if (quiz) assignmentSummary.quizStubs += 1;
  }

  return {
    assignmentGroups: groupSummary,
    assignments: assignmentSummary,
    modules: moduleSummary,
    courseFields,
  };
}

function rosterFingerprint(u: CanvasEnrollmentUser, sections: string): Promise<string> {
  return sha256Hex(
    [u.name, u.sortable_name ?? '', u.email ?? '', u.login_id ?? '', u.sis_user_id ?? '', sections].join('|'),
  );
}

// Read-only roster reference snapshot. Never touches users/enrollments.
export async function snapshotRoster(
  db: Db,
  client: CanvasClient,
  args: { courseLinkId: string; externalCourseId: string },
): Promise<RosterSnapshotSummary> {
  const { courseLinkId, externalCourseId } = args;
  const now = new Date().toISOString();

  const sections = await client.listSections(externalCourseId);
  const sectionNameById = new Map(sections.map((s) => [s.id, s.name ?? String(s.id)]));
  const students = await client.listStudents(externalCourseId);

  const summary: RosterSnapshotSummary = { entries: 0, withEmail: 0, withSisId: 0, withLoginId: 0 };
  for (const u of students) {
    const sectionNames = [
      ...new Set(
        (u.enrollments ?? [])
          .map((e) => (e.course_section_id ? sectionNameById.get(e.course_section_id) : null))
          .filter((n): n is string => !!n),
      ),
    ];
    const enrollmentState = u.enrollments?.[0]?.enrollment_state ?? null;
    const fingerprint = await rosterFingerprint(u, sectionNames.join(','));
    const values = {
      courseLinkId,
      canvasUserId: String(u.id),
      name: u.name,
      sortableName: u.sortable_name ?? null,
      email: u.email ?? null,
      loginId: u.login_id ?? null,
      sisUserId: u.sis_user_id ?? null,
      enrollmentState,
      sectionNames,
      fingerprint,
      lastSeenAt: now,
      disappearedAt: null,
      updatedAt: now,
    };
    await db
      .insert(lmsRosterEntries)
      .values(values)
      .onConflictDoUpdate({
        target: [lmsRosterEntries.courseLinkId, lmsRosterEntries.canvasUserId],
        set: {
          name: values.name,
          sortableName: values.sortableName,
          email: values.email,
          loginId: values.loginId,
          sisUserId: values.sisUserId,
          enrollmentState: values.enrollmentState,
          sectionNames: values.sectionNames,
          fingerprint: values.fingerprint,
          lastSeenAt: now,
          disappearedAt: null,
          updatedAt: now,
        },
      });
    summary.entries += 1;
    if (u.email) summary.withEmail += 1;
    if (u.sis_user_id) summary.withSisId += 1;
    if (u.login_id) summary.withLoginId += 1;
  }

  await db
    .update(lmsCourseLinks)
    .set({ lastRosterFetchAt: now, updatedAt: now })
    .where(eq(lmsCourseLinks.id, courseLinkId));

  return summary;
}
