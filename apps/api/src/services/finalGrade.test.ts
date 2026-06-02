import { describe, expect, it } from 'vitest';
import { computeFinalScore, isItemPosted, isSessionStarted, rollUpSetScore } from './finalGrade';

describe('isSessionStarted', () => {
  const now = Date.parse('2026-05-29T12:00:00Z');
  it('includes sessions whose date has arrived', () => {
    expect(isSessionStarted('2026-05-29T11:59:00Z', now)).toBe(true);
    expect(isSessionStarted('2026-05-01T00:00:00Z', now)).toBe(true);
  });
  it('excludes sessions scheduled in the future (not started yet)', () => {
    expect(isSessionStarted('2026-05-29T12:01:00Z', now)).toBe(false);
    expect(isSessionStarted('2026-06-10T00:00:00Z', now)).toBe(false);
  });
});

describe('isItemPosted', () => {
  const now = Date.parse('2026-05-29T12:00:00Z');
  const past = '2026-05-01T00:00:00Z';
  const future = '2026-06-15T00:00:00Z';

  it('excludes drafts (not yet posted)', () => {
    expect(isItemPosted({ status: 'draft', startAt: null }, now)).toBe(false);
    expect(isItemPosted({ status: 'draft', startAt: past }, now)).toBe(false);
  });

  it('includes published items with no start date', () => {
    expect(isItemPosted({ status: 'published', startAt: null }, now)).toBe(true);
  });

  it('includes published items whose start date has passed', () => {
    expect(isItemPosted({ status: 'published', startAt: past }, now)).toBe(true);
  });

  it('excludes published items scheduled to start in the future', () => {
    expect(isItemPosted({ status: 'published', startAt: future }, now)).toBe(false);
  });

  it('keeps closed/archived items (they were posted and had their window)', () => {
    expect(isItemPosted({ status: 'closed', startAt: past }, now)).toBe(true);
    expect(isItemPosted({ status: 'archived', startAt: null }, now)).toBe(true);
  });

  it('treats discussions (no start field) as posted once not a draft', () => {
    expect(isItemPosted({ status: 'published', startAt: null }, now)).toBe(true);
    expect(isItemPosted({ status: 'draft', startAt: null }, now)).toBe(false);
  });
});

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

  it('attendance + groups share one 100% pool — proportional blend', () => {
    const r = computeFinalScore({
      groups: [
        {
          id: 'g1',
          name: 'HW',
          weight: 90,
          items: [{ id: 'i1', type: 'assignment', title: 'HW1', score: 80, max: 100 }],
        },
      ],
      attendance: { rate: 100, weight: 10 },
    });
    // (100×10 + 80×90) / (10 + 90) = 82
    expect(r.score).toBeCloseTo(82, 2);
  });

  it('attendance carries its share even when groups would have summed to 100 alone', () => {
    // Demonstrates the "attendance is part of the total" semantic: a teacher
    // configures attendance 10% and a single 90% group; attendance contributes
    // exactly 10% of the final score, not 10% of the residual.
    const r = computeFinalScore({
      groups: [
        {
          id: 'g1',
          name: 'HW',
          weight: 90,
          items: [{ id: 'i1', type: 'assignment', title: 'HW1', score: 50, max: 100 }],
        },
      ],
      attendance: { rate: 100, weight: 10 },
    });
    // (100×10 + 50×90) / 100 = 55
    expect(r.score).toBe(55);
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

  it('submitted-but-not-graded items (null score) are excluded from the group average', () => {
    const r = computeFinalScore({
      groups: [
        {
          id: 'g1',
          name: 'HW',
          weight: 100,
          items: [
            { id: 'i1', type: 'assignment', title: 'HW1 (graded)', score: 90, max: 100 },
            { id: 'i2', type: 'assignment', title: 'HW2 (submitted, ungraded)', score: null, max: 100 },
          ],
        },
      ],
      attendance: { rate: null, weight: 0 },
    });
    // Only the graded item counts: raw = 90, not (90+0)/2 = 45.
    expect(r.score).toBe(90);
    const g = r.groups[0]!;
    expect(g.itemsScored).toBe(1);
    expect(g.itemCount).toBe(2);
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

describe('rollUpSetScore', () => {
  it('average → mean of member percentages', () => {
    expect(rollUpSetScore('average', [85, 92, 78])).toBeCloseTo(85, 5);
  });

  it('highest → best member percentage (best-of)', () => {
    expect(rollUpSetScore('highest', [85, 92, 78])).toBe(92);
  });

  it('returns null when no member is scored', () => {
    expect(rollUpSetScore('average', [])).toBeNull();
    expect(rollUpSetScore('highest', [])).toBeNull();
  });
});

describe('computeFinalScore — assignment sets', () => {
  // A set is injected as a single item (type 'set') carrying its rolled-up
  // percentage. It must behave like one item in the category: counted once in
  // itemsScored, and member rows must NOT also be present (no double-count).
  it('a best-of set contributes one item equal to its rolled score', () => {
    const r = computeFinalScore({
      groups: [
        {
          id: 'g1',
          name: 'Labs',
          weight: 100,
          items: [
            {
              id: 's1',
              type: 'set',
              title: 'Lab Set',
              score: 92, // best-of(85,92,78), pre-rolled by buildAlgorithmInput
              max: 100,
              members: [
                { itemId: 'a1', itemType: 'assignment', title: 'Lab1', score: 85, max: 100 },
                { itemId: 'a2', itemType: 'assignment', title: 'Lab2', score: 92, max: 100 },
                { itemId: 'a3', itemType: 'assignment', title: 'Lab3', score: 78, max: 100 },
              ],
            },
            { id: 'a4', type: 'assignment', title: 'Lab Final', score: 88, max: 100 },
          ],
        },
      ],
      attendance: { rate: null, weight: 0 },
    });
    // Category mean of [92 (set), 88 (final)] = 90 — NOT diluted by the 3 members.
    expect(r.score).toBe(90);
    const g = r.groups[0]!;
    expect(g.itemCount).toBe(2);
    expect(g.itemsScored).toBe(2);
    expect(g.detail.find((d) => d.itemId === 's1')?.itemType).toBe('set');
  });

  it('an unscored set drops out of the category (null score, not counted)', () => {
    const r = computeFinalScore({
      groups: [
        {
          id: 'g1',
          name: 'Labs',
          weight: 100,
          items: [
            { id: 's1', type: 'set', title: 'Lab Set', score: null, max: 100, members: [] },
            { id: 'a4', type: 'assignment', title: 'Lab Final', score: 70, max: 100 },
          ],
        },
      ],
      attendance: { rate: null, weight: 0 },
    });
    expect(r.score).toBe(70); // only the scored final counts
    expect(r.groups[0]!.itemsScored).toBe(1);
  });
});
