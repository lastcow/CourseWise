import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import type { FinalGradeSummary } from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Input, Label, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  downloadGradesCsv,
  useFinalGrades,
  useOverrideFinalGrade,
  useRecalculateFinalGrades,
} from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';

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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('grading.gradebookTitle')}</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadGradesCsv(cid)}>
            {t('grading.exportCsv')}
          </Button>
          <Button onClick={onRecalc} disabled={recalculate.isPending}>
            {t('grading.recalculate')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {grades.isLoading ? (
          <p>{t('common.loading')}</p>
        ) : !grades.data || grades.data.length === 0 ? (
          <EmptyState
            title={t('grading.gradebookEmpty')}
            description={t('grading.gradebookEmptyHint')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">{t('grading.student')}</th>
                  <th className="py-2 pr-3">{t('grading.score')}</th>
                  <th className="py-2 pr-3">{t('grading.letter')}</th>
                  <th className="py-2 pr-3">{t('grading.override')}</th>
                  <th className="py-2 pr-3">{t('grading.status')}</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {grades.data.map((g) => (
                  <tr key={g.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{g.studentName ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{g.studentEmail}</div>
                    </td>
                    <td className="py-2 pr-3 font-mono">{g.score?.toFixed(1) ?? '—'}</td>
                    <td className="py-2 pr-3 font-mono">{g.letterGrade ?? '—'}</td>
                    <td className="py-2 pr-3 font-mono">
                      {g.teacherOverrideScore !== null
                        ? g.teacherOverrideScore.toFixed(1)
                        : '—'}
                    </td>
                    <td className="py-2 pr-3">
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
        )}
      </CardContent>
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
    </Card>
  );
}
