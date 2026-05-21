import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, apiCall, getStoredAuth } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  useGroupSets,
  useJoinOrAssignGroupMember,
  useRemoveGroupMember,
} from '@/lib/queries';
import type { GroupSetWithGroups } from '@coursewise/shared';

/**
 * Student-side: one screen lists every group set in the course with its
 * groups stacked beneath. Self-signup is first-come-first-served while the
 * set is `open`; once `locked`, joining/leaving is disabled.
 */
export function StudentGroupSetsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = useGroupSets(id || undefined);
  const qc = useQueryClient();

  // Fan out one detail query per set so we can render groups + members. Each
  // detail call also reports `myGroupId`, which drives the join/leave UI.
  const detailQueries = useQueries({
    queries: (list.data ?? []).map((s) => ({
      queryKey: ['group-set', id, s.id],
      enabled: !!id,
      queryFn: () =>
        apiCall<GroupSetWithGroups>(`/api/courses/${id}/group-sets/${s.id}`),
    })),
  });

  if (list.isLoading) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  }
  const sets = list.data ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t('groups.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('groups.helpStudent')}</p>
      </header>

      {sets.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          {t('groups.emptySetsStudent')}
        </div>
      ) : (
        <div className="space-y-6">
          {sets.map((s, i) => {
            const detail = detailQueries[i]?.data;
            return (
              <SetCard
                key={s.id}
                courseId={id}
                set={detail ?? null}
                fallbackName={s.name}
                onChanged={() => {
                  void qc.invalidateQueries({ queryKey: ['group-sets', id] });
                  void qc.invalidateQueries({ queryKey: ['group-set', id, s.id] });
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function SetCard({
  courseId,
  set,
  fallbackName,
  onChanged,
}: {
  courseId: string;
  set: GroupSetWithGroups | null;
  fallbackName: string;
  onChanged: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const setId = set?.id ?? '';
  const join = useJoinOrAssignGroupMember(courseId, setId);
  const leave = useRemoveGroupMember(courseId, setId);
  const myUserId = getStoredAuth()?.user.id ?? '';

  if (!set) {
    return (
      <div className="rounded-md border p-4">
        <h3 className="font-medium">{fallbackName}</h3>
        <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  const locked = set.signupStatus !== 'open';
  const teacherAssigned = set.signupMode === 'teacher_assigned';

  const handleJoin = async (groupId: string) => {
    try {
      await join.mutateAsync({ groupId });
      toast.push({ title: t('groups.memberJoined'), tone: 'success' });
      onChanged();
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const handleLeave = async (groupId: string, studentId: string) => {
    try {
      await leave.mutateAsync({ groupId, studentId });
      toast.push({ title: t('groups.memberRemoved'), tone: 'success' });
      onChanged();
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const myGroup = set.groups.find((g) => g.id === set.myGroupId) ?? null;

  return (
    <section className="rounded-md border">
      <header className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{set.name}</h3>
          <Badge variant={locked ? 'secondary' : 'success'}>
            {locked ? t('groups.signupLocked') : t('groups.signupOpen')}
          </Badge>
        </div>
        {myGroup ? (
          <p className="text-xs text-muted-foreground">
            {t('groups.currentlyInGroup', { groupName: myGroup.name })}
          </p>
        ) : null}
      </header>

      {locked ? (
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">
          {t('groups.signupLockedNotice')}
        </p>
      ) : teacherAssigned ? (
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">
          {t('groups.teacherAssignedNotice')}
        </p>
      ) : null}

      <ul className="divide-y">
        {set.groups.map((g) => {
          const remaining = set.maxMembersPerGroup - g.members.length;
          const full = remaining <= 0;
          const isMine = myGroup?.id === g.id;
          const myMembership = isMine ? g.members.find((m) => m.studentId === myUserId) : null;
          return (
            <li key={g.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={isMine ? 'font-semibold text-primary' : 'font-medium'}>
                    {g.name}
                  </span>
                  <Badge variant={full ? 'destructive' : 'secondary'}>
                    {full
                      ? t('groups.groupFull')
                      : t('groups.slotsLeft', { remaining, max: set.maxMembersPerGroup })}
                  </Badge>
                  {isMine ? (
                    <Badge variant="info">{t('groups.yourGroup')}</Badge>
                  ) : null}
                </div>
                <div>
                  {isMine && myMembership ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={locked || leave.isPending}
                      onClick={() => void handleLeave(g.id, myMembership.studentId)}
                    >
                      {t('groups.leaveCta')}
                    </Button>
                  ) : !myGroup && !full && !locked && !teacherAssigned ? (
                    <Button
                      size="sm"
                      disabled={join.isPending}
                      onClick={() => void handleJoin(g.id)}
                    >
                      {t('groups.joinCta')}
                    </Button>
                  ) : null}
                </div>
              </div>
              {g.members.length > 0 ? (
                <ul className="mt-1 text-xs text-muted-foreground">
                  {g.members.map((m) => (
                    <li key={m.studentId}>{m.name}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
