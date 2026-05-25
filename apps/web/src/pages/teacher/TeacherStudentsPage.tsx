import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Copy,
  Lock,
  Mail,
  Pencil,
  RefreshCw,
  Trash2,
  Unlock,
  UserMinus,
  UserRoundPlus,
  Users,
} from 'lucide-react';
import { MessageComposeDialog } from '@/components/messaging/MessageComposeDialog';
import { StudentProfileDialog } from '@/components/students/StudentProfileDialog';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Input, Label } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pagination, usePageSlice } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import {
  useCourseInvitationCodes,
  useCourseStudents,
  useCreateGroupSet,
  useDeleteGroupSet,
  useGroupSet,
  useGroupSets,
  useJoinOrAssignGroupMember,
  useRemoveGroupMember,
  useUpdateGroupSet,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  GROUP_SET_SIGNUP_MODES,
  type CreateGroupSetInput,
  type EnrollmentRow,
  type GroupSetSummary,
} from '@coursewise/shared';

/**
 * Course roster + group-set management on one screen. Default view is a
 * flat table of enrolled students. Selecting a group-set filter pivots the
 * table into a grouped layout (group header rows + member rows + an
 * "Unassigned" bucket at the bottom). The toolbar also hosts create / rename /
 * lock / delete actions for the active group set.
 */
