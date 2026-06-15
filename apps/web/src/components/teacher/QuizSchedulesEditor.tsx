import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { QuizScheduleWithMembers, QuizSummary } from '@coursewise/shared';
import { Trash2, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Input, Label } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import {
  useCourseStudents,
  useCreateQuizSchedule,
  useDeleteQuizSchedule,
  useQuizSchedules,
  useSetScheduleMembers,
  useUpdateQuizSchedule,
} from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';
import { toDatetimeLocalValue } from '@/lib/utils';

// Show wave windows in the teacher's local time (the box is parsed back as local
// on save via toIso). See toDatetimeLocalValue for why the naive slice is wrong.
function toLocal(iso: string | null): string {
  return toDatetimeLocalValue(iso);
}
function toIso(local: string): string | null {
  return local ? new Date(local).toISOString() : null;
}

interface WaveForm {
  name: string;
  startTime: string;
  endTime: string;
  untilDate: string;
  timeLimitMinutes: string;
  maxAttempts: string;
}

function formFromWave(w: QuizScheduleWithMembers): WaveForm {
  return {
    name: w.name,
    startTime: toLocal(w.startTime),
    endTime: toLocal(w.endTime),
    untilDate: toLocal(w.untilDate),
    timeLimitMinutes: w.timeLimitMinutes != null ? String(w.timeLimitMinutes) : '',
    maxAttempts: w.maxAttempts != null ? String(w.maxAttempts) : '',
  };
}

