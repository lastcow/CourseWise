import { describe, expect, it } from 'vitest';
import { computeLetterGrade } from './gradingPolicy';
import { DEFAULT_LETTER_GRADES, updateGradingPolicySchema } from '@coursewise/shared';

describe('computeLetterGrade', () => {
  it('returns the correct default letter for ≥90', () => {
    expect(computeLetterGrade(95)).toBe('A');
    expect(computeLetterGrade(90)).toBe('A');
  });
  it('returns B/C/D for the standard bands', () => {
    expect(computeLetterGrade(89.999)).toBe('B');
    expect(computeLetterGrade(80)).toBe('B');
    expect(computeLetterGrade(75)).toBe('C');
    expect(computeLetterGrade(65)).toBe('D');
  });
  it('returns F for scores below the lowest threshold', () => {
    expect(computeLetterGrade(59.99)).toBe('F');
    expect(computeLetterGrade(0)).toBe('F');
  });
  it('handles a custom thresholds list', () => {
    const custom = [
      { letter: 'S', minScore: 95 },
      { letter: 'A', minScore: 85 },
      { letter: 'B', minScore: 75 },
      { letter: 'F', minScore: 0 },
    ];
    expect(computeLetterGrade(96, custom)).toBe('S');
    expect(computeLetterGrade(85, custom)).toBe('A');
    expect(computeLetterGrade(80, custom)).toBe('B');
    expect(computeLetterGrade(50, custom)).toBe('F');
  });
  it('defaults are exposed', () => {
    expect(DEFAULT_LETTER_GRADES.find((l) => l.letter === 'A')).toBeTruthy();
  });
});

describe('updateGradingPolicySchema', () => {
  it('accepts an attendance weight in range', () => {
    const r = updateGradingPolicySchema.safeParse({ weightAttendance: 10 });
    expect(r.success).toBe(true);
  });
  it('rejects a negative attendance weight', () => {
    const r = updateGradingPolicySchema.safeParse({ weightAttendance: -1 });
    expect(r.success).toBe(false);
  });
  it('accepts custom letters', () => {
    const r = updateGradingPolicySchema.safeParse({
      weightAttendance: 0,
      letters: [
        { letter: 'A', minScore: 90 },
        { letter: 'F', minScore: 0 },
      ],
    });
    expect(r.success).toBe(true);
  });
});
