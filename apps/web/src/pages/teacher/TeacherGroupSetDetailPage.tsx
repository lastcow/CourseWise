import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Lock, Pencil, UserMinus, Unlock } from 'lucide-react';
import { ApiClientError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  useGroupSet,
  useJoinOrAssignGroupMember,
  useRemoveGroupMember,
  useUpdateGroup,
  useUpdateGroupSet,
} from '@/lib/queries';
import type { GroupWithMembers } from '@coursewise/shared';

export function TeacherGroupSetDetailPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId, setId } = useParams();
  const cId = courseId ?? '';
  const sId = setId ?? '';
  const toast = useToast();

  const q = useGroupSet(cId || undefined, sId || undefined);
  const updateSet = useUpdateGroupSet(cId);
  const updateGroup = useUpdateGroup(cId, sId);
  const assign = useJoinOrAssignGroupMember(cId, sId);
  const remove = useRemoveGroupMember(cId, sId);

  const [renameTarget, setRenameTarget] = useState<GroupWithMembers | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [assignStudentId, setAssignStudentId] = useState<string>('');

  const data = q.data;

  const onLockToggle = async () => {
    if (!data) return;
    try {
      await updateSet.mutateAsync({
        setId: sId,
        patch: { signupStatus: data.signupStatus === 'open' ? 'locked' : 'open' },
      });
      toast.push({ title: t('groups.setUpdated'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const startRename = (g: GroupWithMembers) => {
    setRenameTarget(g);
    setRenameValue(g.name);
  };

  const onRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await updateGroup.mutateAsync({
        groupId: renameTarget.id,
        patch: { name: renameValue.trim() },
      });
      toast.push({ title: t('groups.setUpdated'), tone: 'success' });
      setRenameTarget(null);
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onAssign = async (groupId: string) => {
    if (!assignStudentId) return;
    try {
      await assign.mutateAsync({ groupId, studentId: assignStudentId });
      toast.push({ title: t('groups.memberJoined'), tone: 'success' });
      setAssignStudentId('');
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onRemove = async (groupId: string, studentId: string) => {
    try {
      await remove.mutateAsync({ groupId, studentId });
      toast.push({ title: t('groups.memberRemoved'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  if (q.isLoading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">{t('common.error')}</p>;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/teacher/courses/${cId}/group-sets`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {t('groups.title')}
          </Link>
          <h2 className="mt-1 text-xl font-semibold">{data.name}</h2>
          <p className="text-xs text-muted-foreground">
            {t('groups.groupCountLabel', { count: data.groupCount })} ·{' '}
            {t('groups.memberCountLabel', { count: data.memberCount })} ·{' '}
            {t('groups.maxPerGroupLabel')}: {data.maxMembersPerGroup}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={data.signupStatus === 'open' ? 'success' : 'secondary'}>
            {data.signupStatus === 'open' ? t('groups.signupOpen') : t('groups.signupLocked')}
          </Badge>
          <Button variant="outline" size="sm" onClick={onLockToggle} disabled={updateSet.isPending}>
            {data.signupStatus === 'open' ? (
              <>
                <Lock className="h-4 w-4" aria-hidden /> {t('groups.lockSignup')}
              </>
            ) : (
              <>
                <Unlock className="h-4 w-4" aria-hidden /> {t('groups.unlockSignup')}
              </>
            )}
          </Button>
        </div>
      </header>

      <section className="rounded-md border p-3">
        <h3 className="mb-2 text-sm font-medium">{t('groups.unassignedTitle')}</h3>
        {data.unassignedStudents.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('groups.unassignedEmpty')}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={assignStudentId}
              onChange={(e) => setAssignStudentId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">—</option>
              {data.unassignedStudents.map((s) => (
                <option key={s.studentId} value={s.studentId}>
                  {s.name} ({s.email})
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              {data.unassignedStudents.length}
            </span>
          </div>
        )}
      </section>

      <ul className="space-y-2">
        {data.groups.map((g) => {
          const remaining = data.maxMembersPerGroup - g.members.length;
          const full = remaining <= 0;
          return (
            <li key={g.id} className="rounded-md border">
              <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{g.name}</span>
                  <Badge variant={full ? 'destructive' : 'secondary'}>
                    {full
                      ? t('groups.groupFull')
                      : t('groups.slotsLeft', {
                          remaining,
                          max: data.maxMembersPerGroup,
                        })}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void onAssign(g.id)}
                    disabled={!assignStudentId || full || assign.isPending}
                  >
                    {t('groups.assignCta')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startRename(g)}
                    aria-label={t('common.edit')}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
              {g.members.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">{t('common.none')}</p>
              ) : (
                <ul className="divide-y">
                  {g.members.map((m) => (
                    <li
                      key={m.studentId}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{m.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void onRemove(g.id, m.studentId)}
                        disabled={remove.isPending}
                        aria-label={t('groups.removeCta')}
                      >
                        <UserMinus className="h-4 w-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog
        open={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title={t('groups.renameGroupTitle')}
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="group-rename">{t('groups.groupNameLabel')}</Label>
            <Input
              id="group-rename"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onRename} disabled={updateGroup.isPending || !renameValue.trim()}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
