import { describe, expect, it } from 'vitest';
import { renderQuizScheduleOpenEmail } from './quizScheduleOpenEmail';

describe('renderQuizScheduleOpenEmail', () => {
  it('puts the quiz title in the subject', () => {
    const r = renderQuizScheduleOpenEmail({
      name: 'Ada',
      quizTitle: 'Midterm',
      courseTitle: 'CS101',
    });
    expect(r.subject).toBe('Your quiz is now open: Midterm');
  });

  it('mentions the wave name, course, and link in the text body', () => {
    const r = renderQuizScheduleOpenEmail({
      name: 'Ada',
      quizTitle: 'Midterm',
      courseTitle: 'CS101',
      scheduleName: 'Wave A',
      closesAt: '2026-06-01T23:00:00.000Z',
      link: '/student/courses/c1/quizzes/q1',
    });
    expect(r.text).toContain('Midterm');
    expect(r.text).toContain('CS101');
    expect(r.text).toContain('Wave A');
    expect(r.text).toContain('/student/courses/c1/quizzes/q1');
  });

  it('falls back to a friendly greeting and omits the button without a link', () => {
    const r = renderQuizScheduleOpenEmail({ name: '', quizTitle: 'Quiz', courseTitle: 'C' });
    expect(r.text).toContain('Hi there,');
    expect(r.html).not.toContain('Open the quiz</a>');
  });
});