export function TeacherStudentsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cId = courseId ?? '';
  const toast = useToast();

  const studentsQ = useCourseStudents(cId || undefined);
  const groupSetsQ = useGroupSets(cId || undefined);
  const invitesQ = useCourseInvitationCodes(cId || null);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const activeSetQ = useGroupSet(cId || undefined, activeSetId ?? undefined);

  const [search, setSearch] = useState('');
  const [assignTargetId, setAssignTargetId] = useState<string>('');

  const createSet = useCreateGroupSet(cId);
  const updateSet = useUpdateGroupSet(cId);
  const deleteSet = useDeleteGroupSet(cId);
  const assignMember = useJoinOrAssignGroupMember(cId, activeSetId ?? '');
  const removeMember = useRemoveGroupMember(cId, activeSetId ?? '');

  // Dialogs
  const [openCreate, setOpenCreate] = useState(false);
  const [messageTarget, setMessageTarget] = useState<{ id: string; name: string } | null>(null);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<GroupSetSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editCount, setEditCount] = useState('');
  const [editMax, setEditMax] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<GroupSetSummary | null>(null);
  const [copied, setCopied] = useState(false);
  // Create-set form state
  const [newName, setNewName] = useState('');
  const [newCount, setNewCount] = useState('4');
  const [newMax, setNewMax] = useState('4');
  const [newMode, setNewMode] = useState<CreateGroupSetInput['signupMode']>('self_signup');

  const filteredStudents = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (studentsQ.data ?? []).filter((row) => {
      if (s && !`${row.studentName} ${row.studentEmail}`.toLowerCase().includes(s)) return false;
      return row.status === 'enrolled';
    });
  }, [studentsQ.data, search]);

  const activeSet = activeSetQ.data;
  const activeSummary = (groupSetsQ.data ?? []).find((g) => g.id === activeSetId) ?? null;

  // --- handlers ---

  const refresh = () => {
    void studentsQ.refetch();
    void groupSetsQ.refetch();
    if (activeSetId) void activeSetQ.refetch();
  };

  const onCreateSet = async () => {
    const n = Number.parseInt(newCount, 10);
    const m = Number.parseInt(newMax, 10);
    if (!newName.trim() || !Number.isFinite(n) || n <= 0 || !Number.isFinite(m) || m <= 0) {
      toast.push({ title: t('common.error'), tone: 'error' });
      return;
    }
    try {
      await createSet.mutateAsync({
        name: newName.trim(),
        numberOfGroups: n,
        maxMembersPerGroup: m,
        signupMode: newMode,
      });
      toast.push({ title: t('groups.setCreated'), tone: 'success' });
      setOpenCreate(false);
      setNewName('');
      setNewCount('4');
      setNewMax('4');
      setNewMode('self_signup');
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onLockToggle = async () => {
    if (!activeSummary) return;
    try {
      await updateSet.mutateAsync({
        setId: activeSummary.id,
        patch: { signupStatus: activeSummary.signupStatus === 'open' ? 'locked' : 'open' },
      });
      toast.push({ title: t('groups.setUpdated'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    const patch: { name?: string; numberOfGroups?: number; maxMembersPerGroup?: number } = {};
    if (renameValue.trim() !== renameTarget.name) patch.name = renameValue.trim();
    const nextCount = Number.parseInt(editCount, 10);
    if (Number.isFinite(nextCount) && nextCount > 0 && nextCount !== renameTarget.groupCount) {
      patch.numberOfGroups = nextCount;
    }
    const nextMax = Number.parseInt(editMax, 10);
    if (
      Number.isFinite(nextMax) &&
      nextMax > 0 &&
      nextMax !== renameTarget.maxMembersPerGroup
    ) {
      patch.maxMembersPerGroup = nextMax;
    }
    if (Object.keys(patch).length === 0) {
      setRenameTarget(null);
      return;
    }
    try {
      await updateSet.mutateAsync({ setId: renameTarget.id, patch });
      toast.push({ title: t('groups.setUpdated'), tone: 'success' });
      setRenameTarget(null);
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSet.mutateAsync(deleteTarget.id);
      toast.push({ title: t('groups.setDeleted'), tone: 'success' });
      // If the deleted set was the active filter, drop back to flat view.
      if (activeSetId === deleteTarget.id) setActiveSetId(null);
      setDeleteTarget(null);
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onAssign = async (groupId: string, opts?: { force?: boolean }) => {
    if (!assignTargetId) return;
    try {
      await assignMember.mutateAsync({
        groupId,
        studentId: assignTargetId,
        force: opts?.force,
      });
      toast.push({ title: t('groups.memberJoined'), tone: 'success' });
      setAssignTargetId('');
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onCopyInvite = async () => {
    if (!activeInvite) return;
    try {
      await navigator.clipboard.writeText(activeInvite.code);
      setCopied(true);
      // Brief acknowledgment window. Long enough to register; short enough
      // that a teacher copying multiple times in a row still sees feedback
      // on each click (the timer is reset on each successful copy).
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.push({ title: t('common.error'), tone: 'error' });
    }
  };

  const onRemove = async (groupId: string, studentId: string) => {
    try {
      await removeMember.mutateAsync({ groupId, studentId });
      toast.push({ title: t('groups.memberRemoved'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  // Build a quick lookup from studentId → student row so we can render
  // EnrollmentRow data in the grouped layout (which only gets minimal
  // {name,email} from the group-set endpoint).
  const studentById = useMemo(() => {
    const map = new Map<string, EnrollmentRow>();
    for (const s of studentsQ.data ?? []) map.set(s.studentId, s);
    return map;
  }, [studentsQ.data]);

  // Group set is selected: respect search by hiding members whose name/email
  // doesn't match. Empty groups stay in the layout so the teacher can still
  // assign students into them.
  const matchesSearch = (name: string, email: string) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return `${name} ${email}`.toLowerCase().includes(s);
  };

  // Pick the most-recently-created active invitation code to surface in the
  // toolbar. If multiple are active the newest one is what teachers most
  // commonly share; the full list is still available on /invitations.
  const activeInvite = useMemo(() => {
    const list = invitesQ.data ?? [];
    return (
      list
        .filter((i) => i.status === 'active')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    );
  }, [invitesQ.data]);

  // ceil() so "expires in 1 day" still shows when there are hours left,
  // matching how teachers think about the deadline. Past-due returns 0 but
  // such codes would normally have status='expired' and be filtered out.
  const daysUntilExpiry = useMemo(() => {
    if (!activeInvite?.expiresAt) return null;
    const diff = new Date(activeInvite.expiresAt).getTime() - Date.now();
    if (Number.isNaN(diff)) return null;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [activeInvite]);

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t('students.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('students.helpTeacher')}</p>
      </header>

      <div className="overflow-hidden rounded-md border">
        {/* Toolbar
            Layout: [search] ………………… [All] [Group A] [Group B] [+] | [refresh]
            Group filter chips sit at the right, immediately before the
            "+ New group set" icon button; refresh is the very last item,
            divided from the rest by a vertical separator. */}
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('students.searchPlaceholder')}
            className="h-8 w-56"
          />
          {activeInvite ? (
            <>
              <div className="mx-1 h-5 w-px bg-border" aria-hidden />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {t('students.toolbarInvite')}:{' '}
                  <span className="font-mono font-medium text-foreground">
                    {activeInvite.code}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={onCopyInvite}
                  aria-label={copied ? t('common.copied') : t('common.copy')}
                  title={copied ? t('common.copied') : t('common.copy')}
                  className={cn(
                    'inline-flex items-center justify-center rounded p-0.5 transition-all duration-200',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current',
                    copied
                      ? 'scale-125 text-emerald-500'
                      : 'text-sky-500 hover:text-sky-600',
                  )}
                >
                  {/* `key` re-mounts the icon on state flip so tailwindcss-animate
                      gets a fresh zoom-in trigger and the swap reads as a deliberate
                      acknowledgment rather than a sudden glyph change. */}
                  {copied ? (
                    <Check
                      key="check"
                      className="h-3 w-3 animate-in zoom-in-50 duration-200"
                      aria-hidden
                    />
                  ) : (
                    <Copy key="copy" className="h-3 w-3" aria-hidden />
                  )}
                </button>
                <span>·</span>
                <span>
                  {daysUntilExpiry == null
                    ? t('students.toolbarInviteNoExpiry')
                    : t('students.toolbarInviteExpiresInDays', { count: daysUntilExpiry })}
                </span>
              </div>
            </>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSetId(null)}
              className={cn(
                'inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors',
                activeSetId === null
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-background text-foreground hover:bg-accent',
              )}
            >
              {t('students.filterAll')}
            </button>
            {(groupSetsQ.data ?? []).map((gs) => (
              <button
                key={gs.id}
                type="button"
                onClick={() => setActiveSetId(gs.id)}
                className={cn(
                  'inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium transition-colors',
                  activeSetId === gs.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background text-foreground hover:bg-accent',
                )}
                title={t('students.filterByGroupSet', { name: gs.name })}
              >
                <Users className="h-3 w-3" aria-hidden />
                {gs.name}
              </button>
            ))}
            <ActionIconButton
              icon={UserRoundPlus}
              label={t('groups.newSetCta')}
              color="emerald"
              size="sm"
              onClick={() => setOpenCreate(true)}
            />
            <div className="mx-1 h-5 w-px bg-border" aria-hidden />
            <ActionIconButton
              icon={RefreshCw}
              label={t('common.refresh')}
              color="sky"
              size="sm"
              onClick={refresh}
              disabled={studentsQ.isFetching || groupSetsQ.isFetching}
              className={cn(
                (studentsQ.isFetching || groupSetsQ.isFetching) && '[&_svg]:animate-spin',
              )}
            />
          </div>
        </div>

        {/* Per-set action bar (only when a filter is active) */}
        {activeSummary ? (
          <div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2 text-sm">
            <span className="font-medium">{activeSummary.name}</span>
            <Badge variant={activeSummary.signupStatus === 'open' ? 'success' : 'secondary'}>
              {activeSummary.signupStatus === 'open'
                ? t('groups.signupOpen')
                : t('groups.signupLocked')}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {t('groups.groupCountLabel', { count: activeSummary.groupCount })} ·{' '}
              {t('groups.memberCountLabel', { count: activeSummary.memberCount })}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={onLockToggle} disabled={updateSet.isPending}>
                {activeSummary.signupStatus === 'open' ? (
                  <>
                    <Lock className="h-4 w-4" aria-hidden /> {t('groups.lockSignup')}
                  </>
                ) : (
                  <>
                    <Unlock className="h-4 w-4" aria-hidden /> {t('groups.unlockSignup')}
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRenameTarget(activeSummary);
                  setRenameValue(activeSummary.name);
                  setEditCount(String(activeSummary.groupCount));
                  setEditMax(String(activeSummary.maxMembersPerGroup));
                }}
              >
                <Pencil className="h-4 w-4" aria-hidden /> {t('common.edit')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteTarget(activeSummary)}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> {t('common.delete')}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Body */}
        {!activeSetId ? (
          <FlatRosterTable
            rows={filteredStudents}
            loading={studentsQ.isLoading}
            onMessage={(row) =>
              setMessageTarget({ id: row.studentId, name: row.studentName })
            }
            onEdit={(row) => setEditTargetId(row.studentId)}
            t={t}
          />
        ) : !activeSet ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {t('common.loading')}
          </p>
        ) : (
          <GroupedRosterTable
            t={t}
            set={activeSet}
            studentById={studentById}
            matchesSearch={matchesSearch}
            assignTargetId={assignTargetId}
            onPickAssignTarget={setAssignTargetId}
            onAssign={onAssign}
            onRemove={onRemove}
            assignBusy={assignMember.isPending}
            removeBusy={removeMember.isPending}
          />
        )}
      </div>

      {/* --- Create group set dialog --- */}
      <Dialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title={t('groups.newSetTitle')}
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="ts-name">{t('groups.setNameLabel')}</Label>
            <Input
              id="ts-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('groups.setNamePlaceholder')}
              maxLength={100}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ts-count">{t('groups.numberOfGroupsLabel')}</Label>
              <Input
                id="ts-count"
                type="number"
                min={1}
                max={100}
                value={newCount}
                onChange={(e) => setNewCount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ts-max">{t('groups.maxPerGroupLabel')}</Label>
              <Input
                id="ts-max"
                type="number"
                min={1}
                max={100}
                value={newMax}
                onChange={(e) => setNewMax(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="ts-mode">{t('groups.signupModeLabel')}</Label>
            <select
              id="ts-mode"
              value={newMode}
              onChange={(e) => setNewMode(e.target.value as CreateGroupSetInput['signupMode'])}
              className="block h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {GROUP_SET_SIGNUP_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(
                    `groups.signupMode${
                      m === 'self_signup'
                        ? 'SelfSignup'
                        : m === 'teacher_assigned'
                          ? 'TeacherAssigned'
                          : 'Mixed'
                    }`,
                  )}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpenCreate(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onCreateSet} disabled={createSet.isPending}>
              {t('common.create')}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* --- Edit set (rename + resize) --- */}
      <Dialog
        open={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title={t('groups.editSetTitle')}
      >
        {renameTarget ? (
          (() => {
            const targetCount = Number.parseInt(editCount, 10);
            const targetMax = Number.parseInt(editMax, 10);
            const shrinking =
              (Number.isFinite(targetCount) && targetCount < renameTarget.groupCount) ||
              (Number.isFinite(targetMax) && targetMax < renameTarget.maxMembersPerGroup);
            return (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="ts-rename">{t('groups.setNameLabel')}</Label>
                  <Input
                    id="ts-rename"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    maxLength={100}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="ts-edit-count">
                      {t('groups.numberOfGroupsLabel')}
                    </Label>
                    <Input
                      id="ts-edit-count"
                      type="number"
                      min={1}
                      max={100}
                      value={editCount}
                      onChange={(e) => setEditCount(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ts-edit-max">
                      {t('groups.maxPerGroupLabel')}
                    </Label>
                    <Input
                      id="ts-edit-max"
                      type="number"
                      min={1}
                      max={200}
                      value={editMax}
                      onChange={(e) => setEditMax(e.target.value)}
                    />
                  </div>
                </div>
                {shrinking ? (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    {t('groups.shrinkHint')}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setRenameTarget(null)}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={onRename}
                    disabled={updateSet.isPending || !renameValue.trim()}
                  >
                    {t('common.save')}
                  </Button>
                </div>
              </div>
            );
          })()
        ) : null}
      </Dialog>

      {/* --- Delete --- */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('groups.deleteSetTitle')}
        dismissOnBackdropClick={false}
      >
        <p className="text-sm text-muted-foreground">{t('groups.deleteSetConfirm')}</p>
        {deleteTarget ? <p className="mt-2 font-medium">{deleteTarget.name}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={deleteSet.isPending}>
            {t('common.delete')}
          </Button>
        </div>
      </Dialog>

      {messageTarget ? (
        <MessageComposeDialog
          open
          onClose={() => setMessageTarget(null)}
          courseId={cId}
          recipientId={messageTarget.id}
          recipientName={messageTarget.name}
        />
      ) : null}

      {editTargetId ? (
        <StudentProfileDialog
          open
          onClose={() => setEditTargetId(null)}
          userId={editTargetId}
          canDelete
        />
      ) : null}
    </div>
  );
}

// ---------- subcomponents ----------

function FlatRosterTable({
  rows,
  loading,
  onMessage,
  onEdit,
  t,
}: {
  rows: EnrollmentRow[];
  loading: boolean;
  onMessage: (row: EnrollmentRow) => void;
  onEdit: (row: EnrollmentRow) => void;
  t: (k: string, v?: Record<string, unknown>) => string;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // Reset to page 1 whenever the filtered roster shrinks below the current
  // window — keeps the user from staring at an empty page after a search
  // narrows the list.
  useEffect(() => {
    setPage(1);
  }, [rows.length]);
  const { slice } = usePageSlice(rows, page, pageSize);

  if (loading) {
    return <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('common.loading')}</p>;
  }
  if (rows.length === 0) {
    return <EmptyState title={t('students.emptyRoster')} />;
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('students.colName')}</TableHead>
            <TableHead>{t('students.colEmail')}</TableHead>
            <TableHead>{t('students.colNumber')}</TableHead>
            <TableHead>{t('students.colStatus')}</TableHead>
            <TableHead className="text-right">{t('common.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slice.map((r) => {
            // For enrolled students, surface their TOTAL active enrollments
            // (across all courses) so teachers see who's juggling more than
            // this one course at a glance. Dropped/completed keep the simple
            // label — the count isn't actionable for them.
            const label =
              r.status === 'enrolled' && r.enrolledCourseCount != null
                ? t('students.statusEnrolledCount', { count: r.enrolledCourseCount })
                : t(`students.status${r.status[0]!.toUpperCase()}${r.status.slice(1)}`);
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.studentName}</TableCell>
                <TableCell className="text-muted-foreground">{r.studentEmail}</TableCell>
                <TableCell className="text-muted-foreground">{r.studentNumber ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{label}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <ActionIconButton
                      icon={Pencil}
                      label={t('studentProfile.editCta')}
                      color="yellow"
                      size="sm"
                      onClick={() => onEdit(r)}
                    />
                    <ActionIconButton
                      icon={Mail}
                      label={t('messages.composeCta')}
                      color="sky"
                      size="sm"
                      onClick={() => onMessage(r)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={rows.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />
    </>
  );
}

type GroupedTableProps = {
  t: (k: string, v?: Record<string, unknown>) => string;
  set: NonNullable<ReturnType<typeof useGroupSet>['data']>;
  studentById: Map<string, EnrollmentRow>;
  matchesSearch: (name: string, email: string) => boolean;
  assignTargetId: string;
  onPickAssignTarget: (id: string) => void;
  onAssign: (groupId: string, opts?: { force?: boolean }) => void;
  onRemove: (groupId: string, studentId: string) => void;
  assignBusy: boolean;
  removeBusy: boolean;
};

function GroupedRosterTable({
  t,
  set,
  studentById,
  matchesSearch,
  assignTargetId,
  onPickAssignTarget,
  onAssign,
  onRemove,
  assignBusy,
  removeBusy,
}: GroupedTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40%]">{t('students.colName')}</TableHead>
          <TableHead>{t('students.colEmail')}</TableHead>
          <TableHead>{t('students.colNumber')}</TableHead>
          <TableHead className="text-right">{t('common.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {set.groups.map((g) => {
          const effectiveMax = g.maxMembersOverride ?? set.maxMembersPerGroup;
          const remaining = effectiveMax - g.members.length;
          const full = remaining <= 0;
          const hasOverride = g.maxMembersOverride !== null;
          const visibleMembers = g.members.filter((m) => matchesSearch(m.name, m.email));
          return (
            <GroupBlock
              key={g.id}
              t={t}
              title={`${set.name} · ${g.name}`}
              statusBadge={
                full
                  ? {
                      label: `${g.members.length}/${effectiveMax}${hasOverride ? ' ↑' : ''} · ${t('groups.groupFull')}`,
                      variant: 'destructive' as const,
                    }
                  : {
                      label: `${g.members.length}/${effectiveMax}${hasOverride ? ' ↑' : ''}`,
                      variant: 'secondary' as const,
                    }
              }
              rightSlot={
                <div className="flex items-center gap-1.5">
                  <select
                    value={assignTargetId}
                    onChange={(e) => onPickAssignTarget(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="">{t('students.pickStudent')}</option>
                    {set.unassignedStudents.map((u) => (
                      <option key={u.studentId} value={u.studentId}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  {full && assignTargetId ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-500/60 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
                      disabled={assignBusy}
                      onClick={() => onAssign(g.id, { force: true })}
                      title={t('groups.addAnywayHint', { next: g.members.length + 1 })}
                    >
                      {t('groups.addAnyway', { next: g.members.length + 1 })}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!assignTargetId || full || assignBusy}
                      onClick={() => onAssign(g.id)}
                    >
                      {t('groups.assignCta')}
                    </Button>
                  )}
                </div>
              }
            >
              {visibleMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-xs text-muted-foreground">
                    {g.members.length === 0 ? t('common.none') : t('students.noSearchMatch')}
                  </TableCell>
                </TableRow>
              ) : (
                visibleMembers.map((m) => {
                  const student = studentById.get(m.studentId);
                  return (
                    <TableRow key={m.studentId}>
                      <TableCell className="pl-8 font-medium">{m.name}</TableCell>
                      <TableCell className="text-muted-foreground">{m.email}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {student?.studentNumber ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={removeBusy}
                          onClick={() => onRemove(g.id, m.studentId)}
                          aria-label={t('groups.removeCta')}
                        >
                          <UserMinus className="h-4 w-4" aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </GroupBlock>
          );
        })}

        {/* Unassigned bucket */}
        {set.unassignedStudents.length > 0 ? (
          <GroupBlock
            t={t}
            title={t('students.unassignedRow')}
            statusBadge={{
              label: String(set.unassignedStudents.length),
              variant: 'secondary' as const,
            }}
          >
            {set.unassignedStudents
              .filter((u) => matchesSearch(u.name, u.email))
              .map((u) => {
                const student = studentById.get(u.studentId);
                return (
                  <TableRow key={u.studentId}>
                    <TableCell className="pl-8 font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {student?.studentNumber ?? '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {t('students.pickGroupAbove')}
                    </TableCell>
                  </TableRow>
                );
              })}
          </GroupBlock>
        ) : null}
      </TableBody>
    </Table>
  );
}

function GroupBlock({
  t,
  title,
  statusBadge,
  rightSlot,
  children,
}: {
  t: (k: string, v?: Record<string, unknown>) => string;
  title: string;
  statusBadge: { label: string; variant: 'secondary' | 'destructive' | 'success' | 'info' };
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  void t; // reserved for future labels
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={4} className="py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{title}</span>
            <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
            <div className="ml-auto">{rightSlot}</div>
          </div>
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}
