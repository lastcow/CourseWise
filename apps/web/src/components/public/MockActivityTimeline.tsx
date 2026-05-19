import { Activity } from 'lucide-react';

const ENTRIES = [
  { dot: 'bg-blue-500', label: 'Job started', meta: 'Starting reading-material generation for 1 module', ts: 'just now' },
  { dot: 'bg-blue-500', label: 'Context loaded', meta: 'Loaded course context (2,140 chars)', ts: '2s ago' },
  { dot: 'bg-blue-500', label: 'Calling model', meta: 'Calling claude-sonnet-4-5 for module "Supply and demand"', ts: '4s ago' },
];

export function MockActivityTimeline(): JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-2xl shadow-black/5 ring-1 ring-black/5">
      <div className="flex items-center justify-between border-b bg-gray-50/60 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          Activity
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" defaultChecked disabled aria-hidden tabIndex={-1} className="h-3 w-3 accent-blue-500 opacity-100" /> Show live activity
        </label>
      </div>
      <ul className="space-y-1.5 px-4 py-4 text-xs">
        {ENTRIES.map((e, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.dot}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{e.label}</span>
                <span className="text-muted-foreground">{e.meta}</span>
                <span className="ml-auto text-muted-foreground">{e.ts}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
