import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Users } from 'lucide-react';
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
import { useToast } from '@/components/ui/toast';
import {
  useGroupSet,
  useGroupSets,
  useJoinOrAssignGroupMember,
  useRemoveGroupMember,
} from '@/lib/queries';
import { ApiClientError, getStoredAuth } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Student-side roster view. Toolbar hosts a group-set filter; selecting a
 * set switches the table to a grouped layout showing every group, their
 * members, capacity, and self-signup buttons. Join is disabled when the
 * student is already in another group, the set is locked, or the group is
 * full.
 */
export function StudentStudentsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cId = courseId ?? '';
  const toast = useToast();
  const myUserId = getStoredAuth()?.user.id ?? '';

  const groupSetsQ = useGroupSets(cId || undefined);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const activeSetQ = useGroupSet(cId || undefined, activeSetId ?? undefined);
  const join = useJoinOrAssignGroupMember(cId, activeSetId ?? '');
  const leave = useRemoveGroupMember(cId, activeSetId ?? '');

  // Auto-pick the first available group set so the student lands in a
  // meaningful view; otherwise the page shows just an empty state.
  useEffect(() => {
    if (activeSetId === null && groupSetsQ.data && groupSetsQ.data.length > 0) {
      setActiveSetId(groupSetsQ.data[0]!.id);
    }
  }, [groupSetsQ.data, activeSetId]);

  const refresh = () => {
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

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t('students.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('students.helpStudent')}</p>
      </header>

      {sets.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          {t('groups.emptySetsStudent')}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('students.searchPlaceholder')}
              className="h-8 w-56"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={groupSetsQ.isFetching || activeSetQ.isFetching}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
            >
              <RefreshCw
                className={cn(
                  'h-4 w-4',
                  (groupSetsQ.isFetching || activeSetQ.isFetching) && 'animate-spin',
                )}
                aria-hidden
              />
            </Button>
            <div className="mx-2 h-5 w-px bg-border" aria-hidden />
            {sets.map((gs) => (
              <button
                key={gs.id}
                type="button"
                onClick={() => setActiveSetId(gs.id)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium',
                  activeSetId === gs.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-accent',
                )}
              >
                <Users className="h-3 w-3" aria-hidden />
                {gs.name}
              </button>
            ))}
          </div>

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

          {!set ? (
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
                  const remaining = set.maxMembersPerGroup - g.members.length;
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
                                    max: set.maxMembersPerGroup,
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
      )}
    </div>
  );
}

/** Fragment wrapper so we can group header + member rows together. */
function Block({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
