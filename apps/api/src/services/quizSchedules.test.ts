import { describe, expect, it } from 'vitest';
import { quizSchedules } from '../db/schema';
import { mergeWaveWindow, windowFromQuiz, type QuizWindowFields } from './quizSchedules';

type ScheduleRow = typeof quizSchedules.$inferSelect;

const QUIZ: QuizWindowFields = {
  startTime: '2026-06-01T09:00:00.000Z',
  endTime: '2026-06-01T23:00:00.000Z',
  untilDate: '2026-06-02T00:00:00.000Z',
  timeLimitMinutes: 60,
  maxAttempts: 1,
};

function wave(overrides: Partial<ScheduleRow>): ScheduleRow {
  return {
    id: 'wave-1',
    quizId: 'quiz-1',
    name: 'Wave A',
    position: 0,
    isRemainder: false,
    startTime: null,
    endTime: null,
    untilDate: null,
    timeLimitMinutes: null,
    maxAttempts: null,
    createdById: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('windowFromQuiz', () => {
  it('mirrors the quiz fields with a null scheduleId', () => {
    const w = windowFromQuiz(QUIZ);
    expect(w.scheduleId).toBeNull();
    expect(w.isRemainder).toBe(false);
    expect(w.startTime).toBe(QUIZ.startTime);
    expect(w.maxAttempts).toBe(1);
  });
});

describe('mergeWaveWindow', () => {
  it('inherits every quiz field when the wave sets none', () => {
    const w = mergeWaveWindow(QUIZ, wave({ id: 'w', name: 'A' }));
    expect(w.scheduleId).toBe('w');
    expect(w.name).toBe('A');
    expect(w.startTime).toBe(QUIZ.startTime);
    expect(w.endTime).toBe(QUIZ.endTime);
    expect(w.untilDate).toBe(QUIZ.untilDate);
    expect(w.timeLimitMinutes).toBe(60);
    expect(w.maxAttempts).toBe(1);
  });

  it('overrides only the fields the wave sets', () => {
    const w = mergeWaveWindow(
      QUIZ,
      wave({
        startTime: '2026-06-01T08:00:00.000Z',
        timeLimitMinutes: 30,
        maxAttempts: 3,
      }),
    );
    expect(w.startTime).toBe('2026-06-01T08:00:00.000Z'); // overridden
    expect(w.endTime).toBe(QUIZ.endTime); // inherited
    expect(w.timeLimitMinutes).toBe(30); // overridden
    expect(w.maxAttempts).toBe(3); // overridden
  });

  it('carries the remainder flag', () => {
    const w = mergeWaveWindow(QUIZ, wave({ isRemainder: true, name: 'The rest' }));
    expect(w.isRemainder).toBe(true);
  });

  it('keeps the quiz maxAttempts when the wave override is null', () => {
    const w = mergeWaveWindow({ ...QUIZ, maxAttempts: 2 }, wave({ maxAttempts: null }));
    expect(w.maxAttempts).toBe(2);
  });
});
