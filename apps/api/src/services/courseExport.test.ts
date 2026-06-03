import { describe, expect, it } from 'vitest';
import { exportObjectKey, sanitize } from './courseExport';

describe('sanitize', () => {
  it('strips path-unsafe characters and collapses whitespace', () => {
    expect(sanitize('Lab 1: Intro / Setup')).toBe('Lab 1_ Intro _ Setup');
    expect(sanitize('a/b\\c')).toBe('a_b_c');
  });
  it('falls back to "untitled" for empty/blank names', () => {
    expect(sanitize('   ')).toBe('untitled');
    expect(sanitize('')).toBe('untitled');
  });
  it('caps length at 80 chars', () => {
    expect(sanitize('x'.repeat(200)).length).toBe(80);
  });
});

describe('exportObjectKey', () => {
  it('builds a per-course export path', () => {
    expect(exportObjectKey('c1', 'j1')).toBe('courses/c1/exports/j1.zip');
  });
});
