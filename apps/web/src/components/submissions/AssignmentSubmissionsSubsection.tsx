import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ChevronRight, Search, Users } from 'lucide-react';
import type {
  AssignmentSummary,
  GroupSubmissionWithMembers,
  SubmissionStatus,
  SubmissionWithStudent,
} from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Pagination, usePageSlice } from '@/components/ui/pagination';
import {
  useAssignmentSubmissions,
  useAssignmentSubmissionsByGroup,
  useGradeSubmission,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import { InlineScoreField } from '@/components/grading/InlineScoreField';

const PAGE_SIZE = 10;

function statusVariant(s: SubmissionStatus): 'success' | 'warning' | 'info' | 'secondary' {
  if (s === 'graded') return 'success';
  if (s === 'late' || s === 'submitted') return 'warning';
  if (s === 'returned') return 'info';
  return 'secondary';
}

const statusLabel = (t: (k: string) => string, s: SubmissionStatus): string =>
  t(`submissions.status${s[0]!.toUpperCase()}${s.slice(1)}`);

// A group is graded as a unit, so the first member who actually submitted
// carries the canonical score/feedback/status; we grade through its id and the
// API fans the grade out to every teammate.
function groupRepresentative(g: GroupSubmissionWithMembers): SubmissionWithStudent | null {
  return g.members.find((m) => m.status !== 'draft') ?? g.members[0] ?? null;
}

// Grading invalidates the submissions list itself (via the mutation), but the
// list page's ungraded counts and the gradebook rollups also need a nudge.
function refreshAfterGrade(qc: QueryClient, courseId: string): void {
  void qc.invalidateQueries({ queryKey: ['assignments', courseId] });
  void qc.invalidateQueries({ queryKey: ['final-grades', courseId] });
}

function RosterSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}): JSX.Element {
  return (
    <div className="relative max-w-xs">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full bg-background pl-8"
      />
    </div>
  );
}

function Skeleton(): JSX.Element {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}

const Muted = ({ text }: { text: string }): JSX.Element => (
  <p className="px-1 py-3 text-sm text-muted-foreground">{text}</p>
);

/**
 * Submissions roster shown when an assignment row is expanded. Individual-mode
 * assignments list one row per student; group-mode assignments list one row per
 * group (graded as a unit) that expands again to a read-only member roster.
 * Scores auto-save inline; both views search + paginate.
 */
export function AssignmentSubmissionsSubsection({
  assignment,
}: {
  assignment: AssignmentSummary;
}): JSX.Element {
  return assignment.submissionMode === 'group' ? (
    <GroupSubmissionsList assignment={assignment} />
  ) : (
    <IndividualSubmissionsList assignment={assignment} />
  );
}

