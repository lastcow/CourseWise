import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  CreateQuizQuestionInput,
  QuizQuestionTeacherView,
  QuizQuestionType,
  UpdateQuizQuestionInput,
} from '@coursewise/shared';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { QuizSchedulesEditor } from '@/components/teacher/QuizSchedulesEditor';
import {
  useAssignmentGroups,
  useCreateQuizQuestion,
  useDeleteQuizQuestion,
  useQuiz,
  useQuizQuestions,
  useUpdateQuiz,
  useUpdateQuizQuestion,
} from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';
import { toDatetimeLocalValue } from '@/lib/utils';

const QUESTION_TYPES: QuizQuestionType[] = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'short_answer',
  'case_analysis',
];

interface QuestionDraft {
  prompt: string;
  type: QuizQuestionType;
  options: string[];
  correctAnswers: number[] | boolean;
  explanation: string;
  points: number;
}

function emptyDraft(): QuestionDraft {
  return {
    prompt: '',
    type: 'single_choice',
    options: ['', ''],
    correctAnswers: [],
    explanation: '',
    points: 1,
  };
}

function isTeacherQuestion(q: unknown): q is QuizQuestionTeacherView {
  return !!q && typeof q === 'object' && 'correctAnswers' in (q as object);
}

export function TeacherQuizEditorPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId, quizId } = useParams();
  const id = quizId ?? '';
  const cid = courseId ?? '';
  const quiz = useQuiz(id);
  const questions = useQuizQuestions(id);
  const updateQuiz = useUpdateQuiz(cid);
  const createQ = useCreateQuizQuestion(id);
  const updateQ = useUpdateQuizQuestion(id);
  const delQ = useDeleteQuizQuestion(id);
  const groups = useAssignmentGroups(cid);
  const toast = useToast();
  const confirm = useConfirm();

  const [meta, setMeta] = useState({
    title: '',
    description: '',
    timeLimitMinutes: '',
    groupId: null as string | null,
    lockdown: false,
    // Scheduling window (datetime-local strings). startTime + endTime
    // gate when students can open an attempt; untilDate caps an
    // in-progress attempt to min(startedAt + timeLimit, untilDate).
    startTime: '',
    endTime: '',
    untilDate: '',
  });
  const [draft, setDraft] = useState<QuestionDraft>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (quiz.data) {
      setMeta({
        title: quiz.data.title,
        description: quiz.data.description ?? '',
        timeLimitMinutes:
          quiz.data.timeLimitMinutes != null ? String(quiz.data.timeLimitMinutes) : '',
        groupId: quiz.data.groupId ?? null,
        lockdown: quiz.data.lockdown,
        startTime: toDatetimeLocalValue(quiz.data.startTime),
        endTime: toDatetimeLocalValue(quiz.data.endTime),
        untilDate: toDatetimeLocalValue(quiz.data.untilDate),
      });
    }
  }, [quiz.data]);

  const teacherQuestions: QuizQuestionTeacherView[] = (questions.data ?? []).filter(
    isTeacherQuestion,
  );

  function loadIntoDraft(q: QuizQuestionTeacherView) {
    let correct: number[] | boolean = [];
    if (q.type === 'true_false') {
      const ca = q.correctAnswers;
      if (typeof ca === 'boolean') correct = ca;
      else if (ca === 'true') correct = true;
      else if (ca === 'false') correct = false;
      else correct = false;
    } else if (Array.isArray(q.correctAnswers)) {
      correct = q.correctAnswers
        .map((x) => (typeof x === 'number' ? x : Number.parseInt(String(x), 10)))
        .filter((x) => Number.isFinite(x));
    } else if (typeof q.correctAnswers === 'number') {
      correct = [q.correctAnswers];
    }
    setDraft({
      prompt: q.prompt,
      type: q.type,
      options: q.options ?? [],
      correctAnswers: correct,
      explanation: q.explanation ?? '',
      points: q.points,
    });
    setEditingId(q.id);
  }

  async function saveDraft() {
    if (!draft.prompt.trim()) return;
    const isChoice = draft.type === 'single_choice' || draft.type === 'multiple_choice';
    const isTrueFalse = draft.type === 'true_false';
    let correctPayload: unknown = draft.correctAnswers;
    if (isChoice) {
      if (!Array.isArray(draft.correctAnswers)) correctPayload = [];
      else correctPayload = (draft.correctAnswers as number[]).filter((i) => i < draft.options.length);
    }
    const payload: CreateQuizQuestionInput | UpdateQuizQuestionInput = {
      prompt: draft.prompt.trim(),
      type: draft.type,
      options: isChoice
        ? draft.options.map((o) => o.trim()).filter((o) => o.length > 0)
        : isTrueFalse
          ? ['True', 'False']
          : null,
      correctAnswers: correctPayload,
      explanation: draft.explanation.trim() || null,
      points: draft.points,
    };
    try {
      if (editingId) {
        const { type: _t, ...patch } = payload as CreateQuizQuestionInput;
        await updateQ.mutateAsync({ id: editingId, input: patch });
        toast.push({ title: t('quizzes.questionSaved'), tone: 'success' });
      } else {
        await createQ.mutateAsync(payload as CreateQuizQuestionInput);
        toast.push({ title: t('quizzes.questionAdded'), tone: 'success' });
      }
      setDraft(emptyDraft());
      setEditingId(null);
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="outline" size="sm">
          <Link to={`/teacher/courses/${cid}/quizzes`}>← {t('common.back')}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('quizzes.settingsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t('quizzes.titleLabel')}</Label>
            <Input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
          </div>
          <div>
            <Label>{t('quizzes.descriptionLabel')}</Label>
            <Textarea
              value={meta.description}
              onChange={(e) => setMeta({ ...meta, description: e.target.value })}
            />
          </div>
          <div>
            <Label>{t('quizzes.timeLimit')}</Label>
            <Input
              type="number"
              min={1}
              value={meta.timeLimitMinutes}
              onChange={(e) => setMeta({ ...meta, timeLimitMinutes: e.target.value })}
            />
          </div>
          <div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={meta.lockdown}
                onChange={(e) => setMeta({ ...meta, lockdown: e.target.checked })}
              />
              <span>
                <span className="font-medium">{t('quizzes.lockdownLabel')}</span>
                <span className="block text-xs text-muted-foreground">
                  {t('quizzes.lockdownHelp')}
                </span>
              </span>
            </label>
          </div>
          <div>
            <Label htmlFor="quiz-group">{t('quizzes.groupLabel')}</Label>
            <select
              id="quiz-group"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={meta.groupId ?? ''}
              onChange={(e) => setMeta({ ...meta, groupId: e.target.value || null })}
              disabled={groups.isLoading || !!quiz.data?.setId}
            >
              <option value="">{t('quizzes.unassignedGroup')}</option>
              {(groups.data ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {quiz.data?.setId ? (
              <p className="mt-1 text-xs text-muted-foreground">{t('quizzes.inSetNote')}</p>
            ) : null}
          </div>
          <fieldset className="grid gap-3 rounded-md border p-3 md:grid-cols-3">
            <legend className="px-1 text-sm font-medium">
              {t('assignments.schedulingLegend')}
            </legend>
            <div>
              <Label htmlFor="q-start">{t('assignments.startDateLabel')}</Label>
              <Input
                id="q-start"
                type="datetime-local"
                value={meta.startTime}
                onChange={(e) => setMeta({ ...meta, startTime: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('assignments.startDateHint')}
              </p>
            </div>
            <div>
              <Label htmlFor="q-end">{t('assignments.endDateLabel')}</Label>
              <Input
                id="q-end"
                type="datetime-local"
                value={meta.endTime}
                onChange={(e) => setMeta({ ...meta, endTime: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('assignments.endDateHint')}
              </p>
            </div>
            <div>
              <Label htmlFor="q-until">{t('assignments.untilDateLabel')}</Label>
              <Input
                id="q-until"
                type="datetime-local"
                value={meta.untilDate}
                onChange={(e) => setMeta({ ...meta, untilDate: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('quizzes.untilDateHint')}
              </p>
            </div>
          </fieldset>
          <div>
            <Button
              onClick={async () => {
                const startIso = meta.startTime ? new Date(meta.startTime).toISOString() : null;
                const endIso = meta.endTime ? new Date(meta.endTime).toISOString() : null;
                const untilIso = meta.untilDate ? new Date(meta.untilDate).toISOString() : null;
                const sMs = startIso ? Date.parse(startIso) : null;
                const eMs = endIso ? Date.parse(endIso) : null;
                const uMs = untilIso ? Date.parse(untilIso) : null;
                if (
                  (sMs !== null && eMs !== null && sMs > eMs) ||
                  (eMs !== null && uMs !== null && eMs > uMs) ||
                  (sMs !== null && uMs !== null && sMs > uMs)
                ) {
                  toast.push({
                    title: t('assignments.schedulingOrderError'),
                    tone: 'error',
                  });
                  return;
                }
                await updateQuiz.mutateAsync({
                  id,
                  input: {
                    title: meta.title.trim(),
                    description: meta.description.trim() || null,
                    timeLimitMinutes: meta.timeLimitMinutes
                      ? Number.parseInt(meta.timeLimitMinutes, 10)
                      : null,
                    groupId: meta.groupId,
                    lockdown: meta.lockdown,
                    startTime: startIso,
                    endTime: endIso,
                    untilDate: untilIso,
                  },
                });
                toast.push({ title: t('quizzes.settingsSaved'), tone: 'success' });
              }}
            >
              {t('common.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {id ? <QuizSchedulesEditor quizId={id} courseId={cid} quiz={quiz.data} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('quizzes.questionsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {teacherQuestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('quizzes.noQuestionsYet')}</p>
          ) : (
            <ol className="space-y-2">
              {teacherQuestions.map((q, idx) => (
                <li
                  key={q.id}
                  className="rounded-md border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {idx + 1}. {q.prompt}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t(`quizzes.type.${q.type}`)} · {t('quizzes.pointsValue', { points: q.points })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ActionIconButton
                        size="sm"
                        icon={Pencil}
                        label={t('common.edit')}
                        color="yellow"
                        onClick={() => loadIntoDraft(q)}
                      />
                      <ActionIconButton
                        size="sm"
                        icon={Trash2}
                        label={t('common.delete')}
                        color="red"
                        onClick={async () => {
                          const ok = await confirm({
                            title: t('quizzes.deleteQuestionTitle'),
                            description: t('quizzes.deleteQuestionBody'),
                            detail: {
                              name: q.prompt,
                              facts: [
                                {
                                  label: t(`quizzes.type.${q.type}`),
                                  value: t('quizzes.pointsValue', { points: q.points }),
                                },
                              ],
                            },
                            confirmLabel: t('common.delete'),
                          });
                          if (!ok) return;
                          await delQ.mutateAsync(q.id);
                          if (editingId === q.id) {
                            setEditingId(null);
                            setDraft(emptyDraft());
                          }
                        }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {editingId ? t('quizzes.editQuestion') : t('quizzes.addQuestion')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t('quizzes.prompt')}</Label>
            <Textarea
              value={draft.prompt}
              onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('quizzes.questionType')}</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={draft.type}
                onChange={(e) => {
                  const t = e.target.value as QuizQuestionType;
                  setDraft((d) => ({
                    ...d,
                    type: t,
                    options:
                      t === 'single_choice' || t === 'multiple_choice'
                        ? d.options.length >= 2
                          ? d.options
                          : ['', '']
                        : t === 'true_false'
                          ? ['True', 'False']
                          : [],
                    correctAnswers: t === 'true_false' ? false : [],
                  }));
                }}
              >
                {QUESTION_TYPES.map((opt) => (
                  <option key={opt} value={opt}>
                    {t(`quizzes.type.${opt}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t('quizzes.pointsLabel')}</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={draft.points}
                onChange={(e) =>
                  setDraft({ ...draft, points: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </div>
          </div>

          {draft.type === 'single_choice' || draft.type === 'multiple_choice' ? (
            <div className="space-y-2">
              <Label>{t('quizzes.options')}</Label>
              {draft.options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type={draft.type === 'single_choice' ? 'radio' : 'checkbox'}
                    checked={
                      Array.isArray(draft.correctAnswers) && draft.correctAnswers.includes(idx)
                    }
                    onChange={() => {
                      setDraft((d) => {
                        if (d.type === 'single_choice') {
                          return { ...d, correctAnswers: [idx] };
                        }
                        const set = new Set(
                          Array.isArray(d.correctAnswers) ? d.correctAnswers : [],
                        );
                        if (set.has(idx)) set.delete(idx);
                        else set.add(idx);
                        return { ...d, correctAnswers: Array.from(set).sort() };
                      });
                    }}
                  />
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const next = [...draft.options];
                      next[idx] = e.target.value;
                      setDraft({ ...draft, options: next });
                    }}
                    placeholder={t('quizzes.optionPlaceholder', { index: idx + 1 })}
                  />
                  {draft.options.length > 2 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const next = draft.options.filter((_, i) => i !== idx);
                        const correct = Array.isArray(draft.correctAnswers)
                          ? draft.correctAnswers
                              .filter((i) => i !== idx)
                              .map((i) => (i > idx ? i - 1 : i))
                          : draft.correctAnswers;
                        setDraft({ ...draft, options: next, correctAnswers: correct });
                      }}
                    >
                      ×
                    </Button>
                  ) : null}
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDraft({ ...draft, options: [...draft.options, ''] })}
              >
                {t('quizzes.addOption')}
              </Button>
            </div>
          ) : null}

          {draft.type === 'true_false' ? (
            <div className="space-y-2">
              <Label>{t('quizzes.correctAnswer')}</Label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={draft.correctAnswers === true}
                    onChange={() => setDraft({ ...draft, correctAnswers: true })}
                  />
                  {t('quizzes.true')}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={draft.correctAnswers === false}
                    onChange={() => setDraft({ ...draft, correctAnswers: false })}
                  />
                  {t('quizzes.false')}
                </label>
              </div>
            </div>
          ) : null}

          {draft.type === 'short_answer' || draft.type === 'case_analysis' ? (
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
              {t('quizzes.manualGradingNote')}
            </p>
          ) : null}

          <div>
            <Label>{t('quizzes.explanation')}</Label>
            <Textarea
              value={draft.explanation}
              onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={saveDraft}>
              {editingId ? t('common.save') : t('quizzes.addQuestion')}
            </Button>
            {editingId ? (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingId(null);
                  setDraft(emptyDraft());
                }}
              >
                {t('common.cancel')}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
