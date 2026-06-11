import { describe, expect, it } from 'vitest';
import { TUTOR_MATERIAL_MAX_CHARS, buildTutorSystemPrompt } from './tutor';

const baseCtx = {
  courseTitle: 'Microeconomics',
  moduleTitle: 'Week 3',
  materialTitle: 'Supply and Demand',
  materialDescription: 'Core concepts',
  materialContent: '# Supply and Demand\nPrice elasticity measures responsiveness.',
  locale: 'en',
};

describe('buildTutorSystemPrompt', () => {
  it('embeds context and material between markers, not truncated', () => {
    const { prompt, truncated } = buildTutorSystemPrompt(baseCtx);
    expect(truncated).toBe(false);
    expect(prompt).toContain('Course: Microeconomics');
    expect(prompt).toContain('Module: Week 3');
    expect(prompt).toContain('===== BEGIN MATERIAL =====');
    expect(prompt).toContain('Price elasticity measures responsiveness.');
    expect(prompt).toContain('===== END MATERIAL =====');
    expect(prompt).not.toContain('[material truncated]');
  });

  it('clips oversized material at the head and marks truncation', () => {
    const { prompt, truncated } = buildTutorSystemPrompt({
      ...baseCtx,
      materialContent: 'A'.repeat(TUTOR_MATERIAL_MAX_CHARS + 500),
    });
    expect(truncated).toBe(true);
    expect(prompt).toContain('[material truncated]');
    expect(prompt).not.toContain('A'.repeat(TUTOR_MATERIAL_MAX_CHARS + 1));
  });

  it('substitutes (none) for null module and description', () => {
    const { prompt } = buildTutorSystemPrompt({
      ...baseCtx,
      moduleTitle: null,
      materialDescription: null,
    });
    expect(prompt).toContain('Module: (none)');
    expect(prompt).toContain('Material description: (none)');
  });
});
