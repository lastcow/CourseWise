import type { MaterialSummary } from '@coursewise/shared';

/**
 * Best-effort filename slug: lowercase, hyphens, ASCII-ish. Keeps the
 * download named after the material so a student bulk-downloading lands
 * with recognizable files instead of "download.md (3)" etc.
 */
function slugify(s: string): string {
  const cleaned = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned || 'material';
}

/**
 * Compose a markdown document from a reading-material row. Used to
 * generate the on-the-fly download for materials that don't have a
 * stored file (manual_text and, when present, external_link).
 */
export function buildMaterialMarkdown(m: MaterialSummary): string {
  const parts: string[] = [`# ${m.title}`];
  if (m.description) parts.push('', m.description);
  if (m.externalUrl) parts.push('', `**Link:** <${m.externalUrl}>`);
  if (m.content) parts.push('', '---', '', m.content);
  return parts.join('\n');
}

/**
 * Trigger a browser-side download of the given content with the given
 * MIME type. Cleans up the temporary <a> + object URL afterward.
 */
export function triggerBrowserDownload(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation so Safari has time to fetch the blob before it disappears.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Generate a markdown file for the given material and trigger the
 * browser download. Filename is `<slug(title)>.md`.
 */
export function downloadMaterialAsMarkdown(m: MaterialSummary): void {
  triggerBrowserDownload(`${slugify(m.title)}.md`, buildMaterialMarkdown(m), 'text/markdown');
}
