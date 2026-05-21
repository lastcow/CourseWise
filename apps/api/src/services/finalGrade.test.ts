import { describe, expect, it } from 'vitest';
import { computeFinalScore } from './finalGrade';

describe('computeFinalScore', () => {
  it('returns null when there are no groups and no attendance data', () => {
    const r = computeFinalScore({ groups: [], attendance: { rate: null, weight: 0 } });
    expect(r.score).toBeNull();
  });

  it('one group, one fully-scored item, attendance weight 0 → score equals item percentage', () => {
    const r = computeFinalScore({
      groups: [
        {
          id: 'g1',
          name: 'Homework',
          weight: 100,
          items: [{ id: 'i1', type: 'assignment', title: 'HW1', score: 80, max: 100 }],
        },
      ],
      attendance: { rate: null, weight: 0 },
    });
    expect(r.score).toBe(80);
  });

  it('attendance 10% + group 90% blend', () => {
    const r = computeFinalScore({
      groups: [
        {
          id: 'g1',
          name: 'HW',
          weight: 100,
          items: [{ id: 'i1', type: 'assignment', title: 'HW1', score: 80, max: 100 }],
        },
      ],
      attendance: { rate: 100, weight: 10 },
    });
    // 100*0.1 + 80*0.9 = 82
    expect(r.score).toBeCloseTo(82, 2);
  });

  it('two groups, one fully scored, one with no items → null group skipped, remaining carries full weight', () => {
    const r = computeFinalScore({
      groups: [
        {
          id: 'g1',
          name: 'HW',
          weight: 60,
          items: [{ id: 'i1', type: 'assignment', title: 'HW1', score: 90, max: 100 }],
        },
        { id: 'g2', name: 'Quiz', weight: 40, items: [] },
      ],
      attendance: { rate: null, weight: 0 },
    });
    expect(r.score).toBe(90);
  });

  it('all groups null + attendance present → score equals attendance rate', () => {
    const r = computeFinalScore({
      groups: [{ id: 'g1', name: 'HW', weight: 100, items: [] }],
      attendance: { rate: 95, weight: 10 },
    });
    expect(r.score).toBe(95);
  });

  it('multiple items in one group → group raw is the mean of item percentages', () => {
    const r = computeFinalScore({
      groups: [
        {
          id: 'g1',
          name: 'HW',
          weight: 100,
          items: [
            { id: 'i1', type: 'assignment', title: 'HW1', score: 80, max: 100 },
            { id: 'i2', type: 'assignment', title: 'HW2', score: 50, max: 100 },
          ],
        },
      ],
      attendance: { rate: null, weight: 0 },
    });
    expect(r.score).toBe(65);
  });
});
