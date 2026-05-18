import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

const renderers = {
  a: ({ ...props }: ComponentPropsWithoutRef<'a'>) => (
    <a {...props} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline" />
  ),
  h1: ({ ...props }: ComponentPropsWithoutRef<'h1'>) => (
    <h1 {...props} className="mt-3 mb-2 text-xl font-semibold" />
  ),
  h2: ({ ...props }: ComponentPropsWithoutRef<'h2'>) => (
    <h2 {...props} className="mt-3 mb-2 text-lg font-semibold" />
  ),
  h3: ({ ...props }: ComponentPropsWithoutRef<'h3'>) => (
    <h3 {...props} className="mt-2 mb-1 text-base font-semibold" />
  ),
  h4: ({ ...props }: ComponentPropsWithoutRef<'h4'>) => (
    <h4 {...props} className="mt-2 mb-1 text-sm font-semibold" />
  ),
  p: ({ ...props }: ComponentPropsWithoutRef<'p'>) => (
    <p {...props} className="my-2 leading-relaxed first:mt-0 last:mb-0" />
  ),
  ul: ({ ...props }: ComponentPropsWithoutRef<'ul'>) => (
    <ul {...props} className="my-2 list-disc space-y-1 pl-5" />
  ),
  ol: ({ ...props }: ComponentPropsWithoutRef<'ol'>) => (
    <ol {...props} className="my-2 list-decimal space-y-1 pl-5" />
  ),
  li: ({ ...props }: ComponentPropsWithoutRef<'li'>) => <li {...props} className="leading-relaxed" />,
  blockquote: ({ ...props }: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote
      {...props}
      className="my-2 border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground"
    />
  ),
  code: ({ className, ...props }: ComponentPropsWithoutRef<'code'>) => {
    const isBlock = typeof className === 'string' && className.startsWith('language-');
    if (isBlock) return <code {...props} className={cn('font-mono text-xs', className)} />;
    return <code {...props} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" />;
  },
  pre: ({ ...props }: ComponentPropsWithoutRef<'pre'>) => (
    <pre {...props} className="my-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs" />
  ),
  hr: ({ ...props }: ComponentPropsWithoutRef<'hr'>) => (
    <hr {...props} className="my-3 border-border" />
  ),
  table: ({ ...props }: ComponentPropsWithoutRef<'table'>) => (
    <div className="my-2 overflow-x-auto">
      <table {...props} className="w-full text-sm" />
    </div>
  ),
  th: ({ ...props }: ComponentPropsWithoutRef<'th'>) => (
    <th {...props} className="border-b border-border px-2 py-1 text-left font-medium" />
  ),
  td: ({ ...props }: ComponentPropsWithoutRef<'td'>) => (
    <td {...props} className="border-b border-border px-2 py-1" />
  ),
};

export function MarkdownView({
  source,
  className,
}: {
  source: string | null | undefined;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('text-sm text-foreground', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // skipHtml prevents raw HTML in the source from rendering — XSS-safe.
        skipHtml
        components={renderers}
      >
        {source ?? ''}
      </ReactMarkdown>
    </div>
  );
}

// Backwards-compatible alias used by older call sites.
export const Markdown = MarkdownView;

// Strip Markdown formatting to a single line of plain text for list/preview surfaces
// where rendered block elements would conflict with `line-clamp-*`.
export function stripMarkdown(source: string | null | undefined): string {
  if (!source) return '';
  return source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
