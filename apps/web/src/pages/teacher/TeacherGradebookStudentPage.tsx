import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@coursewise/shared';
import type {
  GradebookAssignmentItem,
  GradebookAttendanceItem,
  GradebookCategoryRollup,
  GradebookDiscussionItem,
  GradebookQuizItem,
  GradebookStudentDetail,
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

function RollupSummary({
  rollup,
}: {
  rollup: GradebookCategoryRollup;
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

      <CategoryCard
        title={t('grading.detailAttendanceTitle')}
        rollup={d.attendance}
      >
        <AttendanceTable courseId={cid} items={d.attendance.items} onSaved={refreshAll} />
      </CategoryCard>

      <CategoryCard
        title={t('grading.detailAssignmentsTitle')}
        rollup={d.assignments}
      >
        <AssignmentTable
          studentId={sid}
          items={d.assignments.items}
          onSaved={refreshAll}
        />
      </CategoryCard>

      <CategoryCard
        title={t('grading.detailFinalProjectTitle')}
        rollup={d.finalProject}
      >
        <AssignmentTable
          studentId={sid}
          items={d.finalProject.items}
          onSaved={refreshAll}
        />
      </CategoryCard>

      <CategoryCard title={t('grading.detailQuizzesTitle')} rollup={d.quizzes}>
        <QuizTable courseId={cid} items={d.quizzes.items} />
      </CategoryCard>

      <CategoryCard
        title={t('grading.detailDiscussionTitle')}
        rollup={d.discussion}
      >
        <DiscussionTable
          studentId={sid}
          items={d.discussion.items}
          onSaved={refreshAll}
        />
      </CategoryCard>
    </div>
  );
}

function CategoryCard({
  title,
  rollup,
  children,
}: {
  title: string;
  rollup: GradebookCategoryRollup;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{title}</CardTitle>
        <RollupSummary rollup={rollup} />
      </CardHeader>
      <CardContent>{children}</CardContent>
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

// ------------------- Assignment / Final project -------------------

function AssignmentTable({
  studentId,
  items,
  onSaved,
}: {
  studentId: string;
  items: GradebookAssignmentItem[];
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
            <th className="py-2 pr-3">{t('grading.detailAssignmentsTitle')}</th>
            <th className="py-2 pr-3">{t('grading.score')}</th>
            <th className="py-2 pr-3">{t('grading.detailMax')}</th>
            <th className="py-2 pr-3">{t('grading.status')}</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <AssignmentRow
              key={it.assignmentId}
              studentId={studentId}
              item={it}
              onSaved={onSaved}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

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

// ------------------- Quizzes -------------------

function QuizTable({
  courseId,
  items,
}: {
  courseId: string;
  items: GradebookQuizItem[];
}): JSX.Element {
  const { t } = useTranslation();
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('grading.detailNoItems')}</p>;
  }
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{t('grading.detailGradeQuizHint')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3">{t('grading.detailQuizzesTitle')}</th>
              <th className="py-2 pr-3">{t('grading.score')}</th>
              <th className="py-2 pr-3">{t('grading.detailMax')}</th>
              <th className="py-2 pr-3">{t('grading.status')}</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.quizId} className="border-b last:border-0">
                <td className="py-2 pr-3">{it.title}</td>
                <td className="py-2 pr-3 font-mono">{formatNum(it.score)}</td>
                <td className="py-2 pr-3 font-mono text-muted-foreground">
                  {it.maxScore ?? '—'}
                </td>
                <td className="py-2 pr-3 text-xs text-muted-foreground">
                  {it.attemptId ? it.status ?? '—' : t('grading.detailNoAttempt')}
                </td>
                <td className="py-2 text-right">
                  {it.attemptId ? (
                    <Link to={`/teacher/courses/${courseId}/quizzes/${it.quizId}/attempts`}>
                      <Button size="sm" variant="outline">
                        {t('grading.detailReviewQuiz')}
                      </Button>
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------- Discussion -------------------

function DiscussionTable({
  studentId,
  items,
  onSaved,
}: {
  studentId: string;
  items: GradebookDiscussionItem[];
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
            <th className="py-2 pr-3">{t('grading.detailDiscussionTitle')}</th>
            <th className="py-2 pr-3">{t('grading.score')}</th>
            <th className="py-2 pr-3">{t('grading.detailMax')}</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <DiscussionRow
              key={it.topicId}
              studentId={studentId}
              item={it}
              onSaved={onSaved}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
