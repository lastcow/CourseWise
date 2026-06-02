import { describe, expect, it } from 'vitest';
import type {
  AssignmentSummary,
  DiscussionTopicSummary,
  QuizSummary,
  SubmissionStatus,
} from '@coursewise/shared';
import { buildStudentTasks } from './studentTasks';

const NOW = Date.parse('2026-05-27T12:00:00.000Z');
const FUTURE = '2026-06-10T12:00:00.000Z';
const PAST = '2026-05-01T12:00:00.000Z';

function assignment(over: Partial<AssignmentSummary> = {}): AssignmentSummary {
  return {
    id: 'a1',
    courseId: 'c1',
    moduleId: null,
    groupId: null,
    setId: null,
    title: 'Essay',
    description: null,
    dueDate: FUTURE,
    startDate: null,
    endDate: null,
    untilDate: null,
    maxScore: 100,
    rubric: null,
    allowLateSubmission: false,
    attachmentFileId: null,
    status: 'published',
    publishedAt: null,
    closedAt: null,
    archivedAt: null,
    position: 0,
    submissionMode: 'individual',
    groupSetId: null,
    mySubmission: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function sub(status: SubmissionStatus): AssignmentSummary['mySubmission'] {
  return { id: 's1', status, submittedAt: null, score: null };
}

function quiz(over: Partial<QuizSummary> = {}): QuizSummary {
  return {
    id: 'q1',
    courseId: 'c1',
    moduleId: null,
    groupId: null,
    title: 'Quiz 1',
    description: null,
    status: 'published',
    startTime: null,
    endTime: FUTURE,
    untilDate: null,
    timeLimitMinutes: null,
    maxAttempts: 1,
    maxScore: null,
    passingScore: null,
    publishedAt: null,
    closedAt: null,
    archivedAt: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function discussion(over: Partial<DiscussionTopicSummary> = {}): DiscussionTopicSummary {
  return {
    id: 'd1',
    courseId: 'c1',
    moduleId: null,
    groupId: null,
    title: 'Intro thread',
    description: null,
    status: 'published',
    isGraded: true,
    isPinned: false,
    maxScore: 10,
    publishedAt: null,
    archivedAt: null,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

const empty = { assignments: [], quizzes: [], discussions: [] };

describe('buildStudentTasks — assignments', () => {
  it('includes a not-yet-submitted published assignment with the soonest-due ordering', () => {
    const tasks = buildStudentTasks({
      courseId: 'c1',
      ...empty,
      assignments: [assignment()],
      now: NOW,
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      kind: 'assignment',
      to: '/student/courses/c1/assignments/a1',
      statusKey: 'notSubmitted',
      statusVariant: 'secondary',
    });
  });

  it('flags an overdue, unsubmitted assignment', () => {
    const tasks = buildStudentTasks({
      courseId: 'c1',
      ...empty,
      assignments: [assignment({ dueDate: PAST })],
      now: NOW,
    });
    expect(tasks[0]).toMatchObject({ statusKey: 'overdue', statusVariant: 'destructive' });
  });

  it('surfaces a returned submission as actionable, not overdue', () => {
    const tasks = buildStudentTasks({
      courseId: 'c1',
      ...empty,
      // Past due but returned -> returned wins over overdue.
      assignments: [assignment({ dueDate: PAST, mySubmission: sub('returned') })],
      now: NOW,
    });
    expect(tasks[0]).toMatchObject({ statusKey: 'returned', statusVariant: 'warning' });
  });

  it.each<SubmissionStatus>(['submitted', 'graded', 'late'])(
    'drops completed assignments (%s)',
    (status) => {
      const tasks = buildStudentTasks({
        courseId: 'c1',
        ...empty,
        assignments: [assignment({ mySubmission: sub(status) })],
        now: NOW,
      });
      expect(tasks).toHaveLength(0);
    },
  );

  it('drops unpublished assignments', () => {
    const tasks = buildStudentTasks({
      courseId: 'c1',
      ...empty,
      assignments: [assignment({ status: 'draft' })],
      now: NOW,
    });
    expect(tasks).toHaveLength(0);
  });
});

describe('buildStudentTasks — quizzes', () => {
  it('includes a published quiz that still has a future close date', () => {
    const tasks = buildStudentTasks({
      courseId: 'c1',
      ...empty,
      quizzes: [quiz()],
      now: NOW,
    });
    expect(tasks[0]).toMatchObject({
      kind: 'quiz',
      to: '/student/courses/c1/quizzes/q1',
      dueAt: FUTURE,
      statusKey: 'upcoming',
    });
  });

  it('falls back to untilDate when endTime is null', () => {
    const tasks = buildStudentTasks({
      courseId: 'c1',
      ...empty,
      quizzes: [quiz({ endTime: null, untilDate: FUTURE })],
      now: NOW,
    });
    expect(tasks[0]?.dueAt).toBe(FUTURE);
  });

  it('drops quizzes with no close date or a past close date', () => {
    const tasks = buildStudentTasks({
      courseId: 'c1',
      ...empty,
      quizzes: [
        quiz({ id: 'open', endTime: null, untilDate: null }),
        quiz({ id: 'closed', endTime: PAST }),
      ],
      now: NOW,
    });
    expect(tasks).toHaveLength(0);
  });
});

describe('buildStudentTasks — discussions', () => {
  it('includes published graded discussions with no due date/status', () => {
    const tasks = buildStudentTasks({
      courseId: 'c1',
      ...empty,
      discussions: [discussion()],
      now: NOW,
    });
    expect(tasks[0]).toMatchObject({
      kind: 'discussion',
      to: '/student/courses/c1/discussion/d1',
      dueAt: null,
      statusKey: null,
    });
  });

  it('drops ungraded or unpublished discussions', () => {
    const tasks = buildStudentTasks({
      courseId: 'c1',
      ...empty,
      discussions: [
        discussion({ id: 'ungraded', isGraded: false }),
        discussion({ id: 'draft', status: 'draft' }),
      ],
      now: NOW,
    });
    expect(tasks).toHaveLength(0);
  });
});

describe('buildStudentTasks — ordering', () => {
  it('sorts dated items soonest-first and trails undated discussions', () => {
    const tasks = buildStudentTasks({
      courseId: 'c1',
      assignments: [assignment({ id: 'later', dueDate: FUTURE })],
      quizzes: [quiz({ id: 'sooner', endTime: '2026-05-28T12:00:00.000Z' })],
      discussions: [discussion({ id: 'nodue' })],
      now: NOW,
    });
    expect(tasks.map((tk) => tk.key)).toEqual([
      'quiz-sooner',
      'assignment-later',
      'discussion-nodue',
    ]);
  });
});
