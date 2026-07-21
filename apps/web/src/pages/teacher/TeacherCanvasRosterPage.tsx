import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Link2, Plug, RefreshCw } from 'lucide-react';
import type { CanvasRosterView } from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiClientError } from '@/lib/api';
import {
  useCanvasConnection,
  useCanvasCourseLink,
  useCanvasRoster,
  useCanvasSyncRuns,
  useConfirmCanvasRosterLinks,
  useRefreshCanvasRoster,
  useSetCanvasRosterSchedule,
  useUnlinkCanvasRosterStudent,
} from '@/lib/queries';

// Four-bucket reconciliation view (v2 §6.4): suggested / confirmed /
// CourseWise-only / Canvas-only. Iron rules surface directly in the UI:
// every link is an explicit confirmation, and no orphan is hidden.
export function TeacherCanvasRosterPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const connectionQ = useCanvasConnection();
  const linkQ = useCanvasCourseLink(id || null);
  const link = linkQ.data ?? null;
  const rosterQ = useCanvasRoster(link ? id : null);
  const runsQ = useCanvasSyncRuns(link ? id : null);
  const refreshMutation = useRefreshCanvasRoster(id);
  const confirmMutation = useConfirmCanvasRosterLinks(id);
  const unlinkMutation = useUnlinkCanvasRosterStudent(id);
  const scheduleMutation = useSetCanvasRosterSchedule(id);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manualPick, setManualPick] = useState<Record<string, string>>({});
  const [scheduleUntil, setScheduleUntil] = useState('');

  // A refresh run finishing means new roster data — refetch once the runs
  // poller reports no more in-flight runs. Mirror the server's 30-minute
  // staleness window so one stuck 'running' row can't pin the button (and the
  // 4s poll) forever.
  const runs = runsQ.data ?? [];
  const refreshInFlight = runs.some(
    (r) =>
      r.kind === 'roster_refresh' &&
      (r.status === 'pending' || r.status === 'running') &&
      Date.now() - new Date(r.createdAt).getTime() < 30 * 60 * 1000,
  );
  const wasInFlight = useRef(false);
  useEffect(() => {
    if (wasInFlight.current && !refreshInFlight) void rosterQ.refetch();
    wasInFlight.current = refreshInFlight;
  }, [refreshInFlight, rosterQ]);

  const view: CanvasRosterView | null = rosterQ.data ?? null;
  const buckets = useMemo(() => {
    if (!view) return null;
    const entryById = new Map(view.entries.map((e) => [e.id, e]));
    const entryByCanvasId = new Map(view.entries.map((e) => [e.canvasUserId, e]));
    const studentById = new Map(view.students.map((s) => [s.id, s]));
    const linkedStudentIds = new Set(view.links.map((l) => l.studentId));
    const linkedCanvasIds = new Set(view.links.map((l) => l.canvasUserId));
    const suggestedStudentIds = new Set(view.suggestions.map((s) => s.studentId));
    const suggestedEntryIds = new Set(view.suggestions.map((s) => s.rosterEntryId));
    const ambiguousStudents = new Set(view.ambiguousStudentIds);
    const ambiguousEntries = new Set(view.ambiguousRosterEntryIds);

    const suggested = view.suggestions
      .map((s) => ({
        suggestion: s,
        entry: entryById.get(s.rosterEntryId),
        student: studentById.get(s.studentId),
      }))
      .filter((row) => row.entry && row.student);
    const confirmed = view.links
      .map((l) => ({
        link: l,
        entry: entryByCanvasId.get(l.canvasUserId) ?? null,
        student: studentById.get(l.studentId) ?? null,
      }))
      // A linked student who has since left CW enrollment still shows (the
      // link exists and can be removed) — only drop rows with neither side.
      .filter((row) => row.student || row.entry);
    const cwOnly = view.students.filter(
      (s) => !linkedStudentIds.has(s.id) && !suggestedStudentIds.has(s.id),
    );
    const canvasOnly = view.entries.filter(
      (e) => !linkedCanvasIds.has(e.canvasUserId) && !suggestedEntryIds.has(e.id),
    );
    const availableEntries = view.entries.filter((e) => !linkedCanvasIds.has(e.canvasUserId));
    return {
      suggested,
      confirmed,
      cwOnly,
      canvasOnly,
      availableEntries,
      ambiguousStudents,
      ambiguousEntries,
    };
  }, [view]);

  // The selection can go stale under it (a background refetch may drop
  // suggestions): every count/enable/submit works off the LIVE intersection,
  // never the raw set.
  const selectedLive = useMemo(
    () => buckets?.suggested.filter((r) => selected.has(r.suggestion.rosterEntryId)) ?? [],
    [buckets, selected],
  );

  const err = (e: unknown): void => {
    const key = e instanceof ApiClientError ? e.error.i18nKey : 'errors.internal';
    toast.push({ title: t(key), tone: 'error' });
  };

  const onRefresh = async (): Promise<void> => {
    try {
      await refreshMutation.mutateAsync();
      toast.push({ title: t('canvas.roster.refreshStarted'), tone: 'success' });
    } catch (e) {
      err(e);
    }
  };

  const confirmPairs = async (
    pairs: { rosterEntryId: string; studentId: string; method: 'sis' | 'email' | 'login_id' | 'manual' }[],
  ): Promise<void> => {
    if (pairs.length === 0) return;
    const ok = await confirm({
      title: t('canvas.roster.confirmTitle'),
      description: t('canvas.roster.confirmBody', { count: pairs.length }),
      confirmLabel: t('canvas.roster.confirmCta'),
      tone: 'default',
    });
    if (!ok) return;
    try {
      // The API caps one request at 200 links; select-all on a big course
      // just becomes several requests.
      for (let i = 0; i < pairs.length; i += 200) {
        await confirmMutation.mutateAsync({ links: pairs.slice(i, i + 200) });
      }
      toast.push({ title: t('canvas.roster.confirmed', { count: pairs.length }), tone: 'success' });
      setSelected(new Set());
      setManualPick({});
    } catch (e) {
      err(e);
    }
  };

  const onUnlink = async (studentId: string, name: string, canvasName: string): Promise<void> => {
    const ok = await confirm({
      title: t('canvas.roster.unlinkTitle'),
      description: t('canvas.roster.unlinkBody'),
      detail: { name, facts: [{ label: 'Canvas', value: canvasName }] },
      confirmLabel: t('canvas.roster.unlinkCta'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await unlinkMutation.mutateAsync(studentId);
      toast.push({ title: t('canvas.roster.unlinked'), tone: 'success' });
    } catch (e) {
      err(e);
    }
  };

  const onSchedule = async (enabled: boolean): Promise<void> => {
    try {
      // UTC-anchored end of the picked day: the stored instant (and the
      // date-only rendering below) stays on the same calendar day for every
      // viewer, regardless of timezone.
      const until = enabled ? `${scheduleUntil}T23:59:59.000Z` : null;
      await scheduleMutation.mutateAsync({ enabled, until });
      toast.push({ title: t('canvas.roster.scheduleSaved'), tone: 'success' });
    } catch (e) {
      err(e);
    }
  };

  if (connectionQ.isLoading || linkQ.isLoading) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  if (!connectionQ.data || !link) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('canvas.roster.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t('canvas.roster.description')}
          </p>
        </div>
        <EmptyState
          icon={<Plug className="h-8 w-8" aria-hidden />}
          title={t('canvas.roster.needLinkTitle')}
          description={t('canvas.roster.needLinkBody')}
          action={
            <Button onClick={() => navigate(`/teacher/courses/${id}/canvas`)}>
              {t('canvas.roster.goToSync')}
            </Button>
          }
        />
      </div>
    );
  }

  const visibility = view?.visibility;
  const methodBadge = (method: string): JSX.Element => (
    <Badge variant={method === 'manual' ? 'secondary' : 'info'}>
      {t(`canvas.roster.method.${method}`)}
    </Badge>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('canvas.roster.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t('canvas.roster.description')}
          </p>
        </div>
        <Button onClick={onRefresh} disabled={refreshInFlight || refreshMutation.isPending}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
          {refreshInFlight ? t('canvas.roster.refreshing') : t('canvas.roster.refreshCta')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          {view?.lastRosterFetchAt
            ? t('canvas.roster.lastFetched', {
                date: new Date(view.lastRosterFetchAt).toLocaleString(),
              })
            : t('canvas.roster.neverFetched')}
        </span>
        {visibility && visibility.entries > 0 ? (
          <>
            <span aria-hidden>·</span>
            <span>{t('canvas.roster.visibilityTitle')}</span>
            <Badge variant={visibility.withEmail > 0 ? 'success' : 'destructive'}>
              {t('canvas.roster.visEmail', {
                visible: visibility.withEmail,
                total: visibility.entries,
              })}
            </Badge>
            <Badge variant={visibility.withSisId > 0 ? 'success' : 'destructive'}>
              {t('canvas.roster.visSis', { visible: visibility.withSisId, total: visibility.entries })}
            </Badge>
            <Badge variant={visibility.withLoginId > 0 ? 'success' : 'destructive'}>
              {t('canvas.roster.visLogin', {
                visible: visibility.withLoginId,
                total: visibility.entries,
              })}
            </Badge>
          </>
        ) : null}
      </div>

      {rosterQ.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : null}

      {view && buckets ? (
        <>
          {/* 1. Suggested */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>
                {t('canvas.roster.suggestedTitle', { count: buckets.suggested.length })}
              </CardTitle>
              {buckets.suggested.length > 0 ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSelected(
                        selectedLive.length === buckets.suggested.length
                          ? new Set()
                          : new Set(buckets.suggested.map((r) => r.suggestion.rosterEntryId)),
                      )
                    }
                  >
                    {selectedLive.length === buckets.suggested.length
                      ? t('canvas.roster.selectNone')
                      : t('canvas.roster.selectAll')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={selectedLive.length === 0 || confirmMutation.isPending}
                    onClick={() =>
                      confirmPairs(
                        selectedLive.map((r) => ({
                          rosterEntryId: r.suggestion.rosterEntryId,
                          studentId: r.suggestion.studentId,
                          method: r.suggestion.method,
                        })),
                      )
                    }
                  >
                    {t('canvas.roster.confirmSelected', { count: selectedLive.length })}
                  </Button>
                </div>
              ) : null}
            </CardHeader>
            <CardContent>
              {buckets.suggested.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('canvas.roster.suggestedEmpty')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>{t('canvas.roster.colStudent')}</TableHead>
                      <TableHead>{t('canvas.roster.colCanvas')}</TableHead>
                      <TableHead>{t('canvas.roster.colMethod')}</TableHead>
                      <TableHead className="text-right">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {buckets.suggested.map(({ suggestion, entry, student }) => (
                      <TableRow key={suggestion.rosterEntryId}>
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={t('canvas.roster.selectRow')}
                            checked={selected.has(suggestion.rosterEntryId)}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(suggestion.rosterEntryId);
                              else next.delete(suggestion.rosterEntryId);
                              setSelected(next);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{student?.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {student?.email}
                            {student?.studentNumber ? ` · ${student.studentNumber}` : ''}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{entry?.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {[entry?.email, entry?.loginId, entry?.sisUserId]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </TableCell>
                        <TableCell>{methodBadge(suggestion.method)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={confirmMutation.isPending}
                            onClick={() =>
                              confirmPairs([
                                {
                                  rosterEntryId: suggestion.rosterEntryId,
                                  studentId: suggestion.studentId,
                                  method: suggestion.method,
                                },
                              ])
                            }
                          >
                            <Link2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                            {t('canvas.roster.confirmOne')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* 2. Confirmed */}
          <Card>
            <CardHeader>
              <CardTitle>
                {t('canvas.roster.confirmedTitle', { count: buckets.confirmed.length })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {buckets.confirmed.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('canvas.roster.confirmedEmpty')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('canvas.roster.colStudent')}</TableHead>
                      <TableHead>{t('canvas.roster.colCanvas')}</TableHead>
                      <TableHead>{t('canvas.roster.colMethod')}</TableHead>
                      <TableHead className="text-right">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {buckets.confirmed.map(({ link: l, entry, student }) => (
                      <TableRow key={l.studentId}>
                        <TableCell>
                          <div className="font-medium">{student?.name ?? l.studentId}</div>
                          <div className="text-xs text-muted-foreground">{student?.email}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{entry?.name ?? l.canvasUserId}</div>
                          {entry?.disappearedAt ? (
                            <Badge variant="warning">{t('canvas.roster.droppedBadge')}</Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>{l.matchMethod ? methodBadge(l.matchMethod) : null}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={unlinkMutation.isPending}
                            onClick={() =>
                              onUnlink(
                                l.studentId,
                                student?.name ?? l.studentId,
                                entry?.name ?? l.canvasUserId,
                              )
                            }
                          >
                            {t('canvas.roster.unlinkCta')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* 3. CourseWise-only */}
          <Card>
            <CardHeader>
              <CardTitle>{t('canvas.roster.cwOnlyTitle', { count: buckets.cwOnly.length })}</CardTitle>
            </CardHeader>
            <CardContent>
              {buckets.cwOnly.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('canvas.roster.cwOnlyEmpty')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('canvas.roster.colStudent')}</TableHead>
                      <TableHead>{t('canvas.roster.colStatus')}</TableHead>
                      <TableHead className="text-right">{t('canvas.roster.manualLink')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {buckets.cwOnly.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {s.email}
                            {s.studentNumber ? ` · ${s.studentNumber}` : ''}
                          </div>
                        </TableCell>
                        <TableCell>
                          {buckets.ambiguousStudents.has(s.id) ? (
                            <Badge variant="warning">{t('canvas.roster.ambiguousBadge')}</Badge>
                          ) : (
                            <Badge variant="outline">{t('canvas.roster.cwOnlyBadge')}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <select
                              className="h-8 max-w-56 rounded-md border bg-background px-2 text-xs"
                              aria-label={t('canvas.roster.manualLink')}
                              value={manualPick[s.id] ?? ''}
                              onChange={(e) =>
                                setManualPick({ ...manualPick, [s.id]: e.target.value })
                              }
                            >
                              <option value="">{t('canvas.roster.manualPlaceholder')}</option>
                              {buckets.availableEntries.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.name}
                                  {e.email ? ` (${e.email})` : ''}
                                </option>
                              ))}
                            </select>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!manualPick[s.id] || confirmMutation.isPending}
                              onClick={() => {
                                const rosterEntryId = manualPick[s.id];
                                if (!rosterEntryId) return;
                                void confirmPairs([
                                  { rosterEntryId, studentId: s.id, method: 'manual' },
                                ]);
                              }}
                            >
                              <Link2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                              {t('canvas.roster.confirmOne')}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* 4. Canvas-only */}
          <Card>
            <CardHeader>
              <CardTitle>
                {t('canvas.roster.canvasOnlyTitle', { count: buckets.canvasOnly.length })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {buckets.canvasOnly.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('canvas.roster.canvasOnlyEmpty')}</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="max-w-xl text-sm text-muted-foreground">
                      {t('canvas.roster.canvasOnlyHint')}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/teacher/courses/${id}/invitations`)}
                    >
                      {t('canvas.roster.inviteCta')}
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('canvas.roster.colCanvas')}</TableHead>
                        <TableHead>{t('canvas.roster.colSections')}</TableHead>
                        <TableHead>{t('canvas.roster.colStatus')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {buckets.canvasOnly.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>
                            <div className="font-medium">{e.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {[e.email, e.loginId, e.sisUserId].filter(Boolean).join(' · ')}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {e.sectionNames.join(', ')}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {e.disappearedAt ? (
                                <Badge variant="warning">{t('canvas.roster.droppedBadge')}</Badge>
                              ) : null}
                              {buckets.ambiguousEntries.has(e.id) ? (
                                <Badge variant="warning">{t('canvas.roster.ambiguousBadge')}</Badge>
                              ) : null}
                              {!e.disappearedAt && !buckets.ambiguousEntries.has(e.id) ? (
                                <Badge variant="outline">{t('canvas.roster.notRegistered')}</Badge>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>

          {/* Nightly refresh schedule */}
          <Card>
            <CardHeader>
              <CardTitle>{t('canvas.roster.scheduleTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('canvas.roster.scheduleBody')}</p>
              {view.rosterRefreshEnabled ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <Badge variant="success">
                    {t('canvas.roster.scheduleOn', {
                      // Date-only slice of the UTC-anchored instant — stable
                      // across viewer timezones.
                      date: view.rosterRefreshUntil ? view.rosterRefreshUntil.slice(0, 10) : '',
                    })}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={scheduleMutation.isPending}
                    onClick={() => onSchedule(false)}
                  >
                    {t('canvas.roster.scheduleDisable')}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    aria-label={t('canvas.roster.scheduleUntil')}
                    min={new Date().toISOString().slice(0, 10)}
                    value={scheduleUntil}
                    onChange={(e) => setScheduleUntil(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={!scheduleUntil || scheduleMutation.isPending}
                    onClick={() => onSchedule(true)}
                  >
                    {t('canvas.roster.scheduleEnable')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
