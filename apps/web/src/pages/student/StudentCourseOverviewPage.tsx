import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCourse, useMaterialsList, useModulesList } from '@/lib/queries';
import type { MaterialSummary } from '@coursewise/shared';

export function StudentCourseOverviewPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const course = useCourse(id);
  const modules = useModulesList(id);
  const materials = useMaterialsList(id);

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
      <Card>
        <CardHeader>
          <CardTitle>{course.data.title}</CardTitle>
          <CardDescription className="font-mono text-xs">{course.data.code}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{course.data.description ?? '—'}</p>
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
                        <p className="text-sm text-muted-foreground">{m.description}</p>
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
