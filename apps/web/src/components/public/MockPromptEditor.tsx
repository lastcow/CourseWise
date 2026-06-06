import { FileText } from 'lucide-react';

const VARS = ['course.title', 'moduleSummary', 'wordTarget', 'language'];

export function MockPromptEditor(): JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl border border-ink/10 bg-paper shadow-warm-lg ring-1 ring-ink/5">
      <div className="border-b border-ink/10 bg-paper-200/70 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <FileText className="h-3.5 w-3.5" />
          Admin · Prompt templates
        </div>
        <div className="mt-2 flex gap-1.5 text-[11px]">
          {['Reading material', 'Presentation', 'Assignment'].map((k, i) => (
            <span
              key={k}
              className={
                'rounded-md border px-2 py-0.5 ' +
                (i === 0
                  ? 'border-evergreen-200 bg-evergreen-100 text-evergreen'
                  : 'border-transparent text-ink-400')
              }
            >
              {k}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 px-4 py-4 text-xs sm:grid-cols-[1fr_140px]">
        <div>
          <div className="text-ink-400">System prompt</div>
          <pre className="mt-1.5 max-h-32 overflow-hidden rounded border bg-paper-300 p-2 font-mono text-[10px] leading-relaxed">
{`You are a curriculum-design
assistant for {{course.title}}.
Target length: {{wordTarget}}.
{{language}}`}
          </pre>
        </div>
        <div>
          <div className="text-ink-400">Variables</div>
          <ul className="mt-1.5 space-y-1">
            {VARS.map((v) => (
              <li key={v}>
                <code className="rounded border bg-paper-300 px-1.5 py-0.5 text-[10px]">{`{{${v}}}`}</code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
