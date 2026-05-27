import { RAW_COMMITS, REPO_URL, type RawCommit } from './changelog.generated';

export type ChangelogCategory = 'added' | 'improved' | 'fixed';

export interface ChangelogEntry {
  hash: string;
  /** ISO timestamp of the commit. */
  date: string;
  /** Commit subject with the trailing ` (#123)` PR reference removed. */
  title: string;
  prNumber: number | null;
  prUrl: string | null;
  category: ChangelogCategory;
}

export interface ChangelogMonth {
  /** Sortable `YYYY-MM` key. */
  key: string;
  /** A representative ISO date in the month, for locale-aware formatting. */
  date: string;
  entries: ChangelogEntry[];
}

const PR_SUFFIX = /\s*\(#(\d+)\)\s*$/;
// Internal/noise commits that shouldn't appear on a public "what's new" page.
const SKIP = /^(merge\b|chore|ci[:(]|docs?[:(]|test[:(]|wip\b|bump\b|release\b)/i;

/** Bucket a commit subject into a coarse, user-facing category. */
export function categorize(title: string): ChangelogCategory {
  if (/^(fix|hotfix|bug|revert)\b|^fix:/i.test(title)) return 'fixed';
  if (/^(add|new|introduce|create|feat|launch)\b|^feat:/i.test(title)) return 'added';
  return 'improved';
}

/** Turn a raw git commit into a changelog entry, or null if it should be hidden. */
export function parseCommit(commit: RawCommit, repoUrl: string | null = REPO_URL): ChangelogEntry | null {
  const subject = (commit.subject ?? '').trim();
  if (!subject || SKIP.test(subject)) return null;
  const match = subject.match(PR_SUFFIX);
  const prNumber = match ? Number(match[1]) : null;
  const title = subject.replace(PR_SUFFIX, '').trim();
  if (!title) return null;
  return {
    hash: commit.hash,
    date: commit.dateISO,
    title,
    prNumber,
    prUrl: prNumber != null && repoUrl ? `${repoUrl}/pull/${prNumber}` : null,
    category: categorize(title),
  };
}

/** All visible changelog entries, newest first (git log order is preserved). */
export function getChangelog(): ChangelogEntry[] {
  return RAW_COMMITS.map((c) => parseCommit(c)).filter((e): e is ChangelogEntry => e !== null);
}

/** Group entries into months, newest month first; entries keep their order. */
export function groupByMonth(entries: ChangelogEntry[]): ChangelogMonth[] {
  const buckets = new Map<string, ChangelogEntry[]>();
  for (const entry of entries) {
    const d = new Date(entry.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const list = buckets.get(key);
    if (list) list.push(entry);
    else buckets.set(key, [entry]);
  }
  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, monthEntries]) => ({ key, date: monthEntries[0]!.date, entries: monthEntries }));
}
