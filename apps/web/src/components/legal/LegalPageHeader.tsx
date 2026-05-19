type Props = {
  title: string;
  summary: string;
  lastUpdated: string;
  version: string;
};

export function LegalPageHeader({ title, summary, lastUpdated, version }: Props): JSX.Element {
  return (
    <div className="border-b pb-6">
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">{summary}</p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Last updated: {lastUpdated}</span>
        <span>Version: {version}</span>
      </div>
    </div>
  );
}
