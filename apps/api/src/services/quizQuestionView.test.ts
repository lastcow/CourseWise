import { describe, expect, it } from 'vitest';
import type { quizQuestions } from '../db/schema';
import { toReviewQuestion, toStudentQuestion, toTeacherQuestion } from './quizQuestionView';

type Row = typeof quizQuestions.$inferSelect;

const row = {
  id: 'q1',
  quizId: 'qz1',
  position: 0,
  prompt: 'What is 2 + 2?',
  type: 'single_choice',
  options: ['3', '4', '5'],
  correctAnswers: [1],
  explanation: 'Teacher-only marking guide — never show students.',
  points: '2',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Row;

describe('quiz question views — explanation never leaks to students', () => {
  it('teacher view includes correct answers + explanation', () => {
    const v = toTeacherQuestion(row);
    expect(v.correctAnswers).toEqual([1]);
    expect(v.explanation).toBe('Teacher-only marking guide — never show students.');
  });

  it('live student view has no correct answers and no explanation field', () => {
    const v = toStudentQuestion(row);
    expect(v).not.toHaveProperty('correctAnswers');
    expect(v).not.toHaveProperty('explanation');
  });

  it('post-submission review reveals correct answers but NULLs the explanation', () => {
    const v = toReviewQuestion(row);
    expect(v.correctAnswers).toEqual([1]); // students may see what was correct
    expect(v.explanation).toBeNull(); // but never the explanation
  });
});
