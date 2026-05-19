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
    const big = 'x'.repeat(400_000);
    const out = buildInputText([
      {
        id: 'a',
        title: 't',
        description: null,
        sourceType: 'manual_text',
        content: big,
      },
    ]);
    expect(out.length).toBe(GAMMA_MAX_INPUT_TEXT_CHARS);
  });
});
