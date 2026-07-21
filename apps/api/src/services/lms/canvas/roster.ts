import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client';
import { lmsCourseLinks, lmsIdMap, lmsRosterEntries } from '../../../db/schema';
import { sha256Hex } from '../../../lib/crypto';
import type { CanvasClient, CanvasEnrollmentUser } from './client';

// Roster REFERENCE refresh (docs/plans/2026-07-04-canvas-sync-v2 §6.2/§7.1).
// The roster is a reference, not an instruction: this never touches
// users/enrollments, and a student disappearing from Canvas only earns a
// "dropped in Canvas" badge (disappearedAt) — CW enrollment stays whatever
// the teacher set. Field visibility (email/sis/login) depends on the teacher
// token's Canvas permissions and is reported so the UI can show which ladder
// levels are usable.

export interface RosterRefreshSummary {
  entries: number;
  added: number;
  updated: number;
  unchanged: number;
  disappeared: number;
  reappeared: number;
  withEmail: number;
  withSisId: number;
  withLoginId: number;
}

// Aborts the run before any write when the fetched roster looks anomalous
// (course concluded, permission change, API drift) — v2 §7.1 circuit breaker.
export class RosterCircuitBreakerError extends Error {}

// Canvas's "Student View" test student must never enter the reference.
function isTestStudent(u: CanvasEnrollmentUser): boolean {
  return (
    u.name === 'Test Student' ||
    (u.enrollments ?? []).some((e) => e.type === 'StudentViewEnrollment')
  );
}

function rosterFingerprint(u: CanvasEnrollmentUser, sections: string): Promise<string> {
  return sha256Hex(
    [u.name, u.sortable_name ?? '', u.email ?? '', u.login_id ?? '', u.sis_user_id ?? '', sections].join('|'),
  );
}

// Breakers only arm above a floor: on tiny rosters (or the very first fetch)
// ordinary churn trips the percentages and would brick the refresh button.
const BREAKER_FLOOR = 5;

