import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CourseSectionHeader, ListSkeleton } from '@/components/course/CourseSectionHeader';
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
      <CourseSectionHeader title={t('attendance.myTitle')} count={list.data?.length} />
      {list.isLoading ? (
        <ListSkeleton />
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState icon={<UserCheck className="h-6 w-6" />} title={t('attendance.studentEmpty')} />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('attendance.sessionTitle')}</TableHead>
                <TableHead>{t('attendance.sessionDate')}</TableHead>
                <TableHead>{t('attendance.status')}</TableHead>
                <TableHead>{t('attendance.notes')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((row) => (
                <TableRow key={row.sessionId}>
                  <TableCell className="font-medium">{row.sessionTitle}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(row.sessionDate)}
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.notes ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
