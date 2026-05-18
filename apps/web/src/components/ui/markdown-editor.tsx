import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import type { ChangeEventHandler, KeyboardEventHandler, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bold,
  Code,
  FileCode,
  Heading,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownView } from './markdown';

type Mode = 'write' | 'preview';

export interface MarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  invalid?: boolean;
  minHeight?: number;
  className?: string;
  'aria-describedby'?: string;
  'aria-label'?: string;
}

export const MarkdownEditor = forwardRef<HTMLTextAreaElement, MarkdownEditorProps>(function MarkdownEditor(
  {
    value,
    onChange,
    id,
    required,
    disabled,
    placeholder,
    invalid,
    minHeight = 180,
    className,
    'aria-describedby': describedBy,
    'aria-label': ariaLabel,
  },
  ref,
) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('write');
  const taRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => taRef.current as HTMLTextAreaElement);

  const setSelectionAfterUpdate = (selStart: number, selEnd: number) => {
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(selStart, selEnd);
    });
  };

  const wrap = useCallback(
    (before: string, after: string = before, placeholderText = '') => {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = value.slice(start, end);
      const inner = selected || placeholderText;
      const next = value.slice(0, start) + before + inner + after + value.slice(end);
      onChange(next);
      const innerStart = start + before.length;
      setSelectionAfterUpdate(innerStart, innerStart + inner.length);
    },
    [value, onChange],
  );

  const linePrefix = useCallback(
    (prefix: string) => {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const sliceEnd = value.indexOf('\n', end);
      const blockEnd = sliceEnd === -1 ? value.length : sliceEnd;
      const block = value.slice(lineStart, blockEnd);
      const prefixed = block
        .split('\n')
        .map((line) => (line.startsWith(prefix) ? line : prefix + line))
        .join('\n');
      const next = value.slice(0, lineStart) + prefixed + value.slice(blockEnd);
      onChange(next);
      setSelectionAfterUpdate(lineStart, lineStart + prefixed.length);
    },
    [value, onChange],
  );

  const insertLink = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || t('editor.linkText');
    const urlPlaceholder = 'https://';
    const inserted = `[${selected}](${urlPlaceholder})`;
    const next = value.slice(0, start) + inserted + value.slice(end);
    onChange(next);
    const urlStart = start + selected.length + 3; // `[selected](`.length
    setSelectionAfterUpdate(urlStart, urlStart + urlPlaceholder.length);
  }, [value, onChange, t]);

  const insertCodeBlock = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const needLeadingNewline = start > 0 && value[start - 1] !== '\n';
    const needTrailingNewline = end < value.length && value[end] !== '\n';
    const before = (needLeadingNewline ? '\n' : '') + '```\n';
    const after = '\n```' + (needTrailingNewline ? '\n' : '');
    const inner = selected || 'code';
    const next = value.slice(0, start) + before + inner + after + value.slice(end);
    onChange(next);
    const innerStart = start + before.length;
    setSelectionAfterUpdate(innerStart, innerStart + inner.length);
  }, [value, onChange]);

  const onKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'b') {
      e.preventDefault();
      wrap('**', '**', t('editor.boldText'));
    } else if (key === 'i') {
      e.preventDefault();
      wrap('*', '*', t('editor.italicText'));
    } else if (key === 'k') {
      e.preventDefault();
      insertLink();
    }
  };

  const onTextChange: ChangeEventHandler<HTMLTextAreaElement> = (e) => {
    onChange(e.target.value);
  };

  const writeDisabled = disabled || mode === 'preview';

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        invalid && 'border-destructive focus-within:ring-destructive',
        disabled && 'opacity-50',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-input bg-muted/30 px-1 py-1">
        <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label={t('editor.toolbar')}>
          <ToolbarBtn onClick={() => wrap('**', '**', t('editor.boldText'))} disabled={writeDisabled} title={t('editor.bold') + ' (Ctrl+B)'} aria-label={t('editor.bold')}>
            <Bold className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => wrap('*', '*', t('editor.italicText'))} disabled={writeDisabled} title={t('editor.italic') + ' (Ctrl+I)'} aria-label={t('editor.italic')}>
            <Italic className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => linePrefix('## ')} disabled={writeDisabled} title={t('editor.heading')} aria-label={t('editor.heading')}>
            <Heading className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => linePrefix('- ')} disabled={writeDisabled} title={t('editor.bulletList')} aria-label={t('editor.bulletList')}>
            <List className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => linePrefix('1. ')} disabled={writeDisabled} title={t('editor.numberedList')} aria-label={t('editor.numberedList')}>
            <ListOrdered className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={insertLink} disabled={writeDisabled} title={t('editor.link') + ' (Ctrl+K)'} aria-label={t('editor.link')}>
            <LinkIcon className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => wrap('`', '`', 'code')} disabled={writeDisabled} title={t('editor.inlineCode')} aria-label={t('editor.inlineCode')}>
            <Code className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={insertCodeBlock} disabled={writeDisabled} title={t('editor.codeBlock')} aria-label={t('editor.codeBlock')}>
            <FileCode className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => linePrefix('> ')} disabled={writeDisabled} title={t('editor.quote')} aria-label={t('editor.quote')}>
            <Quote className="h-4 w-4" />
          </ToolbarBtn>
        </div>
        <div className="flex items-center gap-0.5" role="tablist" aria-label={t('editor.mode')}>
          <TabBtn active={mode === 'write'} onClick={() => setMode('write')} disabled={disabled}>
            {t('editor.write')}
          </TabBtn>
          <TabBtn active={mode === 'preview'} onClick={() => setMode('preview')} disabled={disabled}>
            {t('editor.preview')}
          </TabBtn>
        </div>
      </div>
      <textarea
        id={id}
        ref={taRef}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={onTextChange}
        onKeyDown={onKeyDown}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={cn(
          'block w-full resize-y border-0 bg-transparent px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed',
          mode === 'preview' && 'hidden',
        )}
        style={{ minHeight }}
      />
      {mode === 'preview' ? (
        <div className="overflow-auto px-3 py-2" style={{ minHeight }} role="tabpanel">
          {value.trim() ? (
            <MarkdownView source={value} />
          ) : (
            <p className="text-sm italic text-muted-foreground">{t('editor.nothingToPreview')}</p>
          )}
        </div>
      ) : null}
    </div>
  );
});

function ToolbarBtn({
  children,
  ...props
}: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return (
    <button
      type="button"
      className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      {...props}
    >
      {children}
    </button>
  );
}

function TabBtn({
  children,
  active,
  ...props
}: {
  children: ReactNode;
  active: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'rounded px-2 py-1 text-xs',
        active ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:bg-muted',
      )}
      {...props}
    >
      {children}
    </button>
  );
}
