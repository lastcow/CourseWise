import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleCheck, Save, Trash2 } from 'lucide-react';
import type { AttendanceStatus } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
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

// Per-status border/background tint for the inline select + counter pills,
// so a teacher can scan the column for outliers at a glance.
const STATUS_TONE: Record<AttendanceStatus, string> = {
  present:
    'border-emerald-500/50 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
  absent: 'border-red-500/50 bg-red-500/5 text-red-700 dark:text-red-300',
  late: 'border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-300',
  excused: 'border-sky-500/50 bg-sky-500/5 text-sky-700 dark:text-sky-300',
};

const COUNTER_TONE: Record<AttendanceStatus, string> = {
  present: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  absent: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  late: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  excused: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
};

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

  // Auto-populate marks from server records once they load for the selected
  // session. Without this, the roster row falls back to 'present' even when
  // the student has already been recorded as absent (e.g. via self-sign
  // late/absent thresholds), forcing the teacher to manually click
  // "Load roster" to see the truth.
  useEffect(() => {
    if (!selectedSession || !records.data) return;
    setMarks((current) => {
      // Only fill students who don't already have an in-progress edit, so a
      // teacher's unsaved changes survive a refetch.
      const next = { ...current };
      let changed = false;
      for (const rec of records.data ?? []) {
        if (!next[rec.studentId]) {
          next[rec.studentId] = { status: rec.status, notes: rec.notes ?? '' };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [selectedSession, records.data]);

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

        <RosterCard
          selectedSession={selectedSession}
          enrollments={enrollments}
          marks={marks}
          setMarks={setMarks}
          onSave={async () => {
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
          saving={bulkMark.isPending}
          onCloseSession={async () => {
            if (!selectedSession) return;
            await closeSession.mutateAsync(selectedSession);
            toast.push({ title: t('attendance.sessionClosed'), tone: 'success' });
          }}
          onDeleteSession={async () => {
            if (!selectedSession) return;
            if (!confirm(t('attendance.deleteSessionConfirm'))) return;
            await delSession.mutateAsync(selectedSession);
            setSelectedSession(null);
          }}
        />
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

type RosterMarks = Record<string, { status: AttendanceStatus; notes: string }>;

/**
 * Polished roster surface for the selected attendance session. The header
 * surfaces a per-status tally (Present / Absent / Late / Excused) so a
 * teacher can scan a 40-student roster without scrolling, and the primary
 * Save CTA lives in the toolbar so it's reachable without skimming to
 * the bottom of the page on long classes.
 */
function RosterCard({
  selectedSession,
  enrollments,
  marks,
  setMarks,
  onSave,
  saving,
  onCloseSession,
  onDeleteSession,
}: {
  selectedSession: string | null;
  enrollments: EnrollmentRow[];
  marks: RosterMarks;
  setMarks: React.Dispatch<React.SetStateAction<RosterMarks>>;
  onSave: () => Promise<void>;
  saving: boolean;
  onCloseSession: () => Promise<void>;
  onDeleteSession: () => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();

  // Live tallies. Default state is 'present' until a teacher edits, which
  // matches how the backend records absent unless flipped.
  const total = enrollments.length;
  const counts: Record<AttendanceStatus, number> = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
  };
  for (const e of enrollments) {
    const status = marks[e.studentId]?.status ?? 'present';
    counts[status] = (counts[status] ?? 0) + 1;
  }

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setMarks((current) => ({
      ...current,
      [studentId]: { status, notes: current[studentId]?.notes ?? '' },
    }));
  };
  const setNotes = (studentId: string, notes: string) => {
    setMarks((current) => ({
      ...current,
      [studentId]: { status: current[studentId]?.status ?? 'present', notes },
    }));
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{t('attendance.rosterTitle')}</CardTitle>
          {selectedSession ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('attendance.rosterCount', { count: total })}
            </p>
          ) : null}
        </div>
        {selectedSession ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              onClick={() => void onSave()}
              disabled={saving || total === 0}
            >
              <Save className="mr-1.5 h-4 w-4" aria-hidden />
              {saving ? t('common.loading') : t('attendance.saveBulk')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const next: RosterMarks = {};
                for (const s of enrollments) {
                  next[s.studentId] = {
                    status: 'present',
                    notes: marks[s.studentId]?.notes ?? '',
                  };
                }
                setMarks(next);
              }}
              disabled={total === 0}
            >
              <CircleCheck className="mr-1.5 h-4 w-4" aria-hidden />
              {t('attendance.markAllPresent')}
            </Button>
            <span className="mx-1 hidden h-5 w-px bg-border sm:inline" aria-hidden />
            <ActionIconButton
              icon={CircleCheck}
              label={t('attendance.closeSession')}
              color="emerald"
              size="sm"
              onClick={() => void onCloseSession()}
            />
            <ActionIconButton
              icon={Trash2}
              label={t('attendance.deleteSession')}
              color="red"
              size="sm"
              onClick={() => void onDeleteSession()}
            />
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">
        {!selectedSession ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('attendance.pickSession')}
          </p>
        ) : total === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('attendance.noStudents')}
          </p>
        ) : (
          <div className="space-y-3">
            {/* Per-status tally chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUSES.map((s) => (
                <span
                  key={s}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums',
                    COUNTER_TONE[s],
                  )}
                >
                  <span>{t(`attendance.${s}`)}</span>
                  <span className="font-semibold">{counts[s]}</span>
                </span>
              ))}
              <span className="ml-auto text-xs text-muted-foreground">
                {t('attendance.rosterCount', { count: total })}
              </span>
            </div>

            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-right text-xs text-muted-foreground">
                      #
                    </TableHead>
                    <TableHead>{t('attendance.student')}</TableHead>
                    <TableHead className="w-[150px]">
                      {t('attendance.status')}
                    </TableHead>
                    <TableHead>{t('attendance.notes')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollments.map((e, idx) => {
                    const row =
                      marks[e.studentId] ?? { status: 'present', notes: '' };
                    return (
                      <TableRow key={e.studentId}>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="font-medium leading-tight">
                            {e.studentName}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {e.studentEmail}
                          </div>
                        </TableCell>
                        <TableCell>
                          <select
                            className={cn(
                              'h-8 w-full rounded-md border bg-background px-2 text-xs font-medium',
                              STATUS_TONE[row.status],
                            )}
                            value={row.status}
                            onChange={(ev) =>
                              setStatus(
                                e.studentId,
                                ev.target.value as AttendanceStatus,
                              )
                            }
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {t(`attendance.${s}`)}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.notes}
                            onChange={(ev) =>
                              setNotes(e.studentId, ev.target.value)
                            }
                            className="h-8 text-xs"
                            placeholder={t('attendance.notesPlaceholder')}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
