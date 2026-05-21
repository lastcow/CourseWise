import { describe, expect, it } from 'vitest';
import { currentAcademicYear } from './ferpaAcknowledgment';

describe('currentAcademicYear', () => {
  it('treats Jan–Jun as the prior-year academic period', () => {
    expect(currentAcademicYear(new Date('2026-05-21T12:00:00Z'))).toBe('2025-2026');
    expect(currentAcademicYear(new Date('2026-01-02T00:00:00Z'))).toBe('2025-2026');
    expect(currentAcademicYear(new Date('2026-06-30T23:59:59Z'))).toBe('2025-2026');
  });

  it('rolls over on July 1 UTC', () => {
    expect(currentAcademicYear(new Date('2026-07-01T00:00:00Z'))).toBe('2026-2027');
    expect(currentAcademicYear(new Date('2026-12-31T23:59:59Z'))).toBe('2026-2027');
  });

  it('handles future years', () => {
    expect(currentAcademicYear(new Date('2030-08-15T12:00:00Z'))).toBe('2030-2031');
  });
});
