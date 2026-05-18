import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

export function Markdown({
  source,
  className,
}: {
  source: string | null | undefined;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('prose prose-sm max-w-none dark:prose-invert', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // skipHtml prevents raw HTML in the source from rendering — XSS-safe.
        skipHtml
      >
        {source ?? ''}
      </ReactMarkdown>
    </div>
  );
}
