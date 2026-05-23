import type { jsPDF } from 'jspdf';
import { stripMarkdown } from '@/components/ui/markdown';
import type { MaterialSummary } from '@coursewise/shared';

/**
 * Best-effort filename slug: lowercase, hyphens, ASCII-ish. Keeps the
 * download named after the material so a student bulk-downloading lands
 * with recognizable files instead of "download (3).pdf".
 */
function slugify(s: string): string {
  const cleaned = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned || 'material';
}

// A4 portrait, mm. Margins picked so each line wraps to roughly 80
// characters at the body font size, which reads comfortably.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;

/**
 * Render a single reading-material row to a PDF document. Title becomes
 * the heading, then optional description / external link, then the body
 * content rendered as plain text (markdown is stripped so the output is
 * selectable text rather than a flattened image).
 */
function buildMaterialPdf(JsPdfCtor: typeof jsPDF, m: MaterialSummary): jsPDF {
  const doc = new JsPdfCtor({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  // Title — bold, larger.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  const titleLines = doc.splitTextToSize(m.title, CONTENT_W);
  for (const line of titleLines) {
    y = guardPageBreak(doc, y, 8);
    doc.text(line, MARGIN, y);
    y += 8;
  }

  // Source / external link metadata — small, muted.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  if (m.externalUrl) {
    y = guardPageBreak(doc, y, 5);
    doc.text(`Link: ${m.externalUrl}`, MARGIN, y);
    y += 5;
  }
  doc.setTextColor(0);

  // Description block.
  if (m.description) {
    y += 4;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(m.description, CONTENT_W);
    for (const line of lines) {
      y = guardPageBreak(doc, y, 6);
      doc.text(line, MARGIN, y);
      y += 6;
    }
  }

  // Separator before body.
  if (m.content) {
    y += 4;
    y = guardPageBreak(doc, y, 2);
    doc.setDrawColor(180);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 6;

    // Body — strip markdown for selectable text. We keep paragraph
    // boundaries (double newlines) so the layout doesn't collapse.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const plain = stripMarkdown(m.content);
    const paragraphs = plain.split(/\n\s*\n/);
    for (const para of paragraphs) {
      const lines = doc.splitTextToSize(para.trim(), CONTENT_W);
      for (const line of lines) {
        y = guardPageBreak(doc, y, 6);
        doc.text(line, MARGIN, y);
        y += 6;
      }
      y += 3;
    }
  }

  return doc;
}

/**
 * Reserve `lineHeight` mm at the current cursor; if there isn't enough
 * room, push a new page and return the top margin so the caller can
 * resume rendering. Keeps content from clipping the page bottom.
 */
function guardPageBreak(doc: jsPDF, y: number, lineHeight: number): number {
  if (y + lineHeight <= PAGE_H - MARGIN) return y;
  doc.addPage();
  return MARGIN;
}

/**
 * Generate a PDF for the given material and trigger the browser
 * download. Filename is `<slug(title)>.pdf`. jspdf is dynamically
 * imported so it only enters the bundle when a user actually clicks
 * Download — keeps the Materials page initial load light.
 */
export async function downloadMaterialAsPdf(m: MaterialSummary): Promise<void> {
  const { jsPDF: JsPdfCtor } = await import('jspdf');
  const doc = buildMaterialPdf(JsPdfCtor, m);
  doc.save(`${slugify(m.title)}.pdf`);
}
