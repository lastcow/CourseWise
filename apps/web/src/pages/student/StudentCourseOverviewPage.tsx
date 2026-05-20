import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MarkdownView, stripMarkdown } from '@/components/ui/markdown';
import { AttendanceSignInDialog } from '@/components/AttendanceSignInDialog';
import {
  useCourse,
  useMaterialsList,
  useModulesList,
  useTodayAttendanceSession,
} from '@/lib/queries';
import type { MaterialSummary } from '@coursewise/shared';

function dismissKey(sessionId: string): string {
  return `attendance-dismissed:${sessionId}`;
}

export function StudentCourseOverviewPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const course = useCourse(id);
  const modules = useModulesList(id);
  const materials = useMaterialsList(id);
  const todayQ = useTodayAttendanceSession(id);
  const [signOpen, setSignOpen] = useState(false);

  useEffect(() => {
    const today = todayQ.data;
    if (!today) return;
    try {
      if (sessionStorage.getItem(dismissKey(today.session.id)) === '1') return;
    } catch {
      // sessionStorage unavailable (private mode, etc.) — fall through and open.
    }
    setSignOpen(true);
  }, [todayQ.data]);

  const onCloseSign = (): void => {
    setSignOpen(false);
    const today = todayQ.data;
    if (!today) return;
    try {
      sessionStorage.setItem(dismissKey(today.session.id), '1');
    } catch {
      // best-effort
    }
  };

  const byModule = useMemo(() => {
    const map = new Map<string, MaterialSummary[]>();
    for (const m of materials.data ?? []) {
      if (!m.moduleId) continue;
      const arr = map.get(m.moduleId) ?? [];
      arr.push(m);
      map.set(m.moduleId, arr);
    }
    return map;
  }, [materials.data]);

  if (course.isLoading) return <p>{t('common.loading')}</p>;
  if (!course.data) return <p>{t('common.error')}</p>;

  return (
    <div className="space-y-4">
      {todayQ.data ? (
        <AttendanceSignInDialog
          open={signOpen}
          onClose={onCloseSign}
          courseId={id}
          session={todayQ.data.session}
          alreadySigned={todayQ.data.alreadySigned}
        />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{course.data.title}</CardTitle>
          <CardDescription className="font-mono text-xs">{course.data.code}</CardDescription>
        </CardHeader>
        <CardContent>
          {course.data.description ? (
            <MarkdownView source={course.data.description} className="text-muted-foreground" />
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild>
              <Link to={`/student/courses/${id}/materials`}>{t('materials.title')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/student/courses/${id}/presentations`}>{t('presentations.title')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/student/courses/${id}/assignments`}>{t('assignments.title')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/student/courses/${id}/discussion`}>{t('discussion.title')}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('modules.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {modules.isLoading ? (
            <p>{t('common.loading')}</p>
          ) : !modules.data || modules.data.length === 0 ? (
            <p className="text-muted-foreground">{t('modules.empty')}</p>
          ) : (
            <div className="space-y-4">
              {modules.data.map((m) => {
                const mats = byModule.get(m.id) ?? [];
                return (
                  <div key={m.id} className="space-y-1.5 border-l-2 border-muted pl-3">
                    <div>
                      <div className="font-medium">{m.title}</div>
                      {m.description ? (
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {stripMarkdown(m.description)}
                        </p>
                      ) : null}
                    </div>
                    {mats.length === 0 ? null : (
                      <ul className="space-y-1">
                        {mats.map((mat) => (
                          <li key={mat.id} className="flex items-center gap-2 text-sm">
                            <span>{mat.title}</span>
                            <Badge variant="info">
                              {t(
                                `materials.kind${mat.sourceType.replace(/(^|_)(\w)/g, (_, _b, c: string) => c.toUpperCase())}`,
                              )}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
