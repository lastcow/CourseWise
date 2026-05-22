import { describe, expect, it } from 'vitest';
import { gradientFor } from './courseGradient';

describe('gradientFor', () => {
  it('returns the same gradient for the same input', () => {
    expect(gradientFor('CS101')).toBe(gradientFor('CS101'));
  });

  it('returns a CSS linear-gradient string', () => {
    expect(gradientFor('SEE-2026-SUMMER')).toMatch(/^linear-gradient\(/);
  });

  it('is case-insensitive (CS101 === cs101)', () => {
    expect(gradientFor('CS101')).toBe(gradientFor('cs101'));
  });

  it('different codes map to gradients in the palette', () => {
    // At least a few different codes should produce different gradients.
    const codes = ['CS101', 'MATH200', 'HIST300', 'PHIL400', 'CHEM500', 'BIO600'];
    const gradients = new Set(codes.map(gradientFor));
    expect(gradients.size).toBeGreaterThan(1);
  });

  it('handles empty string without crashing', () => {
    expect(typeof gradientFor('')).toBe('string');
  });
});
