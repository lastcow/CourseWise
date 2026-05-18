import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { useMyAttendance } from '@/lib/queries';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function StudentAttendancePage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const list = useMyAttendance(courseId ?? null);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{t('attendance.myTitle')}</h2>
      {list.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState title={t('attendance.studentEmpty')} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('attendance.sessionsListTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">{t('attendance.sessionTitle')}</th>
                  <th>{t('attendance.sessionDate')}</th>
                  <th>{t('attendance.status')}</th>
                  <th>{t('attendance.notes')}</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((row) => (
                  <tr key={row.sessionId} className="border-t">
                    <td className="py-2">{row.sessionTitle}</td>
                    <td>{formatDate(row.sessionDate)}</td>
                    <td>
                      {row.status ? (
                        <Badge
                          variant={
                            row.status === 'present' || row.status === 'excused'
                              ? 'success'
                              : row.status === 'late'
                                ? 'secondary'
                                : 'destructive'
                          }
                        >
                          {t(`attendance.${row.status}`)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td>{row.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
