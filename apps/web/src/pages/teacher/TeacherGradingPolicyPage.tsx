import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UpdateGradingPolicyInput } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useGradingPolicy, useUpdateGradingPolicy } from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';

const CATEGORIES = [
  'weightAttendance',
  'weightAssignments',
  'weightQuizzes',
  'weightDiscussion',
  'weightFinalProject',
] as const;

type WeightKey = (typeof CATEGORIES)[number];

export function TeacherGradingPolicyPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cid = courseId ?? '';
  const policy = useGradingPolicy(cid || null);
  const updatePolicy = useUpdateGradingPolicy(cid);
  const toast = useToast();

  const [weights, setWeights] = useState<Record<WeightKey, number>>({
    weightAttendance: 10,
    weightAssignments: 35,
    weightQuizzes: 30,
    weightDiscussion: 10,
    weightFinalProject: 15,
  });

  useEffect(() => {
    const d = policy.data;
    if (!d) return;
    setWeights({
      weightAttendance: d.weightAttendance,
      weightAssignments: d.weightAssignments,
      weightQuizzes: d.weightQuizzes,
      weightDiscussion: d.weightDiscussion,
      weightFinalProject: d.weightFinalProject,
    });
  }, [policy.data]);

  const sum = CATEGORIES.reduce((s, k) => s + (weights[k] || 0), 0);
  const valid = sum === 100;

  async function onSave() {
    if (!valid) return;
    const input: UpdateGradingPolicyInput = {
      weightAttendance: weights.weightAttendance,
      weightAssignments: weights.weightAssignments,
      weightQuizzes: weights.weightQuizzes,
      weightDiscussion: weights.weightDiscussion,
      weightFinalProject: weights.weightFinalProject,
    };
    try {
      await updatePolicy.mutateAsync(input);
      toast.push({ title: t('grading.policySaved'), tone: 'success' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('grading.policyTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {policy.isLoading ? (
          <p>{t('common.loading')}</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('grading.policyDescription')}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {CATEGORIES.map((k) => (
                <Label key={k} className="space-y-1">
                  <span>{t(`grading.${k}`)}</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={weights[k]}
                    onChange={(e) =>
                      setWeights((prev) => ({
                        ...prev,
                        [k]: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </Label>
              ))}
            </div>
            <div
              className={`text-sm ${valid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {t('grading.weightSum', { sum })}
            </div>
            {policy.data ? (
              <div className="text-xs text-muted-foreground">
                {t('grading.version', { version: policy.data.version })}
              </div>
            ) : null}
            <div className="flex justify-end">
              <Button onClick={onSave} disabled={!valid || updatePolicy.isPending}>
                {t('grading.savePolicy')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
