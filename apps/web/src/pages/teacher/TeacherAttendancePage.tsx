import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleCheck, Trash2, Users } from 'lucide-react';
import type { AttendanceStatus } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import {
  downloadAttendanceCsv,
  useAttendanceRecords,
  useAttendanceSessions,
  useBulkMarkAttendance,
  useCloseAttendanceSession,
  useCreateAttendanceSession,
  useDeleteAttendanceSession,
} from '@/lib/queries';
import { apiCall, pickI18nKey } from '@/lib/api';
import type { EnrollmentRow } from '@coursewise/shared';

const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function TeacherAttendancePage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cid = courseId ?? '';
  const sessions = useAttendanceSessions(cid);
  const createSession = useCreateAttendanceSession(cid);
  const delSession = useDeleteAttendanceSession(cid);
  const closeSession = useCloseAttendanceSession(cid);
  const toast = useToast();

  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const records = useAttendanceRecords(selectedSession);
  const bulkMark = useBulkMarkAttendance(selectedSession ?? '', cid);
  const [marks, setMarks] = useState<Record<string, { status: AttendanceStatus; notes: string }>>({});

  const [openDialog, setOpenDialog] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    sessionDate: '',
    lateAfterMinutes: '15',
    absentAfterMinutes: '30',
  });

  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  useEffect(() => {
    if (!cid) return;
    let cancelled = false;
    apiCall<EnrollmentRow[]>(`/api/courses/${cid}/students`)
      .then((rows) => {
        if (!cancelled) setEnrollments(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [cid]);

  function ensureMarks() {
    const next = { ...marks };
    const known = new Map<string, { status: AttendanceStatus; notes: string }>();
    for (const rec of records.data ?? []) {
      known.set(rec.studentId, { status: rec.status, notes: rec.notes ?? '' });
    }
    for (const s of enrollments) {
      if (!next[s.studentId]) {
        next[s.studentId] = known.get(s.studentId) ?? { status: 'present', notes: '' };
      }
    }
    setMarks(next);
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t('attendance.title')}</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await downloadAttendanceCsv(cid);
              } catch (err) {
                toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
              }
            }}
          >
            {t('attendance.exportCsv')}
          </Button>
          <Button onClick={() => setOpenDialog(true)}>{t('attendance.newSession')}</Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('attendance.sessionsListTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.isLoading ? (
              <p>{t('common.loading')}</p>
            ) : !sessions.data || sessions.data.length === 0 ? (
              <EmptyState title={t('attendance.empty')} />
            ) : (
              <ul className="space-y-1">
                {sessions.data.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSession(s.id);
                        setMarks({});
                      }}
                      className={`w-full rounded-md border p-2 text-left text-sm transition hover:bg-accent ${
                        selectedSession === s.id ? 'border-primary bg-accent' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{s.title}</span>
                        <Badge variant={s.status === 'open' ? 'success' : 'secondary'}>
                          {t(`attendance.session.${s.status}`)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(s.sessionDate)} ·{' '}
                        {t('attendance.records', { count: s.recordCount ?? 0 })}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('attendance.rosterTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedSession ? (
              <p className="text-sm text-muted-foreground">{t('attendance.pickSession')}</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <ActionIconButton
                    icon={Users}
                    label={t('attendance.loadRoster')}
                    color="teal"
                    onClick={ensureMarks}
                  />
                  <ActionIconButton
                    icon={CircleCheck}
                    label={t('attendance.markAllPresent')}
                    color="emerald"
                    onClick={() => {
                      const next: typeof marks = {};
                      for (const s of enrollments) {
                        next[s.studentId] = {
                          status: 'present',
                          notes: marks[s.studentId]?.notes ?? '',
                        };
                      }
                      setMarks(next);
                    }}
                  />
                  <ActionIconButton
                    icon={CircleCheck}
                    label={t('attendance.closeSession')}
                    color="emerald"
                    onClick={async () => {
                      if (!selectedSession) return;
                      await closeSession.mutateAsync(selectedSession);
                      toast.push({ title: t('attendance.sessionClosed'), tone: 'success' });
                    }}
                  />
                  <ActionIconButton
                    icon={Trash2}
                    label={t('attendance.deleteSession')}
                    color="red"
                    onClick={async () => {
                      if (!selectedSession) return;
                      if (!confirm(t('attendance.deleteSessionConfirm'))) return;
                      await delSession.mutateAsync(selectedSession);
                      setSelectedSession(null);
                    }}
                  />
                </div>

                {enrollments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('attendance.noStudents')}
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2">{t('attendance.student')}</th>
                        <th>{t('attendance.status')}</th>
                        <th>{t('attendance.notes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrollments.map((e) => {
                        const row = marks[e.studentId] ?? { status: 'present', notes: '' };
                        return (
                          <tr key={e.studentId} className="border-t">
                            <td className="py-2">{e.studentName}</td>
                            <td>
                              <select
                                className="h-9 rounded-md border bg-background px-2 text-sm"
                                value={row.status}
                                onChange={(ev) =>
                                  setMarks({
                                    ...marks,
                                    [e.studentId]: {
                                      ...row,
                                      status: ev.target.value as AttendanceStatus,
                                    },
                                  })
                                }
                              >
                                {STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {t(`attendance.${s}`)}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <Textarea
                                rows={1}
                                value={row.notes}
                                onChange={(ev) =>
                                  setMarks({
                                    ...marks,
                                    [e.studentId]: { ...row, notes: ev.target.value },
                                  })
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                <Button
                  onClick={async () => {
                    if (!selectedSession) return;
                    const payload = Object.entries(marks).map(([studentId, m]) => ({
                      studentId,
                      status: m.status,
                      notes: m.notes.trim() || null,
                    }));
                    if (payload.length === 0) return;
                    try {
                      await bulkMark.mutateAsync({ records: payload });
                      toast.push({ title: t('attendance.saved'), tone: 'success' });
                    } catch (err) {
                      toast.push({
                        title: t(pickI18nKey(err, 'errors.internal')),
                        tone: 'error',
                      });
                    }
                  }}
                >
                  {t('attendance.saveBulk')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} title={t('attendance.newSession')}>
        <div className="space-y-3">
          <div>
            <Label>{t('attendance.sessionTitle')}</Label>
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>
          <div>
            <Label>{t('attendance.sessionDate')}</Label>
            <Input
              type="datetime-local"
              value={draft.sessionDate}
              onChange={(e) => setDraft({ ...draft, sessionDate: e.target.value })}
            />
          </div>
          <div>
            <Label>{t('attendance.sessionDescription')}</Label>
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>
          <div className="space-y-2 rounded-md border bg-muted/40 p-3">
            <div className="text-sm font-medium">{t('attendance.thresholds.title')}</div>
            <p className="text-xs text-muted-foreground">{t('attendance.thresholds.help')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('attendance.thresholds.lateAfter')}</Label>
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  inputMode="numeric"
                  placeholder={t('attendance.thresholds.noLimit')}
                  value={draft.lateAfterMinutes}
                  onChange={(e) => setDraft({ ...draft, lateAfterMinutes: e.target.value })}
                />
              </div>
              <div>
                <Label>{t('attendance.thresholds.absentAfter')}</Label>
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  inputMode="numeric"
                  placeholder={t('attendance.thresholds.noLimit')}
                  value={draft.absentAfterMinutes}
                  onChange={(e) => setDraft({ ...draft, absentAfterMinutes: e.target.value })}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpenDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={async () => {
                if (!draft.title.trim() || !draft.sessionDate) return;
                const parseMinutes = (raw: string): number | null => {
                  const trimmed = raw.trim();
                  if (!trimmed) return null;
                  const n = Number(trimmed);
                  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
                };
                const lateAfter = parseMinutes(draft.lateAfterMinutes);
                const absentAfter = parseMinutes(draft.absentAfterMinutes);
                if (lateAfter != null && absentAfter != null && absentAfter < lateAfter) {
                  toast.push({
                    title: t('attendance.thresholds.orderError'),
                    tone: 'error',
                  });
                  return;
                }
                try {
                  await createSession.mutateAsync({
                    title: draft.title.trim(),
                    description: draft.description.trim() || null,
                    sessionDate: new Date(draft.sessionDate).toISOString(),
                    lateAfterMinutes: lateAfter,
                    absentAfterMinutes: absentAfter,
                  });
                  setOpenDialog(false);
                  setDraft({
                    title: '',
                    description: '',
                    sessionDate: '',
                    lateAfterMinutes: '15',
                    absentAfterMinutes: '30',
                  });
                  toast.push({ title: t('attendance.sessionCreated'), tone: 'success' });
                } catch (err) {
                  toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
                }
              }}
            >
              {t('common.create')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
