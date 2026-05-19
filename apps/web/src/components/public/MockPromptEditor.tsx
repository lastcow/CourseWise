import { FileText } from 'lucide-react';

const VARS = ['course.title', 'moduleSummary', 'wordTarget', 'language'];

export function MockPromptEditor(): JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-2xl shadow-black/5 ring-1 ring-black/5">
      <div className="border-b bg-gray-50/60 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          Admin · Prompt templates
        </div>
        <div className="mt-2 flex gap-1.5 text-[11px]">
          {['Reading material', 'Presentation', 'Assignment'].map((k, i) => (
            <span
              key={k}
              className={
                'rounded-full border px-2 py-0.5 ' +
                (i === 0
                  ? 'border-violet-300 bg-violet-50 text-violet-700'
                  : 'text-muted-foreground')
              }
            >
              {k}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_140px] gap-3 px-4 py-4 text-xs">
        <div>
          <div className="text-muted-foreground">System prompt</div>
          <pre className="mt-1.5 max-h-32 overflow-hidden rounded border bg-gray-50/60 p-2 font-mono text-[10px] leading-relaxed">
{`You are a curriculum-design
assistant for {{course.title}}.
Target length: {{wordTarget}}.
{{language}}`}
          </pre>
        </div>
        <div>
          <div className="text-muted-foreground">Variables</div>
          <ul className="mt-1.5 space-y-1">
            {VARS.map((v) => (
              <li key={v}>
                <code className="rounded border bg-gray-50/60 px-1.5 py-0.5 text-[10px]">{`{{${v}}}`}</code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
