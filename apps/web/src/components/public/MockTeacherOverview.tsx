import { GraduationCap, Sparkles } from 'lucide-react';

export function MockTeacherOverview(): JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-2xl shadow-black/5 ring-1 ring-black/5">
      <div className="border-b bg-gray-50/60 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <GraduationCap className="h-3.5 w-3.5" />
          Teacher · Course overview
        </div>
        <div className="mt-1 text-base font-semibold">Introduction to Software Economics</div>
      </div>
      <div className="grid grid-cols-3 gap-3 px-4 py-4 text-xs">
        <div>
          <div className="text-muted-foreground">Enrollments</div>
          <div className="mt-1 text-lg font-semibold">128</div>
        </div>
        <div>
          <div className="text-muted-foreground">Modules</div>
          <div className="mt-1 text-lg font-semibold">14</div>
        </div>
        <div>
          <div className="text-muted-foreground">Materials</div>
          <div className="mt-1 text-lg font-semibold">42</div>
        </div>
      </div>
      <ul className="divide-y border-t text-sm">
        {[
          { title: 'Markets and prices', ai: false },
          { title: 'Supply and demand', ai: true },
          { title: 'Elasticity and welfare', ai: false },
        ].map((m) => (
          <li key={m.title} className="flex items-center justify-between px-4 py-2.5">
            <div className="truncate">{m.title}</div>
            {m.ai ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                <Sparkles className="h-3 w-3" /> AI draft
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
