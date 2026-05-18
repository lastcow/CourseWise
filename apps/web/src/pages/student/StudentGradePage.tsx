import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGradingPolicy, useMyFinalGrade } from '@/lib/queries';

const CATEGORY_LABELS = {
  attendance: 'grading.weightAttendance',
  assignments: 'grading.weightAssignments',
  quizzes: 'grading.weightQuizzes',
  discussion: 'grading.weightDiscussion',
  finalProject: 'grading.weightFinalProject',
} as const;

export function StudentGradePage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cid = courseId ?? null;
  const grade = useMyFinalGrade(cid);
  const policy = useGradingPolicy(cid);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('grading.myGradeTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {grade.isLoading ? (
            <p>{t('common.loading')}</p>
          ) : !grade.data ? (
            <p className="text-sm text-muted-foreground">{t('grading.myGradePending')}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline gap-4">
                <span className="text-4xl font-semibold">{grade.data.score?.toFixed(1) ?? '—'}</span>
                {grade.data.letterGrade ? (
                  <Badge variant="success">{grade.data.letterGrade}</Badge>
                ) : null}
                {grade.data.isOutdated ? (
                  <Badge variant="secondary">{t('grading.outdated')}</Badge>
                ) : null}
              </div>
              {grade.data.teacherOverrideScore !== null ? (
                <div className="rounded-md border bg-muted/50 p-3 text-sm">
                  <div className="font-medium">
                    {t('grading.overrideApplied', {
                      score: grade.data.teacherOverrideScore.toFixed(1),
                    })}
                  </div>
                  {grade.data.teacherOverrideReason ? (
                    <p className="mt-1 text-muted-foreground">
                      {grade.data.teacherOverrideReason}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div>
                <h3 className="mb-2 text-sm font-medium">{t('grading.breakdown')}</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-3">{t('grading.category')}</th>
                      <th className="py-2 pr-3">{t('grading.raw')}</th>
                      <th className="py-2 pr-3">{t('grading.weight')}</th>
                      <th className="py-2 pr-3">{t('grading.weighted')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.entries(CATEGORY_LABELS) as [
                      keyof typeof CATEGORY_LABELS,
                      string,
                    ][]).map(([cat, label]) => {
                      const breakdown = grade.data?.categoryScores?.[cat];
                      return (
                        <tr key={cat} className="border-b last:border-0">
                          <td className="py-2 pr-3">{t(label)}</td>
                          <td className="py-2 pr-3 font-mono">
                            {breakdown?.raw !== null && breakdown?.raw !== undefined
                              ? breakdown.raw.toFixed(1)
                              : '—'}
                          </td>
                          <td className="py-2 pr-3 font-mono">{breakdown?.weight ?? '—'}</td>
                          <td className="py-2 pr-3 font-mono">
                            {breakdown !== undefined ? breakdown.weighted.toFixed(2) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {policy.data ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('grading.policyTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
              <li>
                {t('grading.weightAttendance')}:{' '}
                <span className="font-mono">{policy.data.weightAttendance}%</span>
              </li>
              <li>
                {t('grading.weightAssignments')}:{' '}
                <span className="font-mono">{policy.data.weightAssignments}%</span>
              </li>
              <li>
                {t('grading.weightQuizzes')}:{' '}
                <span className="font-mono">{policy.data.weightQuizzes}%</span>
              </li>
              <li>
                {t('grading.weightDiscussion')}:{' '}
                <span className="font-mono">{policy.data.weightDiscussion}%</span>
              </li>
              <li>
                {t('grading.weightFinalProject')}:{' '}
                <span className="font-mono">{policy.data.weightFinalProject}%</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
