import { Fragment, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck,
  CheckCircle2,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  FolderOpen,
  GraduationCap,
  Layers,
  ListChecks,
  PenLine,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@coursewise/shared';
import type {
  GradebookAssignmentItem,
  GradebookAttendanceItem,
  GradebookDiscussionItem,
  GradebookQuizItem,
  GroupScoreBreakdown,
  GroupScoreItem,
} from '@coursewise/shared';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import {
  ItemDetailDialog,
  type GradebookItemTarget,
} from '@/components/gradebook/ItemDetailDialog';
import {
  useBulkMarkAttendance,
  useGradeDiscussion,
  useGradeStudentScore,
  useGradeSubmission,
  useGradebookStudentDetail,
  useRecalculateFinalGrades,
  useZeroMissingScores,
} from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';

function formatNum(n: number | null | undefined, digits = 1): string {
  return n === null || n === undefined ? '—' : n.toFixed(digits);
}

// "Ungraded" means handed in and awaiting a grade. Items the student never
// submitted (or that sit in draft / an unfinished attempt) are not the
// teacher's queue, so they don't count toward the amber section badge.
type Lookups = {
  assignments: Map<string, GradebookAssignmentItem>;
  quizzes: Map<string, GradebookQuizItem>;
  discussions: Map<string, GradebookDiscussionItem>;
};

// "submitted" → submissions.statusSubmitted etc. (same convention as the
// submissions inbox).
function submissionStatusLabel(t: (k: string) => string, s: string): string {
  return t(`submissions.status${s[0]!.toUpperCase()}${s.slice(1)}`);
}

// Same color language as the rest of the grading surfaces: emerald = done,
// amber = waiting on the teacher, sky = handed back, gray = inert.
function submissionStatusVariant(s: string): 'success' | 'warning' | 'info' | 'secondary' {
  if (s === 'graded') return 'success';
  if (s === 'late' || s === 'submitted') return 'warning';
  if (s === 'returned') return 'info';
  return 'secondary';
}

// Hide the number input's spinner arrows — the score reads as "x / max" and
// the arrows just add noise next to the divider.
const SCORE_INPUT_CLASS =
  'w-20 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden';

function assignmentNeedsGrading(a: GradebookAssignmentItem): boolean {
  return !!a.submissionId && a.status !== 'draft' && a.score === null;
}

function quizNeedsGrading(q: GradebookQuizItem): boolean {
  if (!q.attemptId || q.status === 'in_progress') return false;
  return q.score === null || q.pendingReviewCount > 0;
}

function discussionNeedsGrading(d: GradebookDiscussionItem): boolean {
  return d.postCount > 0 && d.score === null;
}

function countUngraded(group: GroupScoreBreakdown, lookups: Lookups): number {
  let n = 0;
  const walk = (items: GroupScoreItem[]): void => {
    for (const it of items) {
      if (it.itemType === 'set') {
        walk(it.members ?? []);
      } else if (it.itemType === 'assignment') {
        const a = lookups.assignments.get(it.itemId);
        if (a && assignmentNeedsGrading(a)) n += 1;
      } else if (it.itemType === 'quiz') {
        const q = lookups.quizzes.get(it.itemId);
        if (q && quizNeedsGrading(q)) n += 1;
      } else {
        const d = lookups.discussions.get(it.itemId);
        if (d && discussionNeedsGrading(d)) n += 1;
      }
    }
  };
  walk(group.detail);
  return n;
}

/** Raw / weight / weighted chips shown inline in a section's trigger row. */
function RollupChips({
  raw,
  weight,
  weighted,
}: {
  raw: number | null;
  weight: number;
  weighted: number;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-normal text-muted-foreground">
      <span>
        {t('grading.raw')}:{' '}
        <span className="font-mono tabular-nums text-foreground">{formatNum(raw)}</span>
      </span>
      <span>
        {t('grading.weight')}:{' '}
        <span className="font-mono tabular-nums text-foreground">{weight}</span>
      </span>
      <span>
        {t('grading.weighted')}:{' '}
        <span className="font-mono tabular-nums text-foreground">{formatNum(weighted)}</span>
      </span>
    </span>
  );
}

/** Small labeled stat tile for the hero card (mirrors the grading pages). */
function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="rounded-md border bg-card p-3">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="mt-1 truncate text-base font-semibold tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

/** Badge pair for a section trigger: amber while work remains, emerald once done. */
function SectionStatusBadge({
  remaining,
  remainingKey,
  completeKey,
}: {
  remaining: number;
  remainingKey: string;
  completeKey: string;
}): JSX.Element {
  const { t } = useTranslation();
  return remaining > 0 ? (
    <Badge variant="warning">{t(remainingKey, { count: remaining })}</Badge>
  ) : (
    <Badge variant="success" className="gap-1">
      <CheckCircle2 className="h-3 w-3" aria-hidden />
      {t(completeKey)}
    </Badge>
  );
}

export function TeacherGradebookStudentPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId, studentId } = useParams();
  const cid = courseId ?? '';
  const sid = studentId ?? '';
  const detail = useGradebookStudentDetail(cid || null, sid || null);
  const recalc = useRecalculateFinalGrades(cid);
  const toast = useToast();
  const qc = useQueryClient();

  // Sections start collapsed; the trigger rows carry enough summary to scan.
  const [openSections, setOpenSections] = useState<string[]>([]);
  const [detailTarget, setDetailTarget] = useState<GradebookItemTarget | null>(null);
  const [zeroConfirm, setZeroConfirm] = useState(false);
  const zeroMissing = useZeroMissingScores();

  async function refreshAll(): Promise<void> {
    await qc.invalidateQueries({ queryKey: ['gradebook-student-detail', cid, sid] });
    await qc.invalidateQueries({ queryKey: ['final-grades', cid] });
  }

  async function onRecalc(): Promise<void> {
    try {
      await recalc.mutateAsync();
      await refreshAll();
      toast.push({ title: t('grading.recalcDone', { count: 1 }), tone: 'success' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  // Pool every editable item into lookup maps by item ID. The groups[] array
  // tells us the per-group structure; the lookup maps carry the editable
  // metadata (submission ID, status, feedback, etc.) the inline-edit
  // components need.
  const lookups = useMemo(() => {
    const assignments = new Map<string, GradebookAssignmentItem>();
    const quizzes = new Map<string, GradebookQuizItem>();
    const discussions = new Map<string, GradebookDiscussionItem>();
    if (detail.data) {
      for (const a of detail.data.assignments.items) assignments.set(a.assignmentId, a);
      for (const a of detail.data.finalProject.items) assignments.set(a.assignmentId, a);
      for (const q of detail.data.quizzes.items) quizzes.set(q.quizId, q);
      for (const d of detail.data.discussion.items) discussions.set(d.topicId, d);
    }
    return { assignments, quizzes, discussions };
  }, [detail.data]);

  if (detail.isLoading) {
    return <p className="p-4">{t('common.loading')}</p>;
  }
  if (!detail.data) {
    return (
      <EmptyState
        title={t('errors.notFound')}
        description={t('grading.gradebookEmpty')}
      />
    );
  }
  const d = detail.data;
  const finalGroups = d.finalGrade?.groups ?? [];
  const attendance = d.finalGrade?.attendance ?? null;
  const outdated = d.finalGrade?.isOutdated ?? false;
  const finalScore = d.finalGrade?.score ?? null;

  const allSectionIds = ['attendance', ...finalGroups.map((g) => g.groupId)];
  const allOpen = openSections.length === allSectionIds.length;
  const itemsScored = finalGroups.reduce((n, g) => n + g.itemsScored, 0);
  const itemCount = finalGroups.reduce((n, g) => n + g.itemCount, 0);
  const attendanceUnrecorded = d.attendance.items.filter((it) => !it.status).length;
  // Item scores the teacher entered without a submission (email/paper work).
  const overrideCount = [...d.assignments.items, ...d.finalProject.items].filter(
    (a) => a.score !== null && !a.submittedAt,
  ).length;
  // "Set missing to 0" targets: never handed in (no submission, or only a
  // draft) and not yet scored. Submitted-awaiting-grade and graded work is
  // deliberately untouched.
  const zeroTargets = [...d.assignments.items, ...d.finalProject.items].filter(
    (a) => a.score === null && (!a.submissionId || a.status === 'draft'),
  );

  return (
    <div className="space-y-4">
      {/* Hero: who + final grade at a glance */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5" aria-hidden />
              {t('grading.detailTitle')}
            </div>
            <h2 className="mt-1 truncate text-xl font-semibold leading-tight">{d.studentName}</h2>
            <div className="truncate text-sm text-muted-foreground">{d.studentEmail}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {outdated ? (
              <Badge variant="warning">{t('grading.outdated')}</Badge>
            ) : (
              <Badge variant="success">{t('grading.current')}</Badge>
            )}
            <Link to={`/teacher/courses/${cid}/gradebook`}>
              <Button variant="outline" size="sm">
                {t('grading.detailBack')}
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZeroConfirm(true)}
              disabled={zeroTargets.length === 0 || zeroMissing.isPending}
            >
              {t('grading.zeroMissingCta', { count: zeroTargets.length })}
            </Button>
            <Button size="sm" onClick={onRecalc} disabled={recalc.isPending}>
              {t('grading.detailRecalc')}
            </Button>
          </div>
        </div>
        <CardContent className="space-y-4 pt-5">
          <div>
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('grading.detailFinalScore')}
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tabular-nums">
                    {formatNum(finalScore)}
                  </span>
                  <span className="text-sm text-muted-foreground">/ 100</span>
                </div>
              </div>
              {/* The letter grade is the headline — largest element, end of row. */}
              {d.finalGrade?.letterGrade ? (
                <span className="shrink-0 text-6xl font-semibold leading-none tracking-tight">
                  {d.finalGrade.letterGrade}
                </span>
              ) : null}
            </div>
            <Progress
              value={finalScore ?? 0}
              className="mt-2 h-2"
              barClassName={outdated ? 'bg-amber-400' : 'bg-emerald-500'}
            />
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Fact
              icon={PenLine}
              label={t('grading.overrides')}
              value={String(overrideCount)}
            />
            <Fact
              icon={ListChecks}
              label={t('grading.detailItemsScored')}
              value={`${itemsScored} / ${itemCount}`}
            />
            <Fact
              icon={CalendarCheck}
              label={t('grading.attendanceRateLabel')}
              value={attendance?.rate != null ? `${formatNum(attendance.rate)}%` : '—'}
            />
          </dl>
        </CardContent>
      </Card>

      {/* Section list header: label + a single open/close-all toggle */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {t('grading.breakdown')}
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={allOpen}
          onClick={() => setOpenSections(allOpen ? [] : allSectionIds)}
        >
          {allOpen ? (
            <ChevronsDownUp className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronsUpDown className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          {allOpen ? t('grading.detailCollapseAll') : t('grading.detailExpandAll')}
        </Button>
      </div>

      <Accordion value={openSections} onValueChange={setOpenSections}>
        <AccordionItem value="attendance">
          <AccordionTrigger
            trailing={
              <>
                <SectionStatusBadge
                  remaining={attendanceUnrecorded}
                  remainingKey="grading.detailSectionUnrecorded"
                  completeKey="grading.detailAttendanceComplete"
                />
                <span className="text-sm font-semibold tabular-nums">
                  {t('grading.detailContributesPts', {
                    pts: formatNum(attendance?.weighted ?? 0),
                  })}
                </span>
              </>
            }
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-2 font-medium">
                <CalendarCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
                {t('grading.detailAttendanceTitle')}
              </span>
              <RollupChips
                raw={attendance?.rate ?? null}
                weight={attendance?.weight ?? d.gradingPolicy.weightAttendance}
                weighted={attendance?.weighted ?? 0}
              />
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <AttendanceTable courseId={cid} items={d.attendance.items} onSaved={refreshAll} />
          </AccordionContent>
        </AccordionItem>

        {finalGroups.map((g) => (
          <AccordionItem key={g.groupId} value={g.groupId}>
            <AccordionTrigger
              trailing={
                <>
                  <SectionStatusBadge
                    remaining={countUngraded(g, lookups)}
                    remainingKey="grading.detailSectionUngraded"
                    completeKey="grading.detailSectionComplete"
                  />
                  <span className="text-sm font-semibold tabular-nums">
                    {t('grading.detailContributesPts', { pts: formatNum(g.weighted) })}
                  </span>
                </>
              }
            >
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-2 font-medium">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {g.groupName}
                </span>
                <RollupChips raw={g.raw} weight={g.weight} weighted={g.weighted} />
                <span className="text-xs font-normal text-muted-foreground">
                  {t('grading.groupItemsScored', {
                    scored: g.itemsScored,
                    total: g.itemCount,
                  })}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <GroupItemsTable
                group={g}
                studentId={sid}
                courseId={cid}
                lookups={lookups}
                onSaved={refreshAll}
                onViewDetails={setDetailTarget}
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {finalGroups.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t('grading.detailNoItems')}
          </CardContent>
        </Card>
      ) : null}

      {detailTarget ? (
        <ItemDetailDialog target={detailTarget} onClose={() => setDetailTarget(null)} />
      ) : null}

      {/* Bulk zero confirm: only never-handed-in work (missing or draft). */}
      <Dialog
        open={zeroConfirm}
        onClose={() => setZeroConfirm(false)}
        title={t('grading.zeroMissingTitle')}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('grading.zeroMissingBody', { count: zeroTargets.length })}
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {zeroTargets.map((a) => (
              <li key={a.assignmentId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{a.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {a.submissionId ? t('submissions.statusDraft') : t('grading.detailNoSubmission')}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setZeroConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={zeroMissing.isPending}
              onClick={async () => {
                try {
                  const n = await zeroMissing.mutateAsync({
                    studentId: sid,
                    assignmentIds: zeroTargets.map((a) => a.assignmentId),
                  });
                  setZeroConfirm(false);
                  await refreshAll();
                  toast.push({ title: t('grading.zeroMissingDone', { count: n }), tone: 'success' });
                } catch (err) {
                  toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
                }
              }}
            >
              {t('grading.zeroMissingConfirm')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function GroupItemsTable({
  group,
  studentId,
  courseId,
  lookups,
  onSaved,
  onViewDetails,
}: {
  group: GroupScoreBreakdown;
  studentId: string;
  courseId: string;
  lookups: {
    assignments: Map<string, GradebookAssignmentItem>;
    quizzes: Map<string, GradebookQuizItem>;
    discussions: Map<string, GradebookDiscussionItem>;
  };
  onSaved: () => Promise<void>;
  onViewDetails: (target: GradebookItemTarget) => void;
}): JSX.Element {
  const { t } = useTranslation();
  if (group.detail.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('grading.detailNoItems')}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/20 text-left text-xs text-muted-foreground">
            <th className="py-2 pl-2 pr-3 font-medium">{group.groupName}</th>
            <th className="py-2 pr-3 font-medium">
              {t('grading.score')} / {t('grading.detailMax')}
            </th>
            <th className="py-2 pr-3 font-medium">{t('grading.status')}</th>
            <th className="py-2 pr-2"></th>
          </tr>
        </thead>
        <tbody>
          {group.detail.map((item) => {
            if (item.itemType === 'set') {
              // Read-only rolled-up row (this is what counts), followed by
              // the member assignments as indented, individually-editable rows.
              return (
                <Fragment key={`set-${item.itemId}`}>
                  <tr className="border-b bg-muted/30">
                    <td className="py-2 pl-2 pr-3 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
                        {item.title}
                      </span>
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {t('grading.setRowCounts')}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono tabular-nums">
                      {item.score !== null ? item.score.toFixed(1) : '—'}
                      <span className="text-muted-foreground"> / {item.max}</span>
                    </td>
                    <td className="py-2 pr-3" />
                    <td className="py-2 pr-2" />
                  </tr>
                  {(item.members ?? []).map((m) => {
                    // A set's members are either assignments or quizzes
                    // (quiz sets), each rendered indented under the
                    // rolled-up row. Quiz members are read-only (best
                    // attempt); assignment members stay inline-editable.
                    if (m.itemType === 'quiz') {
                      const q = lookups.quizzes.get(m.itemId);
                      if (!q) return null;
                      return (
                        <QuizRow
                          key={`q-${m.itemId}`}
                          courseId={courseId}
                          item={q}
                          onViewDetails={onViewDetails}
                          indent
                        />
                      );
                    }
                    const a = lookups.assignments.get(m.itemId);
                    if (!a) return null;
                    return (
                      <AssignmentRow
                        key={`a-${m.itemId}`}
                        studentId={studentId}
                        item={a}
                        onSaved={onSaved}
                        onViewDetails={onViewDetails}
                        indent
                      />
                    );
                  })}
                </Fragment>
              );
            }
            if (item.itemType === 'assignment') {
              const a = lookups.assignments.get(item.itemId);
              if (!a) return null;
              return (
                <AssignmentRow
                  key={`a-${item.itemId}`}
                  studentId={studentId}
                  item={a}
                  onSaved={onSaved}
                  onViewDetails={onViewDetails}
                />
              );
            }
            if (item.itemType === 'quiz') {
              const q = lookups.quizzes.get(item.itemId);
              if (!q) return null;
              return (
                <QuizRow
                  key={`q-${item.itemId}`}
                  courseId={courseId}
                  item={q}
                  onViewDetails={onViewDetails}
                />
              );
            }
            const dItem = lookups.discussions.get(item.itemId);
            if (!dItem) return null;
            return (
              <DiscussionRow
                key={`d-${item.itemId}`}
                studentId={studentId}
                item={dItem}
                onSaved={onSaved}
                onViewDetails={onViewDetails}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ------------------- Attendance -------------------

function AttendanceTable({
  courseId,
  items,
  onSaved,
}: {
  courseId: string;
  items: GradebookAttendanceItem[];
  onSaved: () => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('grading.detailNoItems')}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/20 text-left text-xs text-muted-foreground">
            <th className="py-2 pl-2 pr-3 font-medium">{t('grading.detailAttendanceTitle')}</th>
            <th className="py-2 pr-3 font-medium">{t('attendance.sessionDate')}</th>
            <th className="py-2 pr-3 font-medium">{t('grading.status')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <AttendanceRow
              key={it.sessionId}
              courseId={courseId}
              item={it}
              onSaved={onSaved}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttendanceRow({
  courseId,
  item,
  onSaved,
}: {
  courseId: string;
  item: GradebookAttendanceItem;
  onSaved: () => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  const { studentId } = useParams();
  const sid = studentId ?? '';
  const mark = useBulkMarkAttendance(item.sessionId, courseId);
  const toast = useToast();

  const onChange = async (next: AttendanceStatus): Promise<void> => {
    try {
      await mark.mutateAsync({
        records: [{ studentId: sid, status: next, notes: item.notes ?? null }],
      });
      await onSaved();
      toast.push({ title: t('grading.detailSavedScore'), tone: 'success' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  };

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pl-2 pr-3">{item.title}</td>
      <td className="py-2 pr-3 text-xs tabular-nums text-muted-foreground">
        {new Date(item.sessionDate).toLocaleDateString()}
      </td>
      <td className="py-2 pr-3">
        <select
          className="rounded border bg-background px-2 py-1 text-sm"
          value={item.status ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            void onChange(v as AttendanceStatus);
          }}
          disabled={mark.isPending}
        >
          <option value="" disabled>
            {t('grading.detailNoRecord')}
          </option>
          {ATTENDANCE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`grading.attStatus.${s}`)}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}

// ------------------- Assignment row -------------------

function AssignmentRow({
  studentId,
  item,
  onSaved,
  onViewDetails,
  indent,
}: {
  studentId: string;
  item: GradebookAssignmentItem;
  onSaved: () => Promise<void>;
  onViewDetails: (target: GradebookItemTarget) => void;
  indent?: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const grade = useGradeSubmission(item.assignmentId);
  const gradeDirect = useGradeStudentScore(item.assignmentId);
  const toast = useToast();
  const [score, setScore] = useState<string>(
    item.score !== null ? String(item.score) : '',
  );
  const dirty = useMemo(() => {
    const current = item.score !== null ? String(item.score) : '';
    return score !== current;
  }, [score, item]);

  const onSave = async (): Promise<void> => {
    const trimmed = score.trim();
    if (trimmed === '') return;
    const n = Number(trimmed);
    if (Number.isNaN(n) || n < 0 || n > item.maxScore) {
      toast.push({ title: t('grading.detailScoreInvalid'), tone: 'error' });
      return;
    }
    try {
      // Feedback is read in the details dialog and edited on the grading
      // page; pass the stored value through so a quick score save here
      // doesn't wipe it.
      if (item.submissionId) {
        await grade.mutateAsync({
          id: item.submissionId,
          input: { score: n, feedback: item.feedback ?? null },
        });
      } else {
        // No submission (work handed in by email/paper): the direct
        // grade-by-student endpoint creates the row and scores it.
        await gradeDirect.mutateAsync({
          studentId,
          input: { score: n, feedback: item.feedback ?? null },
        });
      }
      await onSaved();
      toast.push({ title: t('grading.detailSavedScore'), tone: 'success' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  };

  return (
    <tr className="border-b align-top last:border-0">
      <td className={cn('py-2 pl-2 pr-3', indent && 'pl-8')}>
        {/* First line of every cell centers within the h-10 input height so
            text, inputs, and buttons share one visual baseline. */}
        <div className="flex min-h-10 items-center gap-1.5">
          <span>{item.title}</span>
          {item.isGroup ? (
            <span
              className="inline-flex shrink-0 items-center text-muted-foreground"
              title={t('grading.groupSubmissionHint')}
            >
              <Users className="h-3.5 w-3.5" aria-label={t('grading.groupSubmissionHint')} />
            </span>
          ) : null}
        </div>
      </td>
      <td className="py-2 pr-3">
        <div className="flex h-10 items-center gap-1.5">
          <Input
            type="number"
            min={0}
            max={item.maxScore}
            step={0.5}
            className={SCORE_INPUT_CLASS}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder={item.submissionId ? '' : t('grading.detailNoSubmission')}
          />
          <span className="whitespace-nowrap font-mono tabular-nums text-muted-foreground">
            / {item.maxScore}
          </span>
        </div>
      </td>
      <td className="py-2 pr-3">
        <div className="flex h-10 items-center">
          {item.status ? (
            <Badge variant={submissionStatusVariant(item.status)}>
              {submissionStatusLabel(t, item.status)}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </td>
      <td className="py-2 pr-2 text-right">
        <div className="flex h-10 items-center justify-end gap-1.5">
          {item.submissionId ? (
            <ActionIconButton
              icon={Eye}
              size="sm"
              color="sky"
              label={t('grading.detailViewDetails')}
              onClick={() =>
                onViewDetails({
                  kind: 'assignment',
                  title: item.title,
                  submissionId: item.submissionId!,
                  maxScore: item.maxScore,
                })
              }
            />
          ) : null}
          <Button
            size="sm"
            onClick={onSave}
            disabled={!dirty || grade.isPending || gradeDirect.isPending}
          >
            {t('grading.detailSaveScore')}
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ------------------- Quiz row -------------------

function QuizRow({
  courseId,
  item,
  onViewDetails,
  indent,
}: {
  courseId: string;
  item: GradebookQuizItem;
  onViewDetails: (target: GradebookItemTarget) => void;
  indent?: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <tr className="border-b last:border-0">
      <td className={cn('py-2 pl-2 pr-3', indent && 'pl-8')}>{item.title}</td>
      <td className="py-2 pr-3 font-mono tabular-nums">
        {formatNum(item.score)}
        <span className="text-muted-foreground"> / {item.maxScore ?? '—'}</span>
      </td>
      <td className="py-2 pr-3">
        {item.attemptId && item.status ? (
          <Badge
            variant={
              item.status === 'submitted'
                ? item.pendingReviewCount > 0
                  ? 'warning'
                  : 'success'
                : item.status === 'in_progress'
                  ? 'warning'
                  : 'secondary'
            }
          >
            {t(`quizzes.attemptStatus.${item.status}`)}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            {item.attemptId ? '—' : t('grading.detailNoAttempt')}
          </span>
        )}
      </td>
      <td className="py-2 pr-2 text-right">
        {item.attemptId ? (
          <div className="flex items-center justify-end gap-1.5">
            <ActionIconButton
              icon={Eye}
              size="sm"
              color="sky"
              label={t('grading.detailViewDetails')}
              onClick={() =>
                onViewDetails({
                  kind: 'quiz',
                  title: item.title,
                  quizId: item.quizId,
                  attemptId: item.attemptId!,
                  courseId,
                })
              }
            />
            <Link to={`/teacher/courses/${courseId}/quizzes/${item.quizId}/attempts`}>
              <Button size="sm" variant="outline">
                {t('grading.detailReviewQuiz')}
              </Button>
            </Link>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

// ------------------- Discussion row -------------------

function DiscussionRow({
  studentId,
  item,
  onSaved,
  onViewDetails,
}: {
  studentId: string;
  item: GradebookDiscussionItem;
  onSaved: () => Promise<void>;
  onViewDetails: (target: GradebookItemTarget) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const grade = useGradeDiscussion(item.topicId);
  const toast = useToast();
  const [score, setScore] = useState<string>(
    item.score !== null ? String(item.score) : '',
  );
  const dirty = useMemo(() => {
    const current = item.score !== null ? String(item.score) : '';
    return score !== current;
  }, [score, item]);

  const onSave = async (): Promise<void> => {
    const trimmed = score.trim();
    if (trimmed === '') return;
    const n = Number(trimmed);
    if (Number.isNaN(n) || n < 0 || n > item.maxScore) {
      toast.push({ title: t('grading.detailScoreInvalid'), tone: 'error' });
      return;
    }
    try {
      // Pass stored feedback through so a score-only save doesn't wipe it.
      await grade.mutateAsync({
        studentId,
        input: { score: n, feedback: item.feedback ?? null },
      });
      await onSaved();
      toast.push({ title: t('grading.detailSavedScore'), tone: 'success' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  };

  return (
    <tr className="border-b align-top last:border-0">
      <td className="py-2 pl-2 pr-3">
        <div className="flex min-h-10 items-center">{item.title}</div>
      </td>
      <td className="py-2 pr-3">
        <div className="flex h-10 items-center gap-1.5">
          <Input
            type="number"
            min={0}
            max={item.maxScore}
            step={0.5}
            className={SCORE_INPUT_CLASS}
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
          <span className="whitespace-nowrap font-mono tabular-nums text-muted-foreground">
            / {item.maxScore}
          </span>
        </div>
      </td>
      <td className="py-2 pr-3">
        <div className="flex h-10 items-center">
          {item.postCount > 0 ? (
            item.score !== null ? (
              <Badge variant="success">{t('grading.graded')}</Badge>
            ) : (
              <Badge variant="warning">{t('grading.awaitingGrade')}</Badge>
            )
          ) : (
            <Badge variant="secondary">{t('grading.notSubmitted')}</Badge>
          )}
        </div>
      </td>
      <td className="py-2 pr-2 text-right">
        <div className="flex h-10 items-center justify-end gap-1.5">
          <ActionIconButton
            icon={Eye}
            size="sm"
            color="sky"
            label={t('grading.detailViewDetails')}
            onClick={() =>
              onViewDetails({
                kind: 'discussion',
                title: item.title,
                topicId: item.topicId,
                studentId,
                maxScore: item.maxScore,
                score: item.score,
                feedback: item.feedback,
              })
            }
          />
          <Button size="sm" onClick={onSave} disabled={!dirty || grade.isPending}>
            {t('grading.detailSaveScore')}
          </Button>
        </div>
      </td>
    </tr>
  );
}
