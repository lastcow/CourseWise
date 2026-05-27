import { describe, expect, it } from 'vitest';
import { categorize, groupByMonth, parseCommit, type ChangelogEntry } from './changelog';

const REPO = 'https://github.com/lastcow/CourseWise';

describe('categorize', () => {
  it('detects fixes', () => {
    expect(categorize('Fix: group submit no longer 409s')).toBe('fixed');
    expect(categorize('Revert broken migration')).toBe('fixed');
  });
  it('detects additions', () => {
    expect(categorize('Add password reset flow')).toBe('added');
    expect(categorize('New changelog page')).toBe('added');
  });
  it('falls back to improved', () => {
    expect(categorize('Roster: richer dialogs')).toBe('improved');
    expect(categorize('Student Modules: status panel')).toBe('improved');
  });
});

describe('parseCommit', () => {
  it('extracts the PR number and builds a PR url, stripping the suffix', () => {
    const e = parseCommit(
      { hash: 'abc', dateISO: '2026-05-27T10:00:00Z', subject: 'Password reset (#194)' },
      REPO,
    );
    expect(e).toMatchObject({
      title: 'Password reset',
      prNumber: 194,
      prUrl: `${REPO}/pull/194`,
      category: 'improved',
    });
  });

  it('handles commits with no PR reference', () => {
    const e = parseCommit({ hash: 'abc', dateISO: '2026-05-27T10:00:00Z', subject: 'Fix typo' }, REPO);
    expect(e).toMatchObject({ title: 'Fix typo', prNumber: null, prUrl: null, category: 'fixed' });
  });

  it('omits the PR url when no repo url is known', () => {
    const e = parseCommit({ hash: 'abc', dateISO: '2026-05-27T10:00:00Z', subject: 'Thing (#5)' }, null);
    expect(e?.prUrl).toBeNull();
    expect(e?.prNumber).toBe(5);
  });

  it.each(['Merge branch main', 'chore: deps', 'docs: readme', 'ci: tweak', 'wip stuff'])(
    'skips internal/noise commit %s',
    (subject) => {
      expect(parseCommit({ hash: 'h', dateISO: '2026-05-27T10:00:00Z', subject }, REPO)).toBeNull();
    },
  );

  it('skips empty subjects', () => {
    expect(parseCommit({ hash: 'h', dateISO: '2026-05-27T10:00:00Z', subject: '   ' }, REPO)).toBeNull();
  });
});

describe('groupByMonth', () => {
  const mk = (date: string, title: string): ChangelogEntry => ({
    hash: title,
    date,
    title,
    prNumber: null,
    prUrl: null,
    category: 'improved',
  });

  it('groups by calendar month, newest month first, preserving entry order', () => {
    const months = groupByMonth([
      mk('2026-05-27T10:00:00Z', 'may-late'),
      mk('2026-05-02T10:00:00Z', 'may-early'),
      mk('2026-04-15T10:00:00Z', 'april'),
    ]);
    expect(months.map((m) => m.key)).toEqual(['2026-05', '2026-04']);
    expect(months[0]!.entries.map((e) => e.title)).toEqual(['may-late', 'may-early']);
    expect(months[1]!.entries).toHaveLength(1);
  });

  it('returns an empty array for no entries', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});
