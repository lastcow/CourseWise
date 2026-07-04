import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plug } from 'lucide-react';
import type { CanvasImportSummary, CanvasPushSummary, CanvasSyncRun } from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import {
  useCanvasConnection,
  useCanvasCourseLink,
  useCanvasCourses,
  useCanvasSyncRuns,
  useCourse,
  useLinkCanvasCourse,
  useStartCanvasImport,
  useStartCanvasPush,
} from '@/lib/queries';
import { CanvasCoursePicker } from '@/components/canvas/CanvasCoursePicker';

const statusVariant = (s: string): 'success' | 'warning' | 'destructive' | 'secondary' =>
  s === 'done' ? 'success' : s === 'failed' ? 'destructive' : 'warning';

export function TeacherCanvasSyncPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const course = useCourse(id || null);
  const connectionQ = useCanvasConnection();
  const linkQ = useCanvasCourseLink(id || null);
  const link = linkQ.data ?? null;
  // Only hit Canvas for the remote course list while the picker is on screen.
  const pickerOpen = !!connectionQ.data && linkQ.isSuccess && !link;
  const coursesQ = useCanvasCourses(pickerOpen);
  const runsQ = useCanvasSyncRuns(link ? id : null);
  const linkMutation = useLinkCanvasCourse(id);
  const startImport = useStartCanvasImport(id);
  const startPush = useStartCanvasPush(id);

  const [selectedId, setSelectedId] = useState('');

  // Canvas courses already linked to a CourseWise course drop out of the picker.
  const remoteCourses = useMemo(
    () => (coursesQ.data ?? []).filter((c) => !c.imported),
    [coursesQ.data],
  );
  const cwCode = course.data?.code.trim().toLowerCase() ?? '';
  const suggestion = useMemo(
    () =>
      cwCode
        ? (remoteCourses.find(
            (c) => (c.courseCode ?? '').trim().toLowerCase() === cwCode,
          ) ?? null)
        : null,
    [remoteCourses, cwCode],
  );

  // Preselect the code-matched Canvas course once the list arrives.
  useEffect(() => {
    if (suggestion && !selectedId) setSelectedId(suggestion.id);
  }, [suggestion, selectedId]);

  const runs = runsQ.data ?? [];
  const hasCompletedImport = runs.some((r) => r.status === 'done') || !!link?.importedAt;
  const importInFlight = runs.some((r) => r.status === 'pending' || r.status === 'running');
  // The stored token died mid-use (courses endpoint 409s) or the connection
  // row itself is flagged — both mean "reconnect in Settings".
  const coursesTokenDead =
    coursesQ.error instanceof ApiClientError && coursesQ.error.status === 409;
  const connectionDead =
    (connectionQ.data && connectionQ.data.status !== 'active') ||
    (link?.connectionStatus != null && link.connectionStatus !== 'active');

  const onLink = async (): Promise<void> => {
    if (!selectedId) return;
    try {
      await linkMutation.mutateAsync(selectedId);
      toast.push({ title: t('canvas.linked'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onImport = async (): Promise<void> => {
    const ok = await confirm({
      title: t('canvas.importConfirmTitle'),
      description: t('canvas.importConfirmBody'),
      confirmLabel: t('canvas.importCta'),
      tone: 'default',
    });
    if (!ok) return;
    try {
      await startImport.mutateAsync();
      toast.push({ title: t('canvas.importStarted'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onPush = async (): Promise<void> => {
    const ok = await confirm({
      title: t('canvas.pushConfirmTitle'),
      description: t('canvas.pushConfirmBody'),
      confirmLabel: t('canvas.pushCta'),
      tone: 'default',
    });
    if (!ok) return;
    try {
      await startPush.mutateAsync();
      toast.push({ title: t('canvas.pushStarted'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  if (connectionQ.isLoading || linkQ.isLoading) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  // a) No Canvas connection yet → send the teacher to personal settings.
  if (!connectionQ.data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('canvas.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('canvas.description')}</p>
        </div>
        <EmptyState
          icon={<Plug className="h-8 w-8" aria-hidden />}
          title={t('canvas.noConnectionTitle')}
          description={t('canvas.noConnectionBody')}
          action={
            <Button onClick={() => navigate('/settings/integrations')}>
              {t('canvas.goToSettings')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('canvas.title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('canvas.description')}</p>
      </div>

      {connectionDead || coursesTokenDead ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span>{t('canvas.reconnectNeeded')}</span>
          <Button size="sm" variant="outline" onClick={() => navigate('/settings/integrations')}>
            {t('canvas.goToSettings')}
          </Button>
        </div>
      ) : null}

      {!link ? (
        // b) Connected but not linked → Canvas course picker.
        <Card>
          <CardHeader>
            <CardTitle>{t('canvas.pickerTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('canvas.pickerDescription')}</p>
            {coursesQ.isLoading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : coursesTokenDead ? null : remoteCourses.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('canvas.pickerEmpty')}</p>
            ) : (
              <>
                <CanvasCoursePicker
                  courses={remoteCourses}
                  value={selectedId}
                  onChange={setSelectedId}
                  idPrefix="course-canvas"
                />
                {suggestion ? (
                  <p className="text-xs text-muted-foreground">
                    {t('canvas.suggestionHint', {
                      name: suggestion.name ?? suggestion.courseCode ?? suggestion.id,
                      code: course.data?.code ?? '',
                    })}
                  </p>
                ) : null}
                <div className="flex justify-end">
                  <Button onClick={() => void onLink()} disabled={!selectedId || linkMutation.isPending}>
                    {linkMutation.isPending ? t('common.loading') : t('canvas.linkCta')}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('canvas.linkedTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="font-medium">
                {link.externalCourseName ?? link.externalCourseId}
                {link.externalCourseCode ? ` (${link.externalCourseCode})` : ''}
              </div>
              {link.canvasBaseUrl ? (
                <div className="text-muted-foreground">{link.canvasBaseUrl}</div>
              ) : null}
              {link.importedAt ? (
                <div className="text-muted-foreground">
                  {t('canvas.importedAt', { date: new Date(link.importedAt).toLocaleString() })}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {!hasCompletedImport ? (
            // c) Linked, nothing imported yet → explain exactly what import does.
            <Card>
              <CardHeader>
                <CardTitle>{t('canvas.importTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{t('canvas.importIntro')}</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>{t('canvas.importItemCourseFields')}</li>
                  <li>{t('canvas.importItemGroups')}</li>
                  <li>{t('canvas.importItemAssignments')}</li>
                  <li>{t('canvas.importItemModules')}</li>
                </ul>
                <p className="text-sm text-muted-foreground">{t('canvas.importDrafts')}</p>
                <p className="text-sm text-muted-foreground">{t('canvas.importRoster')}</p>
                <Button
                  onClick={() => void onImport()}
                  disabled={importInFlight || startImport.isPending}
                >
                  {startImport.isPending ? t('common.loading') : t('canvas.importCta')}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t('canvas.pushTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('canvas.pushIntro')}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>{t('canvas.pushItemScope')}</li>
                <li>{t('canvas.pushItemCarrier')}</li>
                <li>{t('canvas.pushItemOverwrite')}</li>
                <li>{t('canvas.pushItemImportedSkipped')}</li>
              </ul>
              <Button
                variant="outline"
                onClick={() => void onPush()}
                disabled={importInFlight || startPush.isPending}
              >
                {startPush.isPending ? t('common.loading') : t('canvas.pushCta')}
              </Button>
            </CardContent>
          </Card>

          {runs.length > 0 || hasCompletedImport ? (
            // d) Run history with polling status badges.
            <Card>
              <CardHeader>
                <CardTitle>{t('canvas.runsTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {hasCompletedImport ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="max-w-xl text-sm text-muted-foreground">
                      {t('canvas.reimportHint')}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => void onImport()}
                      disabled={importInFlight || startImport.isPending}
                    >
                      {t('canvas.reimportCta')}
                    </Button>
                  </div>
                ) : null}
                <div className="space-y-2">
                  {runs.map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function RunRow({ run }: { run: CanvasSyncRun }): JSX.Element {
  const { t } = useTranslation();
  const summary =
    run.status === 'done' && run.summaryJson
      ? (run.summaryJson as Partial<CanvasImportSummary> & Partial<CanvasPushSummary>)
      : null;
  const s = summary?.structure;
  const roster = summary?.roster;
  const p = summary?.push;
  return (
    <div className="space-y-2 rounded-md border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusVariant(run.status)}>{t(`canvas.run.status.${run.status}`)}</Badge>
        <Badge variant="secondary">{t(`canvas.run.kind.${run.kind}`)}</Badge>
        <span className="text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</span>
        {run.completedAt ? (
          <span className="text-muted-foreground">
            → {new Date(run.completedAt).toLocaleString()}
          </span>
        ) : null}
      </div>
      {run.status === 'failed' && run.error ? (
        <p className="text-destructive">{run.error}</p>
      ) : null}
      {p ? (
        <div className="space-y-1 text-muted-foreground">
          <p>
            {t('canvas.run.pushModules', {
              created: p.modules?.created ?? 0,
              updated: p.modules?.updated ?? 0,
              skipped: p.modules?.skippedImported ?? 0,
            })}
          </p>
          <p>
            {t('canvas.run.pushAssignments', {
              created: p.assignments?.created ?? 0,
              updated: p.assignments?.updated ?? 0,
              skipped:
                (p.assignments?.skippedImported ?? 0) + (p.assignments?.skippedNoModule ?? 0),
            })}
            {' · '}
            {t('canvas.run.pushItems', { count: p.moduleItems?.created ?? 0 })}
          </p>
        </div>
      ) : null}
      {summary && !p ? (
        <div className="space-y-1 text-muted-foreground">
          <p>
            {t('canvas.run.groups', {
              imported: s?.assignmentGroups?.imported ?? 0,
              skipped: s?.assignmentGroups?.skipped ?? 0,
            })}
          </p>
          <p>
            {t('canvas.run.assignments', {
              imported: s?.assignments?.imported ?? 0,
              skipped: s?.assignments?.skipped ?? 0,
            })}
            {' · '}
            {t('canvas.run.quizStubs', { count: s?.assignments?.quizStubs ?? 0 })}
          </p>
          <p>
            {t('canvas.run.modules', {
              imported: s?.modules?.imported ?? 0,
              skipped: s?.modules?.skipped ?? 0,
            })}
          </p>
          {s?.assignmentGroups?.weightRounded?.length ? (
            <div>
              <p>{t('canvas.run.weightRounded')}</p>
              <ul className="list-disc pl-5">
                {s.assignmentGroups.weightRounded.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {s?.courseFields?.keptLocal?.length ? (
            <p>{t('canvas.run.keptLocal', { fields: s.courseFields.keptLocal.join(', ') })}</p>
          ) : null}
          {roster ? (
            <p>
              {t('canvas.run.roster', { count: roster.entries ?? 0 })}
              {' — '}
              {t('canvas.run.rosterEmail', {
                visible: roster.withEmail ?? 0,
                total: roster.entries ?? 0,
              })}
              {', '}
              {t('canvas.run.rosterSis', {
                visible: roster.withSisId ?? 0,
                total: roster.entries ?? 0,
              })}
              {', '}
              {t('canvas.run.rosterLogin', {
                visible: roster.withLoginId ?? 0,
                total: roster.entries ?? 0,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
