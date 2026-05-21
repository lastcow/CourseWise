import { eq, sql } from 'drizzle-orm';
import {
  DEFAULT_GRADING_POLICY,
  DEFAULT_LETTER_GRADES,
  type GradingPolicySummary,
  type LetterGradeThreshold,
  type UpdateGradingPolicyInput,
} from '@coursewise/shared';
import type { Db } from '../db/client';
import { finalGrades, gradingPolicies } from '../db/schema';

export function defaultPolicyValues() {
  return {
    weightAttendance: DEFAULT_GRADING_POLICY.attendance,
  };
}

export function toGradingPolicySummary(
  row: typeof gradingPolicies.$inferSelect,
): GradingPolicySummary {
  const letters = Array.isArray(row.lettersJson)
    ? (row.lettersJson as LetterGradeThreshold[])
    : [...DEFAULT_LETTER_GRADES];
  return {
    id: row.id,
    courseId: row.courseId,
    weightAttendance: row.weightAttendance,
    letters,
    version: row.version,
    updatedById: row.updatedById ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function ensureGradingPolicy(
  db: Db,
  courseId: string,
): Promise<GradingPolicySummary> {
  const [existing] = await db
    .select()
    .from(gradingPolicies)
    .where(eq(gradingPolicies.courseId, courseId))
    .limit(1);
  if (existing) return toGradingPolicySummary(existing);
  const [created] = await db
    .insert(gradingPolicies)
    .values({
      courseId,
      ...defaultPolicyValues(),
      lettersJson: [...DEFAULT_LETTER_GRADES],
      version: 1,
    })
    .returning();
  if (!created) throw new Error('Failed to create grading policy');
  return toGradingPolicySummary(created);
}

export async function updateGradingPolicy(
  db: Db,
  courseId: string,
  input: UpdateGradingPolicyInput,
  updatedById: string,
): Promise<GradingPolicySummary> {
  await ensureGradingPolicy(db, courseId);
  const letters = input.letters ?? null;
  const now = new Date().toISOString();
  const [updated] = await db
    .update(gradingPolicies)
    .set({
      weightAttendance: input.weightAttendance,
      lettersJson: letters,
      version: sql`${gradingPolicies.version} + 1`,
      updatedById,
      updatedAt: now,
    })
    .where(eq(gradingPolicies.courseId, courseId))
    .returning();
  if (!updated) throw new Error('Failed to update grading policy');
  await db
    .update(finalGrades)
    .set({ isOutdated: true, updatedAt: now })
    .where(eq(finalGrades.courseId, courseId));
  return toGradingPolicySummary(updated);
}

export function computeLetterGrade(
  score: number,
  letters: LetterGradeThreshold[] = [...DEFAULT_LETTER_GRADES],
): string {
  const sorted = [...letters].sort((a, b) => b.minScore - a.minScore);
  for (const t of sorted) {
    if (score >= t.minScore) return t.letter;
  }
  return sorted[sorted.length - 1]?.letter ?? 'F';
}
