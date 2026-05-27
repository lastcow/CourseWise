import type {
  AssignmentSummary,
  DiscussionTopicSummary,
  QuizSummary,
} from '@coursewise/shared';

export type TaskKind = 'assignment' | 'quiz' | 'discussion';

/** A single to-do / upcoming entry rendered in the panel. */
export interface StudentTask {
  key: string;
  kind: TaskKind;
  to: string;
  title: string;
  /** ISO date this item is due / closes, or null when the source has none. */
  dueAt: string | null;
  /** i18n key (under `studentTasks`) for the status badge, or null for no badge. */
  statusKey: string | null;
  statusVariant: 'secondary' | 'destructive' | 'warning' | 'info';
}

/** Assignment submission states that count as "done" and drop off the to-do list. */
const DONE_SUBMISSION_STATUSES = new Set(['submitted', 'graded', 'late']);

export interface BuildStudentTasksArgs {
  courseId: string;
  assignments: AssignmentSummary[];
  quizzes: QuizSummary[];
  discussions: DiscussionTopicSummary[];
  /** Injectable clock for deterministic tests. */
  now?: number;
}

/**
 * Pure builder for the student's "to do & upcoming" list, scoped to one course.
 *
 * - Assignments: published items the student hasn't completed. Returned drafts
 *   and not-yet-submitted items are surfaced; overdue ones are flagged. Already
 *   submitted/graded/late submissions are dropped.
 * - Quizzes: published quizzes with a close date still in the future (the
 *   summary carries no per-student attempt state, so these are shown as
 *   upcoming deadlines rather than completion-aware to-dos).
 * - Discussions: published graded topics, shown as participation prompts (the
 *   summary exposes neither a due date nor per-student status).
 *
 * Dated items sort soonest-first; undated items (discussions) trail, by title.
 */
export function buildStudentTasks({
  courseId,
  assignments,
  quizzes,
  discussions,
  now = Date.now(),
}: BuildStudentTasksArgs): StudentTask[] {
  const tasks: StudentTask[] = [];

  for (const a of assignments) {
    if (a.status !== 'published') continue;
    const sub = a.mySubmission;
    if (sub && DONE_SUBMISSION_STATUSES.has(sub.status)) continue;

    const overdue = a.dueDate != null && Date.parse(a.dueDate) < now;
    let statusKey: string;
    let statusVariant: StudentTask['statusVariant'];
    if (sub?.status === 'returned') {
      statusKey = 'returned';
      statusVariant = 'warning';
    } else if (overdue) {
      statusKey = 'overdue';
      statusVariant = 'destructive';
    } else {
      statusKey = 'notSubmitted';
      statusVariant = 'secondary';
    }

    tasks.push({
      key: `assignment-${a.id}`,
      kind: 'assignment',
      to: `/student/courses/${courseId}/assignments/${a.id}`,
      title: a.title,
      dueAt: a.dueDate,
      statusKey,
      statusVariant,
    });
  }

  for (const q of quizzes) {
    if (q.status !== 'published') continue;
    const closeAt = q.endTime ?? q.untilDate;
    // No per-student attempt data here, so only surface quizzes that still
    // have an upcoming deadline; closed/past windows are dropped.
    if (closeAt == null || Date.parse(closeAt) < now) continue;
    tasks.push({
      key: `quiz-${q.id}`,
      kind: 'quiz',
      to: `/student/courses/${courseId}/quizzes/${q.id}`,
      title: q.title,
      dueAt: closeAt,
      statusKey: 'upcoming',
      statusVariant: 'info',
    });
  }

  for (const d of discussions) {
    if (d.status !== 'published' || !d.isGraded) continue;
    tasks.push({
      key: `discussion-${d.id}`,
      kind: 'discussion',
      to: `/student/courses/${courseId}/discussion/${d.id}`,
      title: d.title,
      dueAt: null,
      statusKey: null,
      statusVariant: 'secondary',
    });
  }

  return tasks.sort((x, y) => {
    if (x.dueAt && y.dueAt) return Date.parse(x.dueAt) - Date.parse(y.dueAt);
    if (x.dueAt) return -1;
    if (y.dueAt) return 1;
    return x.title.localeCompare(y.title);
  });
}
