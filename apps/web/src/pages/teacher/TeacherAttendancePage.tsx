import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  CalendarClock,
  Check,
  ChevronDown,
  CircleCheck,
  Save,
  Search,
  SquarePen,
  Trash2,
  Users,
} from 'lucide-react';
import type { AttendanceSessionSummary, AttendanceStatus } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { CourseSectionHeader } from '@/components/course/CourseSectionHeader';
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
  useUpdateAttendanceSession,
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

// Compact, human-friendly date for the session dropdown, e.g.
// "Mon, Jun 16 · 2:30 PM" — dense enough to fit the trigger + rows.
function formatSessionDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * The session to auto-select when the page (or a course) loads: today's
 * session (latest if several land today), else the most recent session that
 * has already started ("last available"), else the soonest upcoming one.
 * Returns null only when the course has no sessions.
 */
function pickDefaultSession(sessions: AttendanceSessionSummary[]): string | null {
  if (sessions.length === 0) return null;
  const now = Date.now();
  const at = (s: AttendanceSessionSummary): number => new Date(s.sessionDate).getTime();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const start = dayStart.getTime();
  const end = start + 24 * 60 * 60 * 1000;

  const todays = sessions
    .filter((s) => at(s) >= start && at(s) < end)
    .sort((a, b) => at(b) - at(a));
  if (todays[0]) return todays[0].id;

  const past = sessions.filter((s) => at(s) <= now).sort((a, b) => at(b) - at(a));
  if (past[0]) return past[0].id;

  const upcoming = [...sessions].sort((a, b) => at(a) - at(b));
  return upcoming[0]?.id ?? null;
}

