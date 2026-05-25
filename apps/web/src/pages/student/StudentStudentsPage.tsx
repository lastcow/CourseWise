import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, Pencil, RefreshCw, Users } from 'lucide-react';
import { MessageComposeDialog } from '@/components/messaging/MessageComposeDialog';
import { StudentProfileDialog } from '@/components/students/StudentProfileDialog';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
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
  useCourseStudents,
  useGroupSet,
  useGroupSets,
  useJoinOrAssignGroupMember,
  useRemoveGroupMember,
} from '@/lib/queries';
import { ApiClientError, getStoredAuth } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { EnrollmentRow } from '@coursewise/shared';

/**
 * Student-side roster view. Toolbar mirrors the teacher Students page:
 * search on the left, right-aligned outlined filter chips (All + one per
 * group set), refresh as the trailing icon button.
 *
 * "All" shows the flat enrolled-students roster (name + email — no
 * studentNumber for student callers). Picking a group-set chip pivots
 * the table into a grouped layout with capacity badges and self-join /
 * leave buttons on each group header row.
 */
export function StudentStudentsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cId = courseId ?? '';
  const toast = useToast();
  const myUserId = getStoredAuth()?.user.id ?? '';

  const studentsQ = useCourseStudents(cId || undefined);
  const groupSetsQ = useGroupSets(cId || undefined);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [messageTarget, setMessageTarget] = useState<{ id: string; name: string } | null>(null);
  const [editingOwn, setEditingOwn] = useState(false);
  const activeSetQ = useGroupSet(cId || undefined, activeSetId ?? undefined);
  const join = useJoinOrAssignGroupMember(cId, activeSetId ?? '');
  const leave = useRemoveGroupMember(cId, activeSetId ?? '');

  const refresh = () => {
    void studentsQ.refetch();
    void groupSetsQ.refetch();
    if (activeSetId) void activeSetQ.refetch();
  };

  const matchesSearch = (name: string, email: string) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return `${name} ${email}`.toLowerCase().includes(s);
  };

  const onJoin = async (groupId: string) => {
    try {
      await join.mutateAsync({ groupId });
      toast.push({ title: t('groups.memberJoined'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onLeave = async (groupId: string) => {
    try {
      await leave.mutateAsync({ groupId, studentId: myUserId });
      toast.push({ title: t('groups.memberRemoved'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const sets = useMemo(() => groupSetsQ.data ?? [], [groupSetsQ.data]);
  const set = activeSetQ.data ?? null;
  const myGroupId = set?.myGroupId ?? null;
  const isLocked = set?.signupStatus !== 'open';
  const isTeacherAssigned = set?.signupMode === 'teacher_assigned';

  const summary = useMemo(
    () => sets.find((s) => s.id === activeSetId) ?? null,
    [sets, activeSetId],
  );

  const flatStudents = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (studentsQ.data ?? []).filter((row) => {
      if (s && !`${row.studentName} ${row.studentEmail}`.toLowerCase().includes(s)) return false;
      return row.status === 'enrolled';
    });
  }, [studentsQ.data, search]);

  const fetching = studentsQ.isFetching || groupSetsQ.isFetching || activeSetQ.isFetching;

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t('students.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('students.helpStudent')}</p>
      </header>

      <div className="overflow-hidden rounded-md border">
        {/* Toolbar — layout mirrors the teacher Students page so the two
            views feel like the same screen with a permission delta. */}
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('students.searchPlaceholder')}
            className="h-8 w-56"
          />
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
            {sets.map((gs) => (
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
            <div className="mx-1 h-5 w-px bg-border" aria-hidden />
            <ActionIconButton
              icon={RefreshCw}
              label={t('common.refresh')}
              color="sky"
              size="sm"
              onClick={refresh}
              disabled={fetching}
              className={cn(fetching && '[&_svg]:animate-spin')}
            />
          </div>
        </div>

        {/* Per-set status bar (only when a filter is active) */}
        {summary ? (
          <div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2 text-sm">
            <span className="font-medium">{summary.name}</span>
            <Badge variant={summary.signupStatus === 'open' ? 'success' : 'secondary'}>
              {summary.signupStatus === 'open'
                ? t('groups.signupOpen')
                : t('groups.signupLocked')}
            </Badge>
            {set?.myGroupId ? (
              <span className="text-xs text-muted-foreground">
                {t('groups.currentlyInGroup', {
                  groupName:
                    set.groups.find((g) => g.id === set.myGroupId)?.name ?? '—',
                })}
              </span>
            ) : isLocked ? (
              <span className="text-xs text-muted-foreground">
                {t('groups.signupLockedNotice')}
              </span>
            ) : isTeacherAssigned ? (
              <span className="text-xs text-muted-foreground">
                {t('groups.teacherAssignedNotice')}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Body */}
        {activeSetId === null ? (
          <FlatRosterTable
            rows={flatStudents}
            loading={studentsQ.isLoading}
            myUserId={myUserId}
            onMessage={(row) =>
              setMessageTarget({ id: row.studentId, name: row.studentName })
            }
            onEditOwn={() => setEditingOwn(true)}
            t={t}
          />
        ) : !set ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {t('common.loading')}
          </p>
        ) : set.groups.length === 0 ? (
          <EmptyState title={t('groups.emptySetsStudent')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">{t('students.colName')}</TableHead>
                <TableHead>{t('students.colEmail')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {set.groups.map((g) => {
                const effectiveMax = g.maxMembersOverride ?? set.maxMembersPerGroup;
                const remaining = effectiveMax - g.members.length;
                const full = remaining <= 0;
                const isMine = myGroupId === g.id;
                const canJoin =
                  !myGroupId && !full && !isLocked && !isTeacherAssigned;
                const visibleMembers = g.members.filter((m) =>
                  matchesSearch(m.name, m.email),
                );
                return (
                  <Block key={g.id}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={3} className="py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={isMine ? 'font-semibold text-primary' : 'font-medium'}
                          >
                            {set.name} · {g.name}
                          </span>
                          <Badge variant={full ? 'destructive' : 'secondary'}>
                            {full
                              ? t('groups.groupFull')
                              : t('groups.slotsLeft', {
                                  remaining,
                                  max: effectiveMax,
                                })}
                          </Badge>
                          {isMine ? (
                            <Badge variant="info">{t('groups.yourGroup')}</Badge>
                          ) : null}
                          <div className="ml-auto">
                            {isMine ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isLocked || leave.isPending}
                                onClick={() => onLeave(g.id)}
                              >
                                {t('groups.leaveCta')}
                              </Button>
                            ) : canJoin ? (
                              <Button
                                size="sm"
                                disabled={join.isPending}
                                onClick={() => onJoin(g.id)}
                              >
                                {t('groups.joinCta')}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                    {visibleMembers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="pl-8 text-xs text-muted-foreground">
                          {g.members.length === 0
                            ? t('common.none')
                            : t('students.noSearchMatch')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      visibleMembers.map((m) => (
                        <TableRow key={m.studentId}>
                          <TableCell className="pl-8 font-medium">{m.name}</TableCell>
                          <TableCell className="text-muted-foreground">{m.email}</TableCell>
                          <TableCell />
                        </TableRow>
                      ))
                    )}
                  </Block>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {messageTarget ? (
        <MessageComposeDialog
          open
          onClose={() => setMessageTarget(null)}
          courseId={cId}
          recipientId={messageTarget.id}
          recipientName={messageTarget.name}
        />
      ) : null}

      {editingOwn && myUserId ? (
        <StudentProfileDialog
          open
          onClose={() => setEditingOwn(false)}
          userId={myUserId}
        />
      ) : null}
    </div>
  );
}

function FlatRosterTable({
  rows,
  loading,
  myUserId,
  onMessage,
  onEditOwn,
  t,
}: {
  rows: EnrollmentRow[];
  loading: boolean;
  myUserId: string;
  onMessage: (row: EnrollmentRow) => void;
  onEditOwn: () => void;
  t: (k: string, v?: Record<string, unknown>) => string;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  useEffect(() => {
    setPage(1);
  }, [rows.length]);
  const { slice } = usePageSlice(rows, page, pageSize);

  if (loading) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
    );
  }
  if (rows.length === 0) {
    return <EmptyState title={t('students.emptyRoster')} />;
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">{t('students.colName')}</TableHead>
            <TableHead>{t('students.colEmail')}</TableHead>
            <TableHead className="text-right">{t('common.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slice.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.studentName}</TableCell>
              <TableCell className="text-muted-foreground">{r.studentEmail}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  {r.studentId === myUserId ? (
                    <ActionIconButton
                      icon={Pencil}
                      label={t('studentProfile.editCta')}
                      color="yellow"
                      size="sm"
                      onClick={onEditOwn}
                    />
                  ) : (
                    <ActionIconButton
                      icon={Mail}
                      label={t('messages.composeCta')}
                      color="sky"
                      size="sm"
                      onClick={() => onMessage(r)}
                    />
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
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

/** Fragment wrapper so we can group header + member rows together. */
function Block({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
