import { describe, expect, it } from 'vitest';
import {
  bulkMarkAttendanceSchema,
  createQuizQuestionSchema,
  createQuizSchema,
  forgotPasswordSchema,
  gradeQuizAnswerSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from './validators';

describe('registerSchema', () => {
  it('accepts a valid payload', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'hunter2hunter2',
      name: 'Alice',
      invitationCode: 'MGMT101-2026',
    });
    expect(result.success).toBe(true);
  });

  it('rejects short passwords', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'short',
      name: 'Alice',
      invitationCode: 'MGMT101-2026',
    });
    expect(result.success).toBe(false);
  });

  it('requires an invitation code', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'hunter2hunter2',
      name: 'Alice',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('rejects invalid emails', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'whatever',
    });
    expect(result.success).toBe(false);
  });

  it('defaults rememberMe to false when omitted', () => {
    const result = loginSchema.safeParse({ email: 'a@example.com', password: 'pw' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.rememberMe).toBe(false);
  });

  it('accepts rememberMe true', () => {
    const result = loginSchema.safeParse({
      email: 'a@example.com',
      password: 'pw',
      rememberMe: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.rememberMe).toBe(true);
  });
});

describe('M4 quiz validators', () => {
  it('createQuizSchema rejects empty title', () => {
    expect(createQuizSchema.safeParse({ title: '' }).success).toBe(false);
  });
  it('createQuizSchema accepts minimal payload', () => {
    expect(createQuizSchema.safeParse({ title: 'Midterm' }).success).toBe(true);
  });
  it('createQuizSchema bounds time limit', () => {
    expect(
      createQuizSchema.safeParse({ title: 'Q', timeLimitMinutes: 99999 }).success,
    ).toBe(false);
  });
  it('createQuizQuestionSchema requires options for choice types', () => {
    expect(
      createQuizQuestionSchema.safeParse({
        prompt: 'Pick one',
        type: 'single_choice',
        options: ['A'],
      }).success,
    ).toBe(false);
  });
  it('createQuizQuestionSchema accepts true_false without options', () => {
    expect(
      createQuizQuestionSchema.safeParse({
        prompt: 'Earth is round',
        type: 'true_false',
        correctAnswers: true,
      }).success,
    ).toBe(true);
  });
  it('createQuizQuestionSchema rejects invalid true_false correct answer', () => {
    expect(
      createQuizQuestionSchema.safeParse({
        prompt: '...',
        type: 'true_false',
        correctAnswers: 'maybe',
      }).success,
    ).toBe(false);
  });
  it('gradeQuizAnswerSchema requires non-negative points', () => {
    expect(gradeQuizAnswerSchema.safeParse({ pointsAwarded: -1 }).success).toBe(false);
    expect(gradeQuizAnswerSchema.safeParse({ pointsAwarded: 3 }).success).toBe(true);
  });
});

describe('M4 attendance validators', () => {
  it('bulkMarkAttendanceSchema accepts a valid roster', () => {
    expect(
      bulkMarkAttendanceSchema.safeParse({
        records: [
          { studentId: '00000000-0000-0000-0000-000000000001', status: 'present' },
          {
            studentId: '00000000-0000-0000-0000-000000000002',
            status: 'late',
            notes: 'arrived 10 min late',
          },
        ],
      }).success,
    ).toBe(true);
  });
  it('bulkMarkAttendanceSchema rejects unknown status', () => {
    expect(
      bulkMarkAttendanceSchema.safeParse({
        records: [
          { studentId: '00000000-0000-0000-0000-000000000001', status: 'sick' },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('lowercases + trims email', () => {
    expect(forgotPasswordSchema.parse({ email: '  A@B.COM ' })).toEqual({ email: 'a@b.com' });
  });
  it('rejects bad email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts token + 8+ char password', () => {
    expect(resetPasswordSchema.safeParse({ token: 'abc', password: 'longenough' }).success).toBe(true);
  });
  it('rejects short password', () => {
    expect(resetPasswordSchema.safeParse({ token: 'abc', password: 'short' }).success).toBe(false);
  });
  it('rejects empty token', () => {
    expect(resetPasswordSchema.safeParse({ token: '', password: 'longenough' }).success).toBe(false);
  });
});