export function TeacherAttendancePage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cid = courseId ?? '';
  const sessions = useAttendanceSessions(cid);
  const createSession = useCreateAttendanceSession(cid);
  const updateSession = useUpdateAttendanceSession(cid);
  const delSession = useDeleteAttendanceSession(cid);
  const closeSession = useCloseAttendanceSession(cid);
  const toast = useToast();

  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const records = useAttendanceRecords(selectedSession);
  const bulkMark = useBulkMarkAttendance(selectedSession ?? '', cid);
  // Default per row is 'absent' until a student self-signs (-> present /
  // late) or the teacher manually edits. Treating absent-as-default keeps
  // the persisted state honest if the teacher saves without touching
  // every row: the LMS convention is "absent unless proven present."
  const [marks, setMarks] = useState<
    Record<string, { status: AttendanceStatus; notes: string }>
  >({});

  const selectSession = useCallback((id: string) => {
    setSelectedSession(id);
    setMarks({});
  }, []);

  const [openDialog, setOpenDialog] = useState(false);
  // null = the dialog is in "create" mode; a session id = "edit" mode.
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const emptyDraft = {
    title: '',
    description: '',
    sessionDate: '',
    lateAfterMinutes: '15',
    absentAfterMinutes: '30',
  };
  const [draft, setDraft] = useState(emptyDraft);

  // datetime-local wants `YYYY-MM-DDTHH:mm` in local time.
  const toLocalInput = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openCreate = (): void => {
    setEditingSessionId(null);
    setDraft(emptyDraft);
    setOpenDialog(true);
  };

  const openEdit = (s: AttendanceSessionSummary): void => {
    setEditingSessionId(s.id);
    setDraft({
      title: s.title,
      description: s.description ?? '',
      sessionDate: toLocalInput(s.sessionDate),
      lateAfterMinutes: s.lateAfterMinutes != null ? String(s.lateAfterMinutes) : '',
      absentAfterMinutes: s.absentAfterMinutes != null ? String(s.absentAfterMinutes) : '',
    });
    setOpenDialog(true);
  };

  const closeDialog = (): void => {
    setOpenDialog(false);
    setEditingSessionId(null);
    setDraft(emptyDraft);
  };

  // Shared create/edit submit. Same validation either way; the only difference
  // is which mutation runs based on `editingSessionId`.
  const submitSession = async (): Promise<void> => {
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
      toast.push({ title: t('attendance.thresholds.orderError'), tone: 'error' });
      return;
    }
    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      sessionDate: new Date(draft.sessionDate).toISOString(),
      lateAfterMinutes: lateAfter,
      absentAfterMinutes: absentAfter,
    };
    try {
      if (editingSessionId) {
        await updateSession.mutateAsync({ id: editingSessionId, input: payload });
        toast.push({ title: t('attendance.sessionUpdated'), tone: 'success' });
      } else {
        await createSession.mutateAsync(payload);
        toast.push({ title: t('attendance.sessionCreated'), tone: 'success' });
      }
      closeDialog();
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  };

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

  // Keep a valid session selected. On first load (and after a course switch or
  // a delete leaves the current pick stale) auto-select today's / the last
  // available session so the roster is immediately useful without a manual
  // pick. A still-valid selection is left untouched.
  useEffect(() => {
    const data = sessions.data;
    if (!data) return;
    const stillValid = selectedSession != null && data.some((s) => s.id === selectedSession);
    if (stillValid) return;
    const next = pickDefaultSession(data);
    if (next !== selectedSession) {
      setSelectedSession(next);
      setMarks({});
    }
  }, [sessions.data, selectedSession]);

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
      <CourseSectionHeader
        title={t('attendance.title')}
        count={sessions.data?.length}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
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
            <Button size="sm" onClick={openCreate}>
              {t('attendance.newSession')}
            </Button>
          </>
        }
      />

      <RosterCard
        sessions={sessions.data ?? []}
        sessionsLoading={sessions.isLoading}
        selectedSession={selectedSession}
        session={sessions.data?.find((s) => s.id === selectedSession) ?? null}
        onSelectSession={selectSession}
        onCreate={openCreate}
        enrollments={enrollments}
        marks={marks}
        setMarks={setMarks}
        deleting={delSession.isPending}
        onSave={async (records) => {
          if (!selectedSession || records.length === 0) return;
          try {
            await bulkMark.mutateAsync({ records });
            toast.push({ title: t('attendance.saved'), tone: 'success' });
          } catch (err) {
            toast.push({
              title: t(pickI18nKey(err, 'errors.internal')),
              tone: 'error',
            });
          }
        }}
        saving={bulkMark.isPending}
        onEditSession={() => {
          const s = sessions.data?.find((x) => x.id === selectedSession);
          if (s) openEdit(s);
        }}
        onCloseSession={async () => {
          if (!selectedSession) return;
          await closeSession.mutateAsync(selectedSession);
          toast.push({ title: t('attendance.sessionClosed'), tone: 'success' });
        }}
        onDeleteSession={async () => {
          if (!selectedSession) return;
          await delSession.mutateAsync(selectedSession);
          setSelectedSession(null);
          toast.push({ title: t('attendance.sessionDeleted'), tone: 'success' });
        }}
      />

      <Dialog
        open={openDialog}
        onClose={closeDialog}
        title={editingSessionId ? t('attendance.editSession') : t('attendance.newSession')}
      >
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
            <Button variant="outline" onClick={closeDialog}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => void submitSession()}
              disabled={createSession.isPending || updateSession.isPending}
            >
              {editingSessionId ? t('common.save') : t('common.create')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

/**
 * Rich session picker that lives in the roster nav bar. The trigger shows the
 * current session (status dot + title + date), and the portaled listbox lists
 * every session with its full context — status accent rail, status badge,
 * date, and how many students are marked — so the right one is identifiable
 * without leaving the roster. Portaled to <body> so it escapes the card's
 * overflow; outside-click / Esc / ancestor-scroll / resize dismiss, and
 * Arrow keys + Enter drive it from the keyboard.
 */
function SessionSelect({
  sessions,
  selectedId,
  onSelect,
}: {
  sessions: AttendanceSessionSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    minWidth: number;
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  const place = useCallback((): void => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const openUp = window.innerHeight - r.bottom < 320 && r.top > window.innerHeight / 2;
    setCoords({
      top: openUp ? undefined : Math.round(r.bottom + 4),
      bottom: openUp ? Math.round(window.innerHeight - r.top + 4) : undefined,
      left: Math.round(r.left),
      minWidth: Math.round(r.width),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Capture-phase scroll fires for nested scrollers too; a scroll *inside*
    // the menu must not dismiss, or the list can't be scrolled.
    const onScroll = (e: Event): void => {
      const target = e.target as Node | null;
      if (target && menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onResize = (): void => setOpen(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  // Keep the highlighted row scrolled into view as it moves.
  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-opt="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const toggle = (): void => {
    if (open) {
      setOpen(false);
      return;
    }
    setActiveIndex(Math.max(0, sessions.findIndex((s) => s.id === selectedId)));
    place();
    setOpen(true);
  };

  const pick = (id: string): void => {
    onSelect(id);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent): void => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(sessions.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = sessions[activeIndex];
      if (s) pick(s.id);
    }
  };

  return (
    <div className="w-full sm:w-[22rem]">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('attendance.selectSession')}
        className={cn(
          'inline-flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm transition-colors',
          'hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        {selected ? (
          <>
            <span
              aria-hidden
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                selected.status === 'open' ? 'bg-emerald-500' : 'bg-muted-foreground/40',
              )}
            />
            <span className="min-w-0 flex-1 truncate text-left font-medium">{selected.title}</span>
            <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
              {formatSessionDate(selected.sessionDate)}
            </span>
          </>
        ) : (
          <span className="flex-1 truncate text-left text-muted-foreground">
            {t('attendance.selectSession')}
          </span>
        )}
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 opacity-60 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && coords
        ? createPortal(
            // bg-card (not bg-popover): the project's Tailwind config has no
            // popover token, so bg-popover would resolve transparent.
            <div
              ref={menuRef}
              role="listbox"
              aria-label={t('attendance.sessionsListTitle')}
              style={{
                position: 'fixed',
                top: coords.top,
                bottom: coords.bottom,
                left: coords.left,
                minWidth: coords.minWidth,
              }}
              className="z-50 max-h-[22rem] w-max max-w-[28rem] overflow-y-auto rounded-md border bg-card text-card-foreground shadow-lg"
            >
              <ul className="py-1">
                {sessions.map((s, i) => {
                  const active = i === activeIndex;
                  const isSelected = s.id === selectedId;
                  const isOpen = s.status === 'open';
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        data-opt={i}
                        onClick={() => pick(s.id)}
                        onMouseMove={() => setActiveIndex(i)}
                        className={cn(
                          'relative flex w-full items-start gap-2.5 py-2 pl-4 pr-3 text-left transition-colors',
                          active ? 'bg-accent' : 'hover:bg-accent/60',
                        )}
                      >
                        {/* Status accent rail: green = self-sign still open. */}
                        <span
                          aria-hidden
                          className={cn(
                            'absolute inset-y-1.5 left-0 w-1 rounded-full',
                            isOpen ? 'bg-emerald-500' : 'bg-muted-foreground/30',
                          )}
                        />
                        <Check
                          className={cn(
                            'mt-0.5 h-3.5 w-3.5 shrink-0',
                            isSelected ? 'text-primary opacity-100' : 'opacity-0',
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className={cn('truncate text-sm', isSelected && 'font-semibold')}>
                              {s.title}
                            </span>
                            <Badge variant={isOpen ? 'success' : 'secondary'} className="shrink-0">
                              {t(`attendance.session.${s.status}`)}
                            </Badge>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="truncate">{formatSessionDate(s.sessionDate)}</span>
                            <span aria-hidden>·</span>
                            <span className="shrink-0">
                              {t('attendance.records', { count: s.recordCount ?? 0 })}
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

type RosterMarks = Record<string, { status: AttendanceStatus; notes: string }>;
type BulkRecord = { studentId: string; status: AttendanceStatus; notes: string | null };

/** Clickable count pill that doubles as a status filter (and an "All" reset). */
function FilterChip({
  label,
  count,
  active,
  tone,
  title,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone: string;
  title: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums transition',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        tone,
        active ? 'ring-2 ring-current/30 brightness-105' : 'opacity-75 hover:opacity-100',
      )}
    >
      <span>{label}</span>
      <span className="font-semibold">{count}</span>
    </button>
  );
}

/**
 * Polished roster surface for the selected attendance session. Its nav bar
 * carries the session dropdown ({@link SessionSelect}) plus the primary Save
 * CTA and session-management actions; below it a name/email search and
 * per-status filter pills (which double as a live Present / Absent / Late /
 * Excused tally) let a teacher find a student or isolate every "absent" on a
 * 40-student roster without scrolling.
 */
function RosterCard({
  sessions,
  sessionsLoading,
  selectedSession,
  session,
  onSelectSession,
  onCreate,
  enrollments,
  marks,
  setMarks,
  onSave,
  saving,
  onEditSession,
  onCloseSession,
  onDeleteSession,
  deleting,
}: {
  sessions: AttendanceSessionSummary[];
  sessionsLoading: boolean;
  selectedSession: string | null;
  session: AttendanceSessionSummary | null;
  onSelectSession: (id: string) => void;
  onCreate: () => void;
  enrollments: EnrollmentRow[];
  marks: RosterMarks;
  setMarks: React.Dispatch<React.SetStateAction<RosterMarks>>;
  onSave: (records: BulkRecord[]) => Promise<void>;
  saving: boolean;
  onEditSession: () => void;
  onCloseSession: () => Promise<void>;
  onDeleteSession: () => Promise<void>;
  deleting: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Active status filter for the roster table. null = show everyone.
  // Click a pill to filter to that status; click it (or "All") to clear.
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | null>(null);
  // Free-text search over student name + email.
  const [search, setSearch] = useState('');

  // Live tallies over the WHOLE roster (not the filtered view) so the pills
  // always reflect the true distribution. Untouched rows default to 'absent'
  // so the LMS convention "absent unless proven present" holds even before
  // the teacher clicks Save.
  const total = enrollments.length;
  const counts: Record<AttendanceStatus, number> = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
  };
  for (const e of enrollments) {
    const status = marks[e.studentId]?.status ?? 'absent';
    counts[status] += 1;
  }

  // Visible rows = roster narrowed by the status filter AND the search query.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrollments.filter((e) => {
      const status = marks[e.studentId]?.status ?? 'absent';
      if (statusFilter && status !== statusFilter) return false;
      if (
        q &&
        !e.studentName.toLowerCase().includes(q) &&
        !e.studentEmail.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [enrollments, marks, statusFilter, search]);

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setMarks((current) => ({
      ...current,
      [studentId]: { status, notes: current[studentId]?.notes ?? '' },
    }));
  };
  const setNotes = (studentId: string, notes: string) => {
    setMarks((current) => ({
      ...current,
      [studentId]: { status: current[studentId]?.status ?? 'absent', notes },
    }));
  };

  // Build the save payload from the live roster so every enrolled
  // student is sent — untouched rows default to 'absent'.
  const buildPayload = (): BulkRecord[] =>
    enrollments.map((e) => {
      const m = marks[e.studentId];
      return {
        studentId: e.studentId,
        status: m?.status ?? 'absent',
        notes: m?.notes.trim() ? m.notes.trim() : null,
      };
    });

  const clearFilters = (): void => {
    setStatusFilter(null);
    setSearch('');
  };

  const hasSessions = sessions.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          {hasSessions ? (
            <SessionSelect
              sessions={sessions}
              selectedId={selectedSession}
              onSelect={onSelectSession}
            />
          ) : (
            <CardTitle>{t('attendance.rosterTitle')}</CardTitle>
          )}
        </div>
        {selectedSession ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              onClick={() => void onSave(buildPayload())}
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
              icon={SquarePen}
              label={t('attendance.editSession')}
              color="yellow"
              size="sm"
              onClick={onEditSession}
            />
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
              onClick={() => setConfirmDelete(true)}
            />
          </div>
        ) : null}
      </CardHeader>

      {/* Search + status-filter toolbar. Only meaningful once a session with
          enrolled students is selected. */}
      {selectedSession && total > 0 ? (
        <div className="flex flex-col gap-2.5 border-y bg-muted/30 px-3 py-2.5 lg:flex-row lg:items-center lg:gap-3">
          <div className="relative lg:w-64 lg:shrink-0">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('attendance.searchPlaceholder')}
              className="h-8 bg-background pl-8 text-sm"
              aria-label={t('attendance.searchPlaceholder')}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip
              label={t('attendance.filterAll')}
              count={total}
              active={statusFilter === null}
              tone="border-border bg-background text-foreground"
              title={t('attendance.clearFilter')}
              onClick={() => setStatusFilter(null)}
            />
            {STATUSES.map((s) => (
              <FilterChip
                key={s}
                label={t(`attendance.${s}`)}
                count={counts[s]}
                active={statusFilter === s}
                tone={COUNTER_TONE[s]}
                title={
                  statusFilter === s
                    ? t('attendance.clearFilter')
                    : t('attendance.filterBy', { status: t(`attendance.${s}`) })
                }
                onClick={() => setStatusFilter((cur) => (cur === s ? null : s))}
              />
            ))}
          </div>
          <span className="text-xs tabular-nums text-muted-foreground lg:ml-auto lg:shrink-0">
            {t('attendance.showing', { shown: visible.length, total })}
          </span>
        </div>
      ) : null}

      <CardContent className="pt-4">
        {!hasSessions ? (
          sessionsLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <EmptyState
              className="border-0"
              icon={<CalendarClock className="h-8 w-8" aria-hidden />}
              title={t('attendance.empty')}
              action={
                <Button size="sm" onClick={onCreate}>
                  {t('attendance.newSession')}
                </Button>
              }
            />
          )
        ) : !selectedSession ? (
          <EmptyState
            className="border-0"
            icon={<CalendarClock className="h-8 w-8" aria-hidden />}
            title={t('attendance.pickSession')}
            description={t('attendance.pickSessionHint')}
          />
        ) : total === 0 ? (
          <EmptyState
            className="border-0"
            icon={<Users className="h-8 w-8" aria-hidden />}
            title={t('attendance.noStudents')}
          />
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Search className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">{t('attendance.noMatchingStudents')}</p>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              {t('attendance.clearFilter')}
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10 text-right text-xs text-muted-foreground">
                    #
                  </TableHead>
                  <TableHead>{t('attendance.student')}</TableHead>
                  <TableHead className="w-[150px]">{t('attendance.status')}</TableHead>
                  <TableHead>{t('attendance.notes')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((e, idx) => {
                  // Default to 'absent' — LMS convention is "absent unless
                  // proven present." Self-sign / manual edits flip the status
                  // to present / late / excused.
                  const row =
                    marks[e.studentId] ?? { status: 'absent' as const, notes: '' };
                  const tone = STATUS_TONE[row.status];
                  return (
                    <TableRow key={e.studentId}>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="font-medium leading-tight">{e.studentName}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {e.studentEmail}
                        </div>
                      </TableCell>
                      <TableCell>
                        <select
                          className={cn(
                            'h-8 w-full rounded-md border bg-background px-2 text-xs font-medium',
                            tone,
                          )}
                          value={row.status}
                          onChange={(ev) =>
                            setStatus(e.studentId, ev.target.value as AttendanceStatus)
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
                          onChange={(ev) => setNotes(e.studentId, ev.target.value)}
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
        )}
      </CardContent>

      <Dialog
        open={confirmDelete}
        onClose={deleting ? () => undefined : () => setConfirmDelete(false)}
        title={t('attendance.deleteSessionConfirmTitle')}
        dismissOnBackdropClick={false}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('attendance.deleteSessionConfirmBody')}
          </p>
          {session ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border bg-muted/30 p-3 text-sm">
              <dt className="text-muted-foreground">{t('attendance.sessionTitle')}</dt>
              <dd className="break-words text-foreground">{session.title}</dd>
              <dt className="text-muted-foreground">{t('attendance.sessionDate')}</dt>
              <dd className="text-foreground">{formatDate(session.sessionDate)}</dd>
              <dt className="text-muted-foreground">
                {t('attendance.sessionStatus')}
              </dt>
              <dd>
                <Badge
                  variant={session.status === 'open' ? 'success' : 'secondary'}
                >
                  {t(`attendance.session.${session.status}`)}
                </Badge>
              </dd>
              <dt className="text-muted-foreground">
                {t('attendance.signedInLabel')}
              </dt>
              <dd className="text-foreground">
                {t('attendance.signedInOfTotal', {
                  signed: counts.present + counts.late,
                  total,
                })}
              </dd>
              <dt className="text-muted-foreground">
                {t('attendance.markedBreakdownLabel')}
              </dt>
              <dd className="text-foreground">
                {t('attendance.markedBreakdownValue', {
                  present: counts.present,
                  late: counts.late,
                  absent: counts.absent,
                  excused: counts.excused,
                })}
              </dd>
            </dl>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                setConfirmDelete(false);
                await onDeleteSession();
              }}
            >
              {deleting
                ? t('common.loading')
                : t('attendance.deleteSessionConfirmAction')}
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}