function WaveRow({
  quizId,
  wave,
  quiz,
  enrolled,
}: {
  quizId: string;
  wave: QuizScheduleWithMembers;
  quiz: QuizSummary | null | undefined;
  enrolled: { studentId: string; studentName: string; studentEmail: string }[];
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const updateSchedule = useUpdateQuizSchedule(quizId);
  const delSchedule = useDeleteQuizSchedule(quizId);
  const setMembers = useSetScheduleMembers(quizId);
  // Seeded once from the server row. The parent keys this component on
  // `updatedAt`, so a saved edit remounts the row with fresh values; member
  // changes (which don't bump updatedAt) preserve any in-progress field edits.
  const [form, setForm] = useState<WaveForm>(() => formFromWave(wave));

  const memberIds = wave.members.map((m) => m.studentId);
  const memberIdSet = new Set(memberIds);
  const addable = enrolled.filter((s) => !memberIdSet.has(s.studentId));

  async function save() {
    const startIso = toIso(form.startTime);
    const endIso = toIso(form.endTime);
    const untilIso = toIso(form.untilDate);
    const s = startIso ? Date.parse(startIso) : null;
    const e = endIso ? Date.parse(endIso) : null;
    const u = untilIso ? Date.parse(untilIso) : null;
    if (
      (s !== null && e !== null && s > e) ||
      (e !== null && u !== null && e > u) ||
      (s !== null && u !== null && s > u)
    ) {
      toast.push({ title: t('assignments.schedulingOrderError'), tone: 'error' });
      return;
    }
    try {
      await updateSchedule.mutateAsync({
        scheduleId: wave.id,
        input: {
          name: form.name.trim() || wave.name,
          startTime: startIso,
          endTime: endIso,
          untilDate: untilIso,
          timeLimitMinutes: form.timeLimitMinutes
            ? Number.parseInt(form.timeLimitMinutes, 10)
            : null,
          maxAttempts: form.maxAttempts ? Number.parseInt(form.maxAttempts, 10) : null,
        },
      });
      toast.push({ title: t('quizzes.schedules.saved'), tone: 'success' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function setList(next: string[]) {
    try {
      await setMembers.mutateAsync({ scheduleId: wave.id, input: { studentIds: next } });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Input
            className="max-w-xs"
            value={form.name}
            onChange={(ev) => setForm({ ...form, name: ev.target.value })}
            aria-label={t('quizzes.schedules.waveName')}
          />
          {wave.isRemainder ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              {t('quizzes.schedules.remainderBadge')}
            </span>
          ) : null}
        </div>
        <ActionIconButton
          size="sm"
          icon={Trash2}
          label={t('common.delete')}
          color="red"
          onClick={async () => {
            const ok = await confirm({
              title: t('quizzes.schedules.deleteWaveTitle'),
              description: t('quizzes.schedules.deleteWaveBody'),
              detail: { name: form.name || wave.name },
              confirmLabel: t('common.delete'),
            });
            if (!ok) return;
            try {
              await delSchedule.mutateAsync(wave.id);
            } catch (err) {
              toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
            }
          }}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label>{t('assignments.startDateLabel')}</Label>
          <Input
            type="datetime-local"
            value={form.startTime}
            onChange={(ev) => setForm({ ...form, startTime: ev.target.value })}
          />
        </div>
        <div>
          <Label>{t('assignments.endDateLabel')}</Label>
          <Input
            type="datetime-local"
            value={form.endTime}
            onChange={(ev) => setForm({ ...form, endTime: ev.target.value })}
          />
        </div>
        <div>
          <Label>{t('assignments.untilDateLabel')}</Label>
          <Input
            type="datetime-local"
            value={form.untilDate}
            onChange={(ev) => setForm({ ...form, untilDate: ev.target.value })}
          />
        </div>
        <div>
          <Label>{t('quizzes.timeLimit')}</Label>
          <Input
            type="number"
            min={1}
            placeholder={
              quiz?.timeLimitMinutes != null
                ? String(quiz.timeLimitMinutes)
                : t('quizzes.schedules.inheritsQuizValue')
            }
            value={form.timeLimitMinutes}
            onChange={(ev) => setForm({ ...form, timeLimitMinutes: ev.target.value })}
          />
        </div>
        <div>
          <Label>{t('quizzes.schedules.maxAttemptsLabel')}</Label>
          <Input
            type="number"
            min={1}
            placeholder={quiz ? String(quiz.maxAttempts) : t('quizzes.schedules.inheritsQuizValue')}
            value={form.maxAttempts}
            onChange={(ev) => setForm({ ...form, maxAttempts: ev.target.value })}
          />
        </div>
        <div className="flex items-end">
          <Button size="sm" onClick={save} disabled={updateSchedule.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </div>

      {wave.isRemainder ? (
        <p className="text-xs text-muted-foreground">{t('quizzes.schedules.remainderHint')}</p>
      ) : (
        <div className="space-y-2">
          <Label>
            {t('quizzes.schedules.members')} ({wave.members.length})
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {wave.members.map((m) => (
              <span
                key={m.studentId}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
              >
                {m.name}
                <button
                  type="button"
                  aria-label={t('common.remove')}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setList(memberIds.filter((id) => id !== m.studentId))}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {wave.members.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                {t('quizzes.schedules.noMembers')}
              </span>
            ) : null}
          </div>
          <Combobox
            className="max-w-sm"
            icon={UserPlus}
            options={addable.map((s) => ({
              value: s.studentId,
              label: s.studentName,
              description: s.studentEmail,
            }))}
            placeholder={t('quizzes.schedules.addStudent')}
            searchPlaceholder={t('quizzes.schedules.searchStudents')}
            emptyText={t('quizzes.schedules.noStudentMatch')}
            ariaLabel={t('quizzes.schedules.addStudent')}
            disabled={setMembers.isPending || addable.length === 0}
            onSelect={(studentId) => setList([...memberIds, studentId])}
          />
        </div>
      )}
    </div>
  );
}

export function QuizSchedulesEditor({
  quizId,
  courseId,
  quiz,
}: {
  quizId: string;
  courseId: string;
  quiz: QuizSummary | null | undefined;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const schedules = useQuizSchedules(quizId);
  const roster = useCourseStudents(courseId);
  const createSchedule = useCreateQuizSchedule(quizId);

  const list = schedules.data?.schedules ?? [];
  const hasRemainder = list.some((w) => w.isRemainder);
  const remainderCount = schedules.data?.remainderPreview.count ?? 0;
  const enrolled = (roster.data ?? [])
    .filter((s) => s.status === 'enrolled')
    .map((s) => ({
      studentId: s.studentId,
      studentName: s.studentName,
      studentEmail: s.studentEmail,
    }));

  async function addWave(isRemainder: boolean) {
    try {
      await createSchedule.mutateAsync({
        name: isRemainder
          ? t('quizzes.schedules.remainderDefaultName')
          : t('quizzes.schedules.waveDefaultName', { n: list.filter((w) => !w.isRemainder).length + 1 }),
        isRemainder,
      });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>{t('quizzes.schedules.title')}</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => addWave(false)}>
            {t('quizzes.schedules.addWave')}
          </Button>
          <Button size="sm" variant="outline" disabled={hasRemainder} onClick={() => addWave(true)}>
            {t('quizzes.schedules.addRemainder')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('quizzes.schedules.intro')}</p>

        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('quizzes.schedules.none')}</p>
        ) : (
          <div className="space-y-3">
            {list.map((w) => (
              <WaveRow
                key={`${w.id}:${w.updatedAt}`}
                quizId={quizId}
                wave={w}
                quiz={quiz}
                enrolled={enrolled}
              />
            ))}
          </div>
        )}

        {list.length > 0 ? (
          <p
            className={
              !hasRemainder && remainderCount > 0
                ? 'rounded-md bg-amber-50 p-2 text-xs text-amber-900'
                : 'text-xs text-muted-foreground'
            }
          >
            {hasRemainder
              ? t('quizzes.schedules.absorbedByRemainder', { count: remainderCount })
              : remainderCount > 0
                ? t('quizzes.schedules.unscheduledBlocked', { count: remainderCount })
                : t('quizzes.schedules.allScheduled')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
