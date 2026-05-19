import { describe, expect, it } from 'vitest';
import { interpolate } from './interpolate';

describe('interpolate', () => {
  it('replaces known variables', () => {
    expect(
      interpolate('Hi {{name}}, welcome to {{course.title}}.', {
        name: 'Ada',
        'course.title': 'CS 101',
      }),
    ).toBe('Hi Ada, welcome to CS 101.');
  });

  it('substitutes empty string for variables in the allowlist with empty values', () => {
    expect(interpolate('Tag: {{tag}}.', { tag: '' })).toBe('Tag: .');
  });

  it('leaves unknown variables out and warns', () => {
    const warnings: unknown[][] = [];
    const orig = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    try {
      expect(interpolate('{{ok}} / {{nope}}', { ok: 'A' })).toBe('A / ');
      expect(warnings.length).toBeGreaterThan(0);
      const flat = JSON.stringify(warnings);
      expect(flat).toMatch(/nope/);
    } finally {
      console.warn = orig;
    }
  });

  it('handles a variable appearing multiple times', () => {
    expect(interpolate('{{x}}-{{x}}-{{x}}', { x: '7' })).toBe('7-7-7');
  });

  it('returns the template unchanged when there are no placeholders', () => {
    expect(interpolate('plain text', { unused: 'value' })).toBe('plain text');
  });

  it('does not interpret dollar signs or backticks specially', () => {
    expect(interpolate('cost: ${{cost}}/1M', { cost: '3.00' })).toBe('cost: $3.00/1M');
  });
});
