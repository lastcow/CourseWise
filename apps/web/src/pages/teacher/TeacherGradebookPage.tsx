import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GraduationCap, Pencil } from 'lucide-react';
import type { FinalGradeSummary } from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { CourseSectionHeader, ListSkeleton } from '@/components/course/CourseSectionHeader';
import { Input, Label, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  downloadGradesCsv,
  useFinalGrades,
  useOverrideFinalGrade,
  useRecalculateFinalGrades,
} from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';

function StatTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warning';
}): JSX.Element {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          'mt-0.5 text-2xl font-semibold tabular-nums',
          tone === 'warning' ? 'text-amber-600' : 'text-foreground',
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function TeacherGradebookPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cid = courseId ?? '';
  const grades = useFinalGrades(cid || null);
  const recalculate = useRecalculateFinalGrades(cid);
  const override = useOverrideFinalGrade(cid);
  const toast = useToast();

  const [editing, setEditing] = useState<FinalGradeSummary | null>(null);
  const [draftScore, setDraftScore] = useState<string>('');
  const [draftReason, setDraftReason] = useState<string>('');

  async function onRecalc() {
    try {
      const res = await recalculate.mutateAsync();
      toast.push({
        title: t('grading.recalcDone', { count: res.updated }),
        tone: 'success',
      });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function onSaveOverride() {
    if (!editing) return;
    const trimmed = draftScore.trim();
    const score = trimmed === '' ? null : Number(trimmed);
    if (score !== null && (Number.isNaN(score) || score < 0 || score > 100)) {
      toast.push({ title: t('grading.overrideInvalid'), tone: 'error' });
      return;
    }
    try {
      await override.mutateAsync({
        id: editing.id,
        input: {
          teacherOverrideScore: score,
          teacherOverrideReason: draftReason.trim() || null,
        },
      });
      setEditing(null);
      toast.push({ title: t('grading.overrideSaved'), tone: 'success' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  const rows = useMemo(() => grades.data ?? [], [grades.data]);
  const stats = useMemo(() => {
    const scored = rows
      .map((g) => g.teacherOverrideScore ?? g.score)
      .filter((s): s is number => s !== null);
    const average =
      scored.length > 0 ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
    const outdated = rows.filter((g) => g.isOutdated).length;
    return { enrolled: rows.length, graded: scored.length, average, outdated };
  }, [rows]);

  return (
    <div className="space-y-4">
      <CourseSectionHeader
        title={t('grading.gradebookTitle')}
        count={grades.data?.length}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => downloadGradesCsv(cid)}>
              {t('grading.exportCsv')}
            </Button>
            <Button size="sm" onClick={onRecalc} disabled={recalculate.isPending}>
              {t('grading.recalculate')}
            </Button>
          </>
        }
      />
      {grades.isLoading ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-6 w-6" />}
          title={t('grading.gradebookEmpty')}
          description={t('grading.gradebookEmptyHint')}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label={t('grading.summaryEnrolled')} value={String(stats.enrolled)} />
              <StatTile
                label={t('grading.summaryGraded')}
                value={`${stats.graded}/${stats.enrolled}`}
              />
              <StatTile
                label={t('grading.summaryAverage')}
                value={stats.average !== null ? stats.average.toFixed(1) : '—'}
              />
              <StatTile
                label={t('grading.summaryOutdated')}
                value={String(stats.outdated)}
                tone={stats.outdated > 0 ? 'warning' : 'default'}
              />
            </div>
            <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t('grading.student')}</th>
                  <th className="px-3 py-2 font-medium">{t('grading.score')}</th>
                  <th className="px-3 py-2 font-medium">{t('grading.letter')}</th>
                  <th className="px-3 py-2 font-medium">{t('grading.override')}</th>
                  <th className="px-3 py-2 font-medium">{t('grading.status')}</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={g.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link
                        to={`/teacher/courses/${cid}/gradebook/${g.studentId}`}
                        className="font-medium hover:underline"
                      >
                        {g.studentName ?? '—'}
                      </Link>
                      <div className="text-xs text-muted-foreground">{g.studentEmail}</div>
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums">{g.score?.toFixed(1) ?? '—'}</td>
                    <td className="px-3 py-2 font-mono">{g.letterGrade ?? '—'}</td>
                    <td className="px-3 py-2 font-mono tabular-nums">
                      {g.teacherOverrideScore !== null
                        ? g.teacherOverrideScore.toFixed(1)
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {g.isOutdated ? (
                        <Badge variant="secondary">{t('grading.outdated')}</Badge>
                      ) : (
                        <Badge variant="success">{t('grading.current')}</Badge>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <ActionIconButton
                        size="sm"
                        icon={Pencil}
                        label={t('grading.editOverride')}
                        color="yellow"
                        onClick={() => {
                          setEditing(g);
                          setDraftScore(
                            g.teacherOverrideScore !== null
                              ? String(g.teacherOverrideScore)
                              : '',
                          );
                          setDraftReason(g.teacherOverrideReason ?? '');
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t('grading.overrideTitle')}
      >
        {editing ? (
          <div className="space-y-3">
            <div className="text-sm">
              {editing.studentName} —{' '}
              <span className="font-mono">{editing.score?.toFixed(1) ?? '—'}</span>
            </div>
            <Label className="space-y-1">
              <span>{t('grading.overrideScore')}</span>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={draftScore}
                onChange={(e) => setDraftScore(e.target.value)}
                placeholder={t('grading.overrideScorePlaceholder')}
              />
            </Label>
            <Label className="space-y-1">
              <span>{t('grading.overrideReason')}</span>
              <Textarea
                value={draftReason}
                onChange={(e) => setDraftReason(e.target.value)}
                rows={3}
              />
            </Label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={onSaveOverride} disabled={override.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
