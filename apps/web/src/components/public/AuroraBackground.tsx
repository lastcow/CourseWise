/**
 * Soft, warm editorial wash for use behind a hero section. Two low-opacity
 * radial blooms (evergreen + clay) over paper — a calm replacement for the old
 * violet/cyan "AI aurora". Requires a positioned ancestor; forms its own
 * stacking context via `isolate` so the blooms sit behind sibling content.
 */
export function AuroraBackground(): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 isolate overflow-hidden" aria-hidden>
      <div
        className="absolute -left-40 -top-48 h-[46rem] w-[46rem] rounded-full opacity-70 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(47,93,80,0.16), rgba(47,93,80,0) 70%)',
        }}
      />
      <div
        className="absolute -right-32 top-8 h-[40rem] w-[40rem] rounded-full opacity-70 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(180,98,63,0.12), rgba(180,98,63,0) 70%)',
        }}
      />
    </div>
  );
}
