import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { UpdateGradingPolicyInput } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  useAssignmentGroups,
  useCreateAssignmentGroup,
  useDeleteAssignmentGroup,
  useGradingPolicy,
  useUpdateAssignmentGroup,
  useUpdateGradingPolicy,
} from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';

export function TeacherGradingPolicyPage(): JSX.Element {
  const { courseId } = useParams();
  const cid = courseId ?? '';
  const policy = useGradingPolicy(cid || null);
  const groups = useAssignmentGroups(cid || undefined);
  const updatePolicy = useUpdateGradingPolicy(cid);
  const createGroup = useCreateAssignmentGroup(cid);
  const updateGroup = useUpdateAssignmentGroup(cid);
  const deleteGroup = useDeleteAssignmentGroup(cid);
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
  const balanced = totalGroupWeight === 100;

  async function onSaveAttendance() {
    const input: UpdateGradingPolicyInput = { weightAttendance: attendanceWeight };
    try {
      await updatePolicy.mutateAsync(input);
      toast.push({ title: 'Attendance weight saved', tone: 'success' });
    } catch (err) {
      toast.push({ title: pickI18nKey(err, 'errors.internal'), tone: 'error' });
    }
  }

  async function onAddGroup() {
    try {
      await createGroup.mutateAsync({ name: 'New group', weight: 0 });
    } catch (err) {
      toast.push({ title: pickI18nKey(err, 'errors.internal'), tone: 'error' });
    }
  }

  async function onUpdateGroupField(
    groupId: string,
    patch: { name?: string; weight?: number },
  ) {
    try {
      await updateGroup.mutateAsync({ groupId, ...patch });
    } catch (err) {
      toast.push({ title: pickI18nKey(err, 'errors.internal'), tone: 'error' });
    }
  }

  async function onDeleteGroup(groupId: string, name: string) {
    // Native confirm — Canvas does the same; a proper dialog can come later.
    // eslint-disable-next-line no-alert
    if (!confirm(`Delete group "${name}"?`)) return;
    try {
      await deleteGroup.mutateAsync(groupId);
    } catch (err) {
      toast.push({ title: pickI18nKey(err, 'errors.internal'), tone: 'error' });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Grading policy</CardTitle>
        </CardHeader>
        <CardContent>
          {policy.isLoading ? (
            <p>Loading…</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Attendance weight is set here. Other categories are configured as assignment
                groups below.
              </p>
              <div className="flex items-end gap-3">
                <Label htmlFor="attendance-weight" className="space-y-1">
                  <span>Attendance weight (%)</span>
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
                  Save
                </Button>
              </div>
              {policy.data ? (
                <div className="text-xs text-muted-foreground">
                  Version {policy.data.version}
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assignment groups</CardTitle>
        </CardHeader>
        <CardContent>
          {groups.isLoading ? (
            <p>Loading…</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Group assignments, quizzes, and discussions into weighted categories. Group
                weights should sum to 100%.
              </p>
              {groupList.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No groups yet. Add one to start grouping items.
                </p>
              ) : (
                <div className="space-y-2">
                  {groupList.map((g) => (
                    <div key={g.id} className="flex flex-wrap items-center gap-2">
                      <Input
                        defaultValue={g.name}
                        aria-label="Group name"
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
                        aria-label="Group weight"
                        onBlur={(e) => {
                          const next = Number(e.target.value) || 0;
                          if (next !== g.weight) {
                            void onUpdateGroupField(g.id, { weight: next });
                          }
                        }}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">
                        items: {g.itemCount ?? 0}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onDeleteGroup(g.id, g.name)}
                        disabled={deleteGroup.isPending}
                      >
                        Delete
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
                  + Add group
                </Button>
              </div>
              {!balanced && groupList.length > 0 ? (
                <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                  Group weights total {totalGroupWeight}% — should be 100%.
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
