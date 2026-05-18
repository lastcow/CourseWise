import { describe, expect, it } from 'vitest';
import { consecutiveAbsenceStreak } from './alertRules';
import {
  ALERT_RULES,
  createManualAlertSchema,
  resolveAlertSchema,
} from '@coursewise/shared';

describe('consecutiveAbsenceStreak', () => {
  it('returns the longest run of absent sessions', () => {
    expect(consecutiveAbsenceStreak(['present', 'absent', 'absent', 'present'])).toBe(2);
    expect(consecutiveAbsenceStreak(['absent', 'absent', 'absent', 'present', 'absent'])).toBe(3);
  });
  it('returns 0 when there are no absences', () => {
    expect(consecutiveAbsenceStreak(['present', 'late', 'excused'])).toBe(0);
  });
  it('treats null as a non-absence (no record yet)', () => {
    expect(consecutiveAbsenceStreak(['absent', null, 'absent'])).toBe(1);
  });
});

describe('ALERT_RULES constants', () => {
  it('attendance threshold is 70 percent', () => {
    expect(ALERT_RULES.attendance_low.threshold).toBe(0.7);
  });
  it('consecutive absences threshold is 2', () => {
    expect(ALERT_RULES.consecutive_absences.threshold).toBe(2);
  });
  it('late submissions threshold is 2', () => {
    expect(ALERT_RULES.late_submissions.threshold).toBe(2);
  });
  it('quiz average threshold is 60', () => {
    expect(ALERT_RULES.quiz_average_low.threshold).toBe(60);
  });
  it('inactivity is 7 days', () => {
    expect(ALERT_RULES.inactivity.days).toBe(7);
  });
});

describe('createManualAlertSchema', () => {
  it('accepts a minimal payload', () => {
    const r = createManualAlertSchema.safeParse({
      userId: '00000000-0000-0000-0000-000000000001',
      title: 'Pay attention to this',
    });
    expect(r.success).toBe(true);
  });
  it('rejects an empty title', () => {
    const r = createManualAlertSchema.safeParse({
      userId: '00000000-0000-0000-0000-000000000001',
      title: '',
    });
    expect(r.success).toBe(false);
  });
  it('rejects an unknown alert type', () => {
    const r = createManualAlertSchema.safeParse({
      userId: '00000000-0000-0000-0000-000000000001',
      type: 'not_a_real_type',
      title: 'Hello',
    });
    expect(r.success).toBe(false);
  });
});

describe('resolveAlertSchema', () => {
  it('defaults are not required', () => {
    expect(resolveAlertSchema.safeParse({}).success).toBe(true);
  });
  it('accepts an explicit dismissed', () => {
    const r = resolveAlertSchema.safeParse({ status: 'dismissed', resolutionNote: 'noise' });
    expect(r.success).toBe(true);
  });
  it('rejects an invalid status', () => {
    expect(resolveAlertSchema.safeParse({ status: 'open' }).success).toBe(false);
  });
});
