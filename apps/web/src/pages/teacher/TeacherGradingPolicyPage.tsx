import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UpdateGradingPolicyInput } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  useAssignmentGroups,
  useAssignmentSets,
  useCreateAssignmentGroup,
  useCreateAssignmentSet,
  useDeleteAssignmentGroup,
  useDeleteAssignmentSet,
  useGradingPolicy,
  useUpdateAssignmentGroup,
  useUpdateAssignmentSet,
  useUpdateGradingPolicy,
} from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';

export function TeacherGradingPolicyPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cid = courseId ?? '';
  const policy = useGradingPolicy(cid || null);
  const groups = useAssignmentGroups(cid || undefined);
  const updatePolicy = useUpdateGradingPolicy(cid);
  const createGroup = useCreateAssignmentGroup(cid);
  const updateGroup = useUpdateAssignmentGroup(cid);
  const deleteGroup = useDeleteAssignmentGroup(cid);
  const sets = useAssignmentSets(cid || undefined);
  const createSet = useCreateAssignmentSet(cid);
  const updateSet = useUpdateAssignmentSet(cid);
  const deleteSet = useDeleteAssignmentSet(cid);
  const toast = useToast();

  const [attendanceWeight, setAttendanceWeight] = useState<number>(10);
  const [attendanceLoaded, setAttendanceLoaded] = useState(false);

  useEffect(() => {
    if (policy.data && !attendanceLoaded) {
      setAttendanceWeight(policy.data.weightAttendance);
      setAttendanceLoaded(true);
    }
  }, [policy.data, attendanceLoaded]);

  const groupList = groups.data ?? [];
  const totalGroupWeight = groupList.reduce((acc, g) => acc + (g.weight || 0), 0);
  const totalWeight = totalGroupWeight + (attendanceWeight || 0);
  const balanced = totalWeight === 100;

  async function onSaveAttendance() {
    const input: UpdateGradingPolicyInput = { weightAttendance: attendanceWeight };
    try {
      await updatePolicy.mutateAsync(input);
      toast.push({ title: t('grading.attendanceSaved'), tone: 'success' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function onAddGroup() {
    try {
      await createGroup.mutateAsync({ name: t('grading.newGroupDefaultName'), weight: 0 });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function onUpdateGroupField(
    groupId: string,
    patch: { name?: string; weight?: number },
  ) {
    try {
      await updateGroup.mutateAsync({ groupId, ...patch });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function onDeleteGroup(groupId: string, name: string) {
    // Native confirm — Canvas does the same; a proper dialog can come later.
    // eslint-disable-next-line no-alert
    if (!confirm(t('grading.groupDeleteConfirm', { name }))) return;
    try {
      await deleteGroup.mutateAsync(groupId);
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  const setList = sets.data ?? [];

  async function onAddSet() {
    try {
      await createSet.mutateAsync({ name: t('grading.newSetDefaultName'), scoringRule: 'average' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function onUpdateSetField(
    setId: string,
    patch: { name?: string; groupId?: string | null; scoringRule?: 'average' | 'highest' },
  ) {
    try {
      await updateSet.mutateAsync({ setId, ...patch });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function onDeleteSet(setId: string, name: string) {
    // eslint-disable-next-line no-alert
    if (!confirm(t('grading.setDeleteConfirm', { name }))) return;
    try {
      await deleteSet.mutateAsync(setId);
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('grading.policyTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {policy.isLoading ? (
            <p>{t('common.loading')}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('grading.attendanceWeightHint')}
              </p>
              <div className="flex items-end gap-3">
                <Label htmlFor="attendance-weight" className="space-y-1">
                  <span>{t('grading.attendanceWeightLabel')}</span>
                  <Input
                    id="attendance-weight"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={attendanceWeight}
                    onChange={(e) =>
                      setAttendanceWeight(Number(e.target.value) || 0)
                    }
                    className="w-32"
                  />
                </Label>
                <Button
                  onClick={onSaveAttendance}
                  disabled={updatePolicy.isPending || !attendanceLoaded}
                >
                  {t('grading.attendanceSave')}
                </Button>
              </div>
              {policy.data ? (
                <div className="text-xs text-muted-foreground">
                  {t('grading.version', { version: policy.data.version })}
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('grading.groupsCardTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {groups.isLoading ? (
            <p>{t('common.loading')}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('grading.groupsCardHint')}
              </p>
              {groupList.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('grading.groupsEmpty')}
                </p>
              ) : (
                <div className="space-y-2">
                  {groupList.map((g) => (
                    <div key={g.id} className="flex flex-wrap items-center gap-2">
                      <Input
                        defaultValue={g.name}
                        aria-label={t('grading.groupNameAria')}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== g.name) {
                            void onUpdateGroupField(g.id, { name: next });
                          }
                        }}
                        className="flex-1 min-w-[12rem]"
                      />
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        defaultValue={g.weight}
                        aria-label={t('grading.groupWeightAria')}
                        onBlur={(e) => {
                          const next = Number(e.target.value) || 0;
                          if (next !== g.weight) {
                            void onUpdateGroupField(g.id, { weight: next });
                          }
                        }}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">
                        {t('grading.groupItems', { count: g.itemCount ?? 0 })}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onDeleteGroup(g.id, g.name)}
                        disabled={deleteGroup.isPending}
                      >
                        {t('grading.groupDelete')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <Button
                  variant="outline"
                  onClick={onAddGroup}
                  disabled={createGroup.isPending}
                >
                  {t('grading.groupAdd')}
                </Button>
              </div>
              {!balanced && (groupList.length > 0 || (attendanceWeight ?? 0) > 0) ? (
                <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                  {t('grading.groupsImbalanced', { total: totalWeight })}
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('grading.setsCardTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {sets.isLoading ? (
            <p>{t('common.loading')}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('grading.setsCardHint')}</p>
              {setList.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('grading.setsEmpty')}</p>
              ) : (
                <div className="space-y-2">
                  {setList.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center gap-2">
                      <Input
                        defaultValue={s.name}
                        aria-label={t('grading.setNameAria')}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== s.name) {
                            void onUpdateSetField(s.id, { name: next });
                          }
                        }}
                        className="flex-1 min-w-[12rem]"
                      />
                      <select
                        aria-label={t('grading.setCategoryAria')}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={s.groupId ?? ''}
                        onChange={(e) =>
                          void onUpdateSetField(s.id, { groupId: e.target.value || null })
                        }
                      >
                        <option value="">{t('grading.setNoCategory')}</option>
                        {groupList.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={t('grading.setRuleAria')}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={s.scoringRule}
                        onChange={(e) =>
                          void onUpdateSetField(s.id, {
                            scoringRule: e.target.value as 'average' | 'highest',
                          })
                        }
                      >
                        <option value="average">{t('grading.setRuleAverage')}</option>
                        <option value="highest">{t('grading.setRuleHighest')}</option>
                      </select>
                      <span className="text-sm text-muted-foreground">
                        {t('grading.setMembers', { count: s.memberCount ?? 0 })}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onDeleteSet(s.id, s.name)}
                        disabled={deleteSet.isPending}
                      >
                        {t('grading.setDelete')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <Button variant="outline" onClick={onAddSet} disabled={createSet.isPending}>
                  {t('grading.setAdd')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