function IndividualSubmissionsList({ assignment }: { assignment: AssignmentSummary }): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const subs = useAssignmentSubmissions(assignment.id);
  const grade = useGradeSubmission(assignment.id);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const rows = useMemo(() => subs.data ?? [], [subs.data]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (s) =>
        s.student.name.toLowerCase().includes(term) ||
        s.student.email.toLowerCase().includes(term),
    );
  }, [rows, search]);
  const { slice } = usePageSlice(filtered, page, PAGE_SIZE);

  const onGrade = async (
    submissionId: string,
    score: number,
    feedback: string | null,
  ): Promise<void> => {
    await grade.mutateAsync({ id: submissionId, input: { score, feedback } });
    refreshAfterGrade(qc, assignment.courseId);
  };

  if (subs.isLoading) return <Skeleton />;
  if (subs.isError) return <Muted text={t('errors.internal')} />;
  if (rows.length === 0) return <Muted text={t('submissions.rosterEmpty')} />;

  return (
    <div className="space-y-2">
      <RosterSearch
        value={search}
        onChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder={t('submissions.rosterSearchStudents')}
      />
      {filtered.length === 0 ? (
        <Muted text={t('submissions.rosterNoMatch')} />
      ) : (
        <div className="overflow-hidden rounded-md border bg-card">
          <ul className="divide-y divide-border/70">
            {slice.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{s.student.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{s.student.email}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant={statusVariant(s.status)}>{statusLabel(t, s.status)}</Badge>
                  {assignment.maxScore != null ? (
                    <InlineScoreField
                      initial={s.score}
                      maxScore={assignment.maxScore}
                      onCommit={(score) => onGrade(s.id, score, s.feedback ?? null)}
                    />
                  ) : (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {s.score ?? '—'}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {filtered.length > PAGE_SIZE ? (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function GroupSubmissionsList({ assignment }: { assignment: AssignmentSummary }): JSX.Element {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const grouped = useAssignmentSubmissionsByGroup(assignment.id);
  const grade = useGradeSubmission(assignment.id);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const groups = useMemo(() => grouped.data?.groups ?? [], [grouped.data]);
  const ungrouped = useMemo(() => grouped.data?.ungroupedStudents ?? [], [grouped.data]);
  const term = search.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (!term) return groups;
    return groups.filter(
      (g) =>
        g.groupName.toLowerCase().includes(term) ||
        g.members.some(
          (m) =>
            m.student.name.toLowerCase().includes(term) ||
            m.student.email.toLowerCase().includes(term),
        ),
    );
  }, [groups, term]);
  const filteredUngrouped = useMemo(() => {
    if (!term) return ungrouped;
    return ungrouped.filter(
      (s) => s.name.toLowerCase().includes(term) || s.email.toLowerCase().includes(term),
    );
  }, [ungrouped, term]);
  const { slice } = usePageSlice(filteredGroups, page, PAGE_SIZE);

  const toggleGroup = (id: string): void =>
    setOpenGroups((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onGradeGroup = async (
    repId: string,
    score: number,
    feedback: string | null,
  ): Promise<void> => {
    await grade.mutateAsync({ id: repId, input: { score, feedback } });
    refreshAfterGrade(qc, assignment.courseId);
  };

  if (grouped.isLoading) return <Skeleton />;
  if (grouped.isError) return <Muted text={t('errors.internal')} />;
  if (groups.length === 0 && ungrouped.length === 0)
    return <Muted text={t('submissions.rosterEmpty')} />;

  const nothingMatches = filteredGroups.length === 0 && filteredUngrouped.length === 0;

  return (
    <div className="space-y-2">
      <RosterSearch
        value={search}
        onChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder={t('submissions.rosterSearchGroups')}
      />
      {nothingMatches ? <Muted text={t('submissions.rosterNoMatch')} /> : null}
      {filteredGroups.length > 0 ? (
        <div className="overflow-hidden rounded-md border bg-card">
          <ul className="divide-y divide-border/70">
            {slice.map((g) => (
              <GroupRow
                key={g.groupSubmissionId}
                group={g}
                maxScore={assignment.maxScore}
                open={openGroups.has(g.groupSubmissionId)}
                onToggle={() => toggleGroup(g.groupSubmissionId)}
                onGrade={onGradeGroup}
              />
            ))}
          </ul>
          {filteredGroups.length > PAGE_SIZE ? (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={filteredGroups.length}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      ) : null}
      {filteredUngrouped.length > 0 ? (
        <div className="overflow-hidden rounded-md border bg-card">
          <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('submissions.noSubmissionGroup')}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {filteredUngrouped.length}
            </span>
          </div>
          <ul className="divide-y divide-border/70">
            {filteredUngrouped.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm">{s.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{s.email}</div>
                </div>
                <Badge variant="secondary">{t('submissions.notSubmittedYet')}</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function GroupRow({
  group,
  maxScore,
  open,
  onToggle,
  onGrade,
}: {
  group: GroupSubmissionWithMembers;
  maxScore: number | null;
  open: boolean;
  onToggle: () => void;
  onGrade: (repId: string, score: number, feedback: string | null) => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  const rep = groupRepresentative(group);
  const status = rep?.status ?? 'draft';

  return (
    <li>
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? t('submissions.hideMembers') : t('submissions.showMembers')}
          className="flex min-w-0 items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
            aria-hidden
          />
          <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate text-sm font-medium">{group.groupName}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {t('submissions.memberCount', { count: group.members.length })}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          <Badge variant={statusVariant(status)}>{statusLabel(t, status)}</Badge>
          {maxScore != null && rep ? (
            <InlineScoreField
              initial={rep.score}
              maxScore={maxScore}
              onCommit={(score) => onGrade(rep.id, score, rep.feedback ?? null)}
            />
          ) : (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {rep?.score ?? '—'}
            </span>
          )}
        </div>
      </div>
      {open ? (
        <div className="border-t bg-muted/20 px-3 py-2 pl-9">
          <ul className="space-y-1">
            {group.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm">
                  {m.student.name}
                  <span className="text-xs text-muted-foreground"> · {m.student.email}</span>
                </span>
                <Badge variant={statusVariant(m.status)}>{statusLabel(t, m.status)}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">{t('submissions.groupGradeNote')}</p>
        </div>
      ) : null}
    </li>
  );
}
