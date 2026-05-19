import { GAMMA_MAX_INPUT_TEXT_CHARS } from '@coursewise/shared';

export interface MaterialForGamma {
  id: string;
  title: string;
  description: string | null;
  sourceType: 'upload' | 'external_link' | 'manual_text';
  content: string | null;
}

/**
 * Stitch a list of reading materials into one `inputText` string for Gamma:
 *
 *   manual_text   → `${title}\n\n${content}`
 *   upload        → `[Slide source: ${title} — ${description ?? 'attached file'}]`
 *   external_link → `[Slide source: ${title} — ${description ?? 'see link'}]`
 *
 * Sections are joined with `\n\n---\n\n`. The result is hard-capped to
 * `GAMMA_MAX_INPUT_TEXT_CHARS` so we stay below Gamma's 400_000 cap.
 *
 * Empty manual_text materials (no title AND no content) are filtered out; we
 * never send empty sections to Gamma.
 */
export function buildInputText(materials: MaterialForGamma[]): string {
  const parts: string[] = [];
  for (const m of materials) {
    if (m.sourceType === 'manual_text') {
      const title = m.title.trim();
      const body = (m.content ?? '').trim();
      if (!title && !body) continue;
      parts.push(body ? `${title}\n\n${body}` : title);
      continue;
    }
    const fallback = m.sourceType === 'upload' ? 'attached file' : 'see link';
    const note = m.description?.trim() ? m.description.trim() : fallback;
    parts.push(`[Slide source: ${m.title} — ${note}]`);
  }
  const joined = parts.join('\n\n---\n\n');
  return joined.length <= GAMMA_MAX_INPUT_TEXT_CHARS
    ? joined
    : joined.slice(0, GAMMA_MAX_INPUT_TEXT_CHARS);
}
