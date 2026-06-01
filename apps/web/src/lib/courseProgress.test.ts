import { describe, expect, it } from 'vitest';
import { courseTimeProgress } from './courseProgress';

const start = '2026-01-01T00:00:00.000Z';
const end = '2026-01-11T00:00:00.000Z'; // 10-day window

describe('courseTimeProgress', () => {
  it('returns null when either date is missing', () => {
    expect(courseTimeProgress(null, end)).toBeNull();
    expect(courseTimeProgress(start, null)).toBeNull();
    expect(courseTimeProgress(null, null)).toBeNull();
  });

  it('returns null for unparseable or non-positive windows', () => {
    expect(courseTimeProgress('not-a-date', end)).toBeNull();
    expect(courseTimeProgress(end, start)).toBeNull(); // end before start
    expect(courseTimeProgress(start, start)).toBeNull(); // zero-length
  });

  it('is 0 before the start and 100 after the end (clamped)', () => {
    expect(courseTimeProgress(start, end, Date.parse('2025-12-01T00:00:00.000Z'))).toBe(0);
    expect(courseTimeProgress(start, end, Date.parse('2026-02-01T00:00:00.000Z'))).toBe(100);
  });

  it('is 50 at the midpoint', () => {
    expect(courseTimeProgress(start, end, Date.parse('2026-01-06T00:00:00.000Z'))).toBe(50);
  });
});
