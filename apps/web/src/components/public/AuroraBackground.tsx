/**
 * Absolute-positioned aurora mesh for use behind a hero section.
 * Requires a positioned (relative/absolute) ancestor; the component
 * forms its own stacking context via `isolate` so the blurs sit behind
 * sibling content without escaping the parent stack.
 */
export function AuroraBackground(): JSX.Element {
  return (
    <div
      className="pointer-events-none absolute inset-0 isolate overflow-hidden"
      aria-hidden
    >
      <div
        className="absolute -left-32 -top-40 h-[42rem] w-[42rem] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(124,58,237,0.55), rgba(124,58,237,0) 70%)',
        }}
      />
      <div
        className="absolute -right-24 top-24 h-[36rem] w-[36rem] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(6,182,212,0.55), rgba(6,182,212,0) 70%)',
        }}
      />
    </div>
  );
}