export async function refreshRoster(
  db: Db,
  client: CanvasClient,
  args: { courseLinkId: string; externalCourseId: string },
): Promise<RosterRefreshSummary> {
  const { courseLinkId, externalCourseId } = args;
  const now = new Date().toISOString();

  const existing = await db
    .select({
      canvasUserId: lmsRosterEntries.canvasUserId,
      fingerprint: lmsRosterEntries.fingerprint,
      disappearedAt: lmsRosterEntries.disappearedAt,
    })
    .from(lmsRosterEntries)
    .where(eq(lmsRosterEntries.courseLinkId, courseLinkId));
  const existingById = new Map(existing.map((e) => [e.canvasUserId, e]));

  const sections = await client.listSections(externalCourseId);
  const sectionNameById = new Map(sections.map((s) => [s.id, s.name ?? String(s.id)]));
  const students = (await client.listStudents(externalCourseId)).filter((u) => !isTestStudent(u));
  const fetchedIds = new Set(students.map((u) => String(u.id)));

  // --- Circuit breakers (checked BEFORE any write) ---
  // Both breakers judge THIS refresh only: the baseline excludes entries
  // already marked disappeared, so a gradual, legitimate churn (one drop per
  // week) can never accumulate into a permanent trip (v2 §7.1 "单次刷新").
  // Known limitation: refreshRoster is non-transactional and the workflow
  // retries the whole step once — a crash mid-write shifts this baseline for
  // the retry, which can under-report the retry's summary counts. Reference
  // data converges regardless.
  const prevActive = existing.filter((e) => !e.disappearedAt);
  if (prevActive.length >= BREAKER_FLOOR && students.length < prevActive.length * 0.7) {
    throw new RosterCircuitBreakerError(
      `Canvas roster shrank from ${prevActive.length} to ${students.length} (>30%) — ` +
        'possibly a concluded course, a permission change, or an API problem. No changes were written; please check Canvas.',
    );
  }
  const linkedCanvasIds = (
    await db
      .select({ externalId: lmsIdMap.externalId })
      .from(lmsIdMap)
      .where(and(eq(lmsIdMap.courseLinkId, courseLinkId), eq(lmsIdMap.localType, 'student_link')))
  ).map((r) => r.externalId);
  const prevActiveIds = new Set(prevActive.map((e) => e.canvasUserId));
  const linkedActive = linkedCanvasIds.filter((id) => prevActiveIds.has(id));
  const linkedNewlyMissing = linkedActive.filter((id) => !fetchedIds.has(id));
  if (linkedActive.length >= BREAKER_FLOOR && linkedNewlyMissing.length > linkedActive.length * 0.2) {
    throw new RosterCircuitBreakerError(
      `${linkedNewlyMissing.length} of ${linkedActive.length} linked students vanished from the Canvas roster in this refresh (>20%) — ` +
        'possibly a concluded course or a permission change. No changes were written; please check Canvas.',
    );
  }

  const summary: RosterRefreshSummary = {
    entries: students.length,
    added: 0,
    updated: 0,
    unchanged: 0,
    disappeared: 0,
    reappeared: 0,
    withEmail: 0,
    withSisId: 0,
    withLoginId: 0,
  };

  const unchangedIds: string[] = [];
  const changedRows: (typeof lmsRosterEntries.$inferInsert)[] = [];
  for (const u of students) {
    if (u.email) summary.withEmail += 1;
    if (u.sis_user_id) summary.withSisId += 1;
    if (u.login_id) summary.withLoginId += 1;

    const canvasUserId = String(u.id);
    const sectionNames = [
      ...new Set(
        (u.enrollments ?? [])
          .map((e) => (e.course_section_id ? sectionNameById.get(e.course_section_id) : null))
          .filter((n): n is string => !!n),
      ),
    ];
    const fingerprint = await rosterFingerprint(u, sectionNames.join(','));
    const prev = existingById.get(canvasUserId);
    if (prev && prev.fingerprint === fingerprint && !prev.disappearedAt) {
      summary.unchanged += 1;
      unchangedIds.push(canvasUserId);
      continue;
    }
    changedRows.push({
      courseLinkId,
      canvasUserId,
      name: u.name,
      sortableName: u.sortable_name ?? null,
      email: u.email ?? null,
      loginId: u.login_id ?? null,
      sisUserId: u.sis_user_id ?? null,
      enrollmentState: u.enrollments?.[0]?.enrollment_state ?? null,
      sectionNames,
      fingerprint,
      lastSeenAt: now,
      disappearedAt: null,
      updatedAt: now,
    });
    if (!prev) summary.added += 1;
    else if (prev.disappearedAt) summary.reappeared += 1;
    else summary.updated += 1;
  }

  // Single multi-row upsert per chunk (instead of one round-trip per student);
  // excluded-column refs keep insert and update field lists in lockstep.
  const CHUNK = 200;
  for (let i = 0; i < changedRows.length; i += CHUNK) {
    await db
      .insert(lmsRosterEntries)
      .values(changedRows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: [lmsRosterEntries.courseLinkId, lmsRosterEntries.canvasUserId],
        set: {
          name: sql`excluded.name`,
          sortableName: sql`excluded.sortable_name`,
          email: sql`excluded.email`,
          loginId: sql`excluded.login_id`,
          sisUserId: sql`excluded.sis_user_id`,
          enrollmentState: sql`excluded.enrollment_state`,
          sectionNames: sql`excluded.section_names`,
          fingerprint: sql`excluded.fingerprint`,
          lastSeenAt: sql`excluded.last_seen_at`,
          disappearedAt: null,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  // One statement keeps lastSeenAt honest for the untouched majority.
  if (unchangedIds.length > 0) {
    await db
      .update(lmsRosterEntries)
      .set({ lastSeenAt: now, updatedAt: now })
      .where(
        and(
          eq(lmsRosterEntries.courseLinkId, courseLinkId),
          inArray(lmsRosterEntries.canvasUserId, unchangedIds),
        ),
      );
  }

  // Newly vanished entries get the badge timestamp; nothing else changes.
  const missingNow = prevActive
    .map((e) => e.canvasUserId)
    .filter((id) => !fetchedIds.has(id));
  if (missingNow.length > 0) {
    await db
      .update(lmsRosterEntries)
      .set({ disappearedAt: now, updatedAt: now })
      .where(
        and(
          eq(lmsRosterEntries.courseLinkId, courseLinkId),
          inArray(lmsRosterEntries.canvasUserId, missingNow),
        ),
      );
    summary.disappeared = missingNow.length;
  }

  await db
    .update(lmsCourseLinks)
    .set({ lastRosterFetchAt: now, updatedAt: now })
    .where(eq(lmsCourseLinks.id, courseLinkId));

  return summary;
}
