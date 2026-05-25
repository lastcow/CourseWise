import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Trash2, Users } from 'lucide-react';
import { ApiClientError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { CapacityHint } from '@/components/groups/CapacityHint';
import { Input, Label } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  useCreateGroupSet,
  useDeleteGroupSet,
  useGroupSets,
} from '@/lib/queries';
import type { CreateGroupSetInput, GroupSetSummary } from '@coursewise/shared';
import { GROUP_SET_SIGNUP_MODES } from '@coursewise/shared';

export function TeacherGroupSetsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const toast = useToast();
  const list = useGroupSets(id || undefined);
  const create = useCreateGroupSet(id);
  const remove = useDeleteGroupSet(id);

  const [openCreate, setOpenCreate] = useState(false);
  const [name, setName] = useState('');
  const [numberOfGroups, setNumberOfGroups] = useState('4');
  const [maxMembersPerGroup, setMaxMembersPerGroup] = useState('4');
  const [signupMode, setSignupMode] = useState<CreateGroupSetInput['signupMode']>('self_signup');
  const [deleteTarget, setDeleteTarget] = useState<GroupSetSummary | null>(null);

  const resetForm = () => {
    setName('');
    setNumberOfGroups('4');
    setMaxMembersPerGroup('4');
    setSignupMode('self_signup');
  };

  const onCreate = async () => {
    const n = Number.parseInt(numberOfGroups, 10);
    const m = Number.parseInt(maxMembersPerGroup, 10);
    if (!name.trim() || !Number.isFinite(n) || n <= 0 || !Number.isFinite(m) || m <= 0) {
      toast.push({ title: t('common.error'), tone: 'error' });
      return;
    }
    try {
      await create.mutateAsync({
        name: name.trim(),
        numberOfGroups: n,
        maxMembersPerGroup: m,
        signupMode,
      });
      toast.push({ title: t('groups.setCreated'), tone: 'success' });
      setOpenCreate(false);
      resetForm();
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.push({ title: t('groups.setDeleted'), tone: 'success' });
      setDeleteTarget(null);
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const sets = list.data ?? [];

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">{t('groups.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('groups.helpTeacher')}</p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>{t('groups.newSetCta')}</Button>
      </header>

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : sets.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          {t('groups.emptySetsTeacher')}
        </div>
      ) : (
        <ul className="space-y-2">
          {sets.map((s) => (
            <li key={s.id} className="rounded-md border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/teacher/courses/${id}/group-sets/${s.id}`}
                      className="text-base font-medium hover:underline"
                    >
                      {s.name}
                    </Link>
                    <Badge variant={s.signupStatus === 'open' ? 'success' : 'secondary'}>
                      {s.signupStatus === 'open'
                        ? t('groups.signupOpen')
                        : t('groups.signupLocked')}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <Users className="mr-1 inline h-3 w-3" aria-hidden />
                    {t('groups.groupCountLabel', { count: s.groupCount })} ·{' '}
                    {t('groups.memberCountLabel', { count: s.memberCount })} ·{' '}
                    {t(`groups.signupMode${s.signupMode === 'self_signup' ? 'SelfSignup' : s.signupMode === 'teacher_assigned' ? 'TeacherAssigned' : 'Mixed'}`)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteTarget(s)}
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title={t('groups.newSetTitle')}
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="set-name">{t('groups.setNameLabel')}</Label>
            <Input
              id="set-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('groups.setNamePlaceholder')}
              maxLength={100}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="set-count">{t('groups.numberOfGroupsLabel')}</Label>
              <Input
                id="set-count"
                type="number"
                min={1}
                max={100}
                value={numberOfGroups}
                onChange={(e) => setNumberOfGroups(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="set-max">{t('groups.maxPerGroupLabel')}</Label>
              <Input
                id="set-max"
                type="number"
                min={1}
                max={100}
                value={maxMembersPerGroup}
                onChange={(e) => setMaxMembersPerGroup(e.target.value)}
              />
            </div>
          </div>
          <CapacityHint groups={numberOfGroups} maxPer={maxMembersPerGroup} />
          <div>
            <Label htmlFor="set-mode">{t('groups.signupModeLabel')}</Label>
            <select
              id="set-mode"
              value={signupMode}
              onChange={(e) =>
                setSignupMode(e.target.value as CreateGroupSetInput['signupMode'])
              }
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
            <Button onClick={onCreate} disabled={create.isPending}>
              {t('common.create')}
            </Button>
          </div>
        </div>
      </Dialog>

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
          <Button variant="destructive" disabled={remove.isPending} onClick={onDelete}>
            {t('common.delete')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
