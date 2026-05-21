import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAssignmentGroups, useGradingPolicy, useMyFinalGrade } from '@/lib/queries';

export function StudentGradePage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cid = courseId ?? null;
  const grade = useMyFinalGrade(cid);
  const policy = useGradingPolicy(cid);
  const groups = useAssignmentGroups(cid ?? undefined);

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
                    {grade.data.attendance ? (
                      <tr className="border-b last:border-0">
                        <td className="py-2 pr-3">{t('grading.weightAttendance')}</td>
                        <td className="py-2 pr-3 font-mono">
                          {grade.data.attendance.rate.toFixed(1)}
                        </td>
                        <td className="py-2 pr-3 font-mono">{grade.data.attendance.weight}</td>
                        <td className="py-2 pr-3 font-mono">
                          {grade.data.attendance.weighted.toFixed(2)}
                        </td>
                      </tr>
                    ) : null}
                    {grade.data.groups.map((g) => (
                      <tr key={g.groupId} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <div>{g.groupName}</div>
                          <div className="text-xs text-muted-foreground">
                            {g.itemsScored}/{g.itemCount} items scored
                          </div>
                        </td>
                        <td className="py-2 pr-3 font-mono">
                          {g.raw !== null ? g.raw.toFixed(1) : '—'}
                        </td>
                        <td className="py-2 pr-3 font-mono">{g.weight}</td>
                        <td className="py-2 pr-3 font-mono">{g.weighted.toFixed(2)}</td>
                      </tr>
                    ))}
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
              {(groups.data ?? []).map((g) => (
                <li key={g.id}>
                  {g.name}: <span className="font-mono">{g.weight}%</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
