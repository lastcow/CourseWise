type Props = {
  title: string;
  summary: string;
  lastUpdated: string;
  version: string;
};

export function LegalPageHeader({ title, summary, lastUpdated, version }: Props): JSX.Element {
  return (
    <div className="not-prose border-b border-ink/10 pb-6">
      <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink md:text-4xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-ink-400">{summary}</p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-400">
        <span>Last updated: {lastUpdated}</span>
        <span>Version: {version}</span>
      </div>
    </div>
  );
}
