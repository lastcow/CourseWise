import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  assignmentSubmissions,
  groupMemberships,
  groupSubmissions,
  groups,
} from '../db/schema';
import { ApiException, ERROR_CODES } from '../lib/errors';

/**
 * Find the group a student belongs to inside an assignment's groupSet.
 * Returns null if the student has not yet joined / been assigned to any
 * group in that set.
 */
export async function findStudentGroupForAssignment(
  db: Db,
  groupSetId: string,
  studentId: string,
): Promise<{ groupId: string; groupName: string } | null> {
  const rows = await db
    .select({
      groupId: groupMemberships.groupId,
      groupName: groups.name,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(
      and(
        eq(groupMemberships.groupSetId, groupSetId),
        eq(groupMemberships.studentId, studentId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Ensure there is a group_submissions row for (assignment, group) and a
 * per-member assignment_submissions row for every CURRENT group member,
 * all linked to that group submission. Idempotent.
 *
 * Membership snapshot is taken at the time of this call: members added
 * later won't get a row until they (or a teammate) call this again.
 */
export async function ensureGroupSubmissionFannedOut(
  db: Db,
  assignmentId: string,
  groupId: string,
  triggeringStudentId: string,
): Promise<string /* groupSubmissionId */> {
  // 1. Find-or-create the shared group_submissions row.
  let [existingGroupSub] = await db
    .select()
    .from(groupSubmissions)
    .where(
      and(eq(groupSubmissions.assignmentId, assignmentId), eq(groupSubmissions.groupId, groupId)),
    )
    .limit(1);
  if (!existingGroupSub) {
    try {
      const [created] = await db
        .insert(groupSubmissions)
        .values({ assignmentId, groupId, submittedById: triggeringStudentId })
        .returning();
      if (!created) {
        throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create group submission');
      }
      existingGroupSub = created;
    } catch (e) {
      // Concurrent insert — retry the read.
      if (String(e).includes('group_submissions_assignment_group_idx')) {
        const [row] = await db
          .select()
          .from(groupSubmissions)
          .where(
            and(
              eq(groupSubmissions.assignmentId, assignmentId),
              eq(groupSubmissions.groupId, groupId),
            ),
          )
          .limit(1);
        if (!row) throw e;
        existingGroupSub = row;
      } else {
        throw e;
      }
    }
  }
  const groupSubmissionId = existingGroupSub.id;

  // 2. Fan out per-member assignment_submissions rows. Only insert for
  // members who don't yet have one for this assignment.
  const members = await db
    .select({ studentId: groupMemberships.studentId })
    .from(groupMemberships)
    .where(eq(groupMemberships.groupId, groupId));
  const memberIds = members.map((m) => m.studentId);
  if (memberIds.length === 0) return groupSubmissionId;

  const existing = await db
    .select({
      id: assignmentSubmissions.id,
      studentId: assignmentSubmissions.studentId,
      groupSubmissionId: assignmentSubmissions.groupSubmissionId,
    })
    .from(assignmentSubmissions)
    .where(
      and(
        eq(assignmentSubmissions.assignmentId, assignmentId),
        inArray(assignmentSubmissions.studentId, memberIds),
      ),
    );
  const haveRow = new Set(existing.map((e) => e.studentId));
  const missing = memberIds.filter((id) => !haveRow.has(id));
  if (missing.length > 0) {
    await db
      .insert(assignmentSubmissions)
      .values(
        missing.map((studentId) => ({
          assignmentId,
          studentId,
          status: 'draft' as const,
          groupSubmissionId,
        })),
      );
  }

  // Link any pre-existing rows whose groupSubmissionId is missing or stale.
  // (Touching updatedAt on a no-op would be a needless write storm.)
  const needLink = existing.filter((e) => e.groupSubmissionId !== groupSubmissionId);
  if (needLink.length > 0) {
    await db
      .update(assignmentSubmissions)
      .set({ groupSubmissionId, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(assignmentSubmissions.assignmentId, assignmentId),
          inArray(
            assignmentSubmissions.id,
            needLink.map((e) => e.id),
          ),
        ),
      );
  }

  return groupSubmissionId;
}

/**
 * Resolve a student's row for a group-mode assignment against their group's
 * EXISTING group submission (never creates one — the group must have started
 * a submission for there to be anything to inherit). Used as a lazy repair
 * for members who joined the group after the submission fanned out: creates
 * (or links) their assignment_submissions row, inheriting the shared
 * status/submitted time — and, when the team is already graded, the shared
 * score and feedback. Never overwrites an existing score. Idempotent.
 *
 * Returns the student's row, or null when the student has no group or the
 * group has no submission yet.
 */
export async function syncStudentRowWithGroupSubmission(
  db: Db,
  assignment: { id: string; groupSetId: string },
  studentId: string,
): Promise<typeof assignmentSubmissions.$inferSelect | null> {
  const group = await findStudentGroupForAssignment(db, assignment.groupSetId, studentId);
  if (!group) return null;

  const [groupSub] = await db
    .select()
    .from(groupSubmissions)
    .where(
      and(
        eq(groupSubmissions.assignmentId, assignment.id),
        eq(groupSubmissions.groupId, group.groupId),
      ),
    )
    .limit(1);
  if (!groupSub) return null;

  // Teammate rows linked to the shared submission — a graded one (if any)
  // carries the canonical team grade (grades are identical across members).
  const siblings = await db
    .select()
    .from(assignmentSubmissions)
    .where(eq(assignmentSubmissions.groupSubmissionId, groupSub.id));
  const gradedSibling = siblings.find((s) => s.score !== null) ?? null;
  const anySibling = siblings.find((s) => s.studentId !== studentId) ?? null;

  const inheritedStatus =
    gradedSibling?.status ??
    anySibling?.status ??
    (groupSub.submittedAt ? ('submitted' as const) : ('draft' as const));
  const now = new Date().toISOString();
  const inheritedGrade = gradedSibling
    ? {
        score: gradedSibling.score,
        rawScore: gradedSibling.rawScore,
        latePenaltyPercent: gradedSibling.latePenaltyPercent,
        latePenaltyWaived: gradedSibling.latePenaltyWaived,
        feedback: gradedSibling.feedback,
        gradedAt: gradedSibling.gradedAt,
        gradedById: gradedSibling.gradedById,
      }
    : null;

  const [existing] = await db
    .select()
    .from(assignmentSubmissions)
    .where(
      and(
        eq(assignmentSubmissions.assignmentId, assignment.id),
        eq(assignmentSubmissions.studentId, studentId),
      ),
    )
    .limit(1);

  if (existing) {
    const isUngradedDraft = existing.score === null && existing.status === 'draft';
    if (existing.groupSubmissionId === groupSub.id && !isUngradedDraft) return existing;
    const patch: Record<string, unknown> = { groupSubmissionId: groupSub.id, updatedAt: now };
    // Pull an ungraded draft up to the team's shared state; never clobber a
    // row that already carries its own score.
    if (isUngradedDraft) {
      patch.status = inheritedStatus;
      patch.submittedAt = existing.submittedAt ?? groupSub.submittedAt;
      if (inheritedGrade) Object.assign(patch, inheritedGrade);
    }
    const [updated] = await db
      .update(assignmentSubmissions)
      .set(patch)
      .where(eq(assignmentSubmissions.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [created] = await db
    .insert(assignmentSubmissions)
    .values({
      assignmentId: assignment.id,
      studentId,
      groupSubmissionId: groupSub.id,
      status: inheritedStatus,
      submittedAt: groupSub.submittedAt,
      ...(inheritedGrade ?? {}),
    })
    .returning();
  return created ?? null;
}
