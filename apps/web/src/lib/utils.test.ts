import { describe, expect, it } from 'vitest';
import { toDatetimeLocalValue } from './utils';

describe('toDatetimeLocalValue', () => {
  it('returns empty string for nullish / invalid input', () => {
    expect(toDatetimeLocalValue(null)).toBe('');
    expect(toDatetimeLocalValue(undefined)).toBe('');
    expect(toDatetimeLocalValue('')).toBe('');
    expect(toDatetimeLocalValue('not-a-date')).toBe('');
  });

  it('produces a zoneless datetime-local value', () => {
    expect(toDatetimeLocalValue('2026-06-08T08:20:00.000Z')).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
  });

  it('round-trips back to the same UTC instant when re-parsed as local (TZ-independent)', () => {
    // The box value is parsed as local on save (new Date(value).toISOString()),
    // so toDatetimeLocalValue → parse-as-local must recover the original instant.
    // This holds for any runner timezone because the offset shift is symmetric.
    for (const iso of [
      '2026-06-08T08:20:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2026-12-31T23:59:00.000Z',
    ]) {
      const boxValue = toDatetimeLocalValue(iso);
      expect(new Date(boxValue).toISOString()).toBe(iso);
    }
  });
});
