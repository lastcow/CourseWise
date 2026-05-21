import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@coursewise/shared';
import type {
  GradebookAssignmentItem,
  GradebookAttendanceItem,
  GradebookDiscussionItem,
  GradebookQuizItem,
  GradebookStudentDetail,
  GroupScoreBreakdown,
} from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import { Input, Label } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  useBulkMarkAttendance,
  useGradeDiscussion,
  useGradeSubmission,
  useGradebookStudentDetail,
  useRecalculateFinalGrades,
} from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';

function formatNum(n: number | null | undefined, digits = 1): string {
  return n === null || n === undefined ? '—' : n.toFixed(digits);
}

function GroupSummary({
  group,
}: {
  group: GroupScoreBreakdown;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>
        {t('grading.raw')}:{' '}
        <span className="font-mono text-foreground">{formatNum(group.raw)}</span>
      </span>
      <span>
        {t('grading.weight')}:{' '}
        <span className="font-mono text-foreground">{group.weight}</span>
      </span>
      <span>
        {t('grading.weighted')}:{' '}
        <span className="font-mono text-foreground">{formatNum(group.weighted)}</span>
      </span>
      <span>
        {group.itemsScored}/{group.itemCount} items scored
      </span>
    </div>
  );
}

function AttendanceSummary({
  rollup,
}: {
  rollup: { raw: number | null; weight: number; weighted: number };
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>
        {t('grading.raw')}:{' '}
        <span className="font-mono text-foreground">{formatNum(rollup.raw)}</span>
      </span>
      <span>
        {t('grading.weight')}:{' '}
        <span className="font-mono text-foreground">{rollup.weight}</span>
      </span>
      <span>
        {t('grading.weighted')}:{' '}
        <span className="font-mono text-foreground">{formatNum(rollup.weighted)}</span>
      </span>
    </div>
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>{t('grading.detailTitle')}</CardTitle>
            <div className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{d.studentName}</span>{' '}
              · {d.studentEmail}
            </div>
          </div>
          <div className="flex gap-2">
            <Link to={`/teacher/courses/${cid}/gradebook`}>
              <Button variant="outline" size="sm">
                {t('grading.detailBack')}
              </Button>
            </Link>
            <Button size="sm" onClick={onRecalc} disabled={recalc.isPending}>
              {t('grading.detailRecalc')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">
                {t('grading.detailFinalScore')}
              </div>
              <div className="font-mono text-lg">
                {formatNum(d.finalGrade?.score ?? null)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                {t('grading.detailLetter')}
              </div>
              <div className="font-mono text-lg">{d.finalGrade?.letterGrade ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                {t('grading.override')}
              </div>
              <div className="font-mono text-lg">
                {formatNum(d.finalGrade?.teacherOverrideScore ?? null)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                {t('grading.status')}
              </div>
              <div>
                {d.finalGrade?.isOutdated ? (
                  <Badge variant="secondary">{t('grading.outdated')}</Badge>
                ) : (
                  <Badge variant="success">{t('grading.current')}</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">{t('grading.detailAttendanceTitle')}</CardTitle>
          <AttendanceSummary
            rollup={{
              raw: attendance?.rate ?? null,
              weight: attendance?.weight ?? d.gradingPolicy.weightAttendance,
              weighted: attendance?.weighted ?? 0,
            }}
          />
        </CardHeader>
        <CardContent>
          <AttendanceTable courseId={cid} items={d.attendance.items} onSaved={refreshAll} />
        </CardContent>
      </Card>

      {finalGroups.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t('grading.detailNoItems')}
          </CardContent>
        </Card>
      ) : (
        finalGroups.map((g) => (
          <GroupCard
            key={g.groupId}
            group={g}
            studentId={sid}
            courseId={cid}
            lookups={lookups}
            onSaved={refreshAll}
          />
        ))
      )}
    </div>
  );
}

function GroupCard({
  group,
  studentId,
  courseId,
  lookups,
  onSaved,
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
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{group.groupName}</CardTitle>
        <GroupSummary group={group} />
      </CardHeader>
      <CardContent>
        {group.detail.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('grading.detailNoItems')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3">{group.groupName}</th>
                  <th className="py-2 pr-3">{t('grading.score')}</th>
                  <th className="py-2 pr-3">{t('grading.detailMax')}</th>
                  <th className="py-2 pr-3">{t('grading.status')}</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {group.detail.map((item) => {
                  if (item.itemType === 'assignment') {
                    const a = lookups.assignments.get(item.itemId);
                    if (!a) return null;
                    return (
                      <AssignmentRow
                        key={`a-${item.itemId}`}
                        studentId={studentId}
                        item={a}
                        onSaved={onSaved}
                      />
                    );
                  }
                  if (item.itemType === 'quiz') {
                    const q = lookups.quizzes.get(item.itemId);
                    if (!q) return null;
                    return (
                      <QuizRow key={`q-${item.itemId}`} courseId={courseId} item={q} />
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
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
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
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3">{t('grading.detailAttendanceTitle')}</th>
            <th className="py-2 pr-3">{t('attendance.sessionDate')}</th>
            <th className="py-2 pr-3">{t('grading.status')}</th>
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
      <td className="py-2 pr-3">{item.title}</td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">
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
  item,
  onSaved,
}: {
  studentId: string;
  item: GradebookAssignmentItem;
  onSaved: () => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  const grade = useGradeSubmission(item.assignmentId);
  const toast = useToast();
  const [score, setScore] = useState<string>(
    item.score !== null ? String(item.score) : '',
  );
  const [feedback, setFeedback] = useState<string>(item.feedback ?? '');
  const canEdit = !!item.submissionId;
  const dirty = useMemo(() => {
    const current = item.score !== null ? String(item.score) : '';
    return score !== current || feedback !== (item.feedback ?? '');
  }, [score, feedback, item]);

  const onSave = async (): Promise<void> => {
    if (!item.submissionId) return;
    const trimmed = score.trim();
    if (trimmed === '') return;
    const n = Number(trimmed);
    if (Number.isNaN(n) || n < 0 || n > item.maxScore) {
      toast.push({ title: t('grading.detailScoreInvalid'), tone: 'error' });
      return;
    }
    try {
      await grade.mutateAsync({
        id: item.submissionId,
        input: { score: n, feedback: feedback || null },
      });
      await onSaved();
      toast.push({ title: t('grading.detailSavedScore'), tone: 'success' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  };

  return (
    <tr className="border-b align-top last:border-0">
      <td className="py-2 pr-3">
        <div>{item.title}</div>
        {item.feedback || canEdit ? (
          <Input
            className="mt-1 text-xs"
            placeholder={t('grading.detailFeedback')}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            disabled={!canEdit}
          />
        ) : null}
      </td>
      <td className="py-2 pr-3">
        <Input
          type="number"
          min={0}
          max={item.maxScore}
          step={0.5}
          className="w-24"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          placeholder={canEdit ? '' : t('grading.detailNoSubmission')}
          disabled={!canEdit}
        />
      </td>
      <td className="py-2 pr-3 font-mono text-muted-foreground">{item.maxScore}</td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">{item.status ?? '—'}</td>
      <td className="py-2 text-right">
        <Button size="sm" onClick={onSave} disabled={!canEdit || !dirty || grade.isPending}>
          {t('grading.detailSaveScore')}
        </Button>
      </td>
    </tr>
  );
}

// ------------------- Quiz row -------------------

function QuizRow({
  courseId,
  item,
}: {
  courseId: string;
  item: GradebookQuizItem;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-3">{item.title}</td>
      <td className="py-2 pr-3 font-mono">{formatNum(item.score)}</td>
      <td className="py-2 pr-3 font-mono text-muted-foreground">{item.maxScore ?? '—'}</td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">
        {item.attemptId ? item.status ?? '—' : t('grading.detailNoAttempt')}
      </td>
      <td className="py-2 text-right">
        {item.attemptId ? (
          <Link to={`/teacher/courses/${courseId}/quizzes/${item.quizId}/attempts`}>
            <Button size="sm" variant="outline">
              {t('grading.detailReviewQuiz')}
            </Button>
          </Link>
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
}: {
  studentId: string;
  item: GradebookDiscussionItem;
  onSaved: () => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  const grade = useGradeDiscussion(item.topicId);
  const toast = useToast();
  const [score, setScore] = useState<string>(
    item.score !== null ? String(item.score) : '',
  );
  const [feedback, setFeedback] = useState<string>(item.feedback ?? '');
  const dirty = useMemo(() => {
    const current = item.score !== null ? String(item.score) : '';
    return score !== current || feedback !== (item.feedback ?? '');
  }, [score, feedback, item]);

  const onSave = async (): Promise<void> => {
    const trimmed = score.trim();
    if (trimmed === '') return;
    const n = Number(trimmed);
    if (Number.isNaN(n) || n < 0 || n > item.maxScore) {
      toast.push({ title: t('grading.detailScoreInvalid'), tone: 'error' });
      return;
    }
    try {
      await grade.mutateAsync({
        studentId,
        input: { score: n, feedback: feedback || null },
      });
      await onSaved();
      toast.push({ title: t('grading.detailSavedScore'), tone: 'success' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  };

  return (
    <tr className="border-b align-top last:border-0">
      <td className="py-2 pr-3">
        <div>{item.title}</div>
        <Input
          className="mt-1 text-xs"
          placeholder={t('grading.detailFeedback')}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </td>
      <td className="py-2 pr-3">
        <Input
          type="number"
          min={0}
          max={item.maxScore}
          step={0.5}
          className="w-24"
          value={score}
          onChange={(e) => setScore(e.target.value)}
        />
      </td>
      <td className="py-2 pr-3 font-mono text-muted-foreground">{item.maxScore}</td>
      <td className="py-2 pr-3 text-xs text-muted-foreground">—</td>
      <td className="py-2 text-right">
        <Button size="sm" onClick={onSave} disabled={!dirty || grade.isPending}>
          {t('grading.detailSaveScore')}
        </Button>
      </td>
    </tr>
  );
}

// Silence the unused-imports warning for types used only as react-types.
void Label;
export type _GradebookStudentDetail = GradebookStudentDetail;
