import { describe, expect, it } from 'vitest';
import { GAMMA_MAX_INPUT_TEXT_CHARS } from '@coursewise/shared';
import { buildInputText, type MaterialForGamma } from './buildInputText';

describe('buildInputText', () => {
  it('uses content for manual_text and a stub for non-manual', () => {
    const materials: MaterialForGamma[] = [
      {
        id: 'a',
        title: 'Chapter 1',
        description: null,
        sourceType: 'manual_text',
        content: 'hello world',
      },
      {
        id: 'b',
        title: 'Notes.pdf',
        description: 'syllabus',
        sourceType: 'upload',
        content: null,
      },
      {
        id: 'c',
        title: 'External',
        description: null,
        sourceType: 'external_link',
        content: null,
      },
    ];
    const out = buildInputText(materials);
    expect(out).toContain('Chapter 1\n\nhello world');
    expect(out).toContain('[Slide source: Notes.pdf — syllabus]');
    expect(out).toContain('[Slide source: External — see link]');
    expect(out.split('\n\n---\n\n').length).toBe(3);
  });

  it('uses "attached file" as the fallback description for uploads', () => {
    const out = buildInputText([
      {
        id: 'a',
        title: 'Slides.pdf',
        description: null,
        sourceType: 'upload',
        content: null,
      },
    ]);
    expect(out).toBe('[Slide source: Slides.pdf — attached file]');
  });

  it('truncates beyond GAMMA_MAX_INPUT_TEXT_CHARS', () => {
    // A single chunk with NO internal breaks (use a long upload stub) — the
    // slice can't back off to a boundary, so we get exactly the cap.
    const big = 'x'.repeat(400_000);
    const out = buildInputText([
      {
        id: 'a',
        title: 'doc',
        description: big,
        sourceType: 'upload',
        content: null,
      },
    ]);
    expect(out.length).toBe(GAMMA_MAX_INPUT_TEXT_CHARS);
  });

  it('backs truncation off to the last section boundary when possible', () => {
    // Two sections joined by `\n\n---\n\n`. The total exceeds the cap, so
    // truncation must kick in but should never leave us with a partial
    // separator at the end.
    const big = 'x'.repeat(GAMMA_MAX_INPUT_TEXT_CHARS - 100);
    const small = 'y'.repeat(2_000);
    const out = buildInputText([
      { id: 'a', title: 'First', description: null, sourceType: 'manual_text', content: big },
      { id: 'b', title: 'Second', description: null, sourceType: 'manual_text', content: small },
    ]);
    expect(out.length).toBeLessThanOrEqual(GAMMA_MAX_INPUT_TEXT_CHARS);
    // Output must not end with a partial separator.
    expect(out.endsWith('---')).toBe(false);
    expect(/\n\n-+$/.test(out)).toBe(false);
    // Output should still contain the first section's content.
    expect(out).toContain('First\n\n');
    expect(out).toContain('x'.repeat(100));
  });
});
