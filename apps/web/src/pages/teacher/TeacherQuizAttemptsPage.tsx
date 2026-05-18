import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { QuizQuestionTeacherView } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import {
  useGradeQuizAnswer,
  useQuiz,
  useQuizAttempt,
  useQuizAttempts,
} from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';

function formatAnswer(value: unknown, q?: QuizQuestionTeacherView): string {
  if (value == null) return '—';
  if (q && (q.type === 'single_choice' || q.type === 'multiple_choice') && q.options) {
    const list = Array.isArray(value) ? value : [value];
    return list
      .map((i) => {
        const idx = typeof i === 'number' ? i : Number.parseInt(String(i), 10);
        return q.options?.[idx] ?? String(i);
      })
      .join(', ');
  }
  if (q?.type === 'true_false') {
    return value === true || value === 'true' ? 'True' : 'False';
  }
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function TeacherQuizAttemptsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId, quizId } = useParams();
  const cid = courseId ?? '';
  const id = quizId ?? '';
  const quiz = useQuiz(id);
  const attempts = useQuizAttempts(id);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const attempt = useQuizAttempt(selectedAttemptId);
  const grade = useGradeQuizAnswer(selectedAttemptId ?? '', id);
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, { points: string; feedback: string }>>(
    {},
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">
          {t('quizzes.attemptsFor', { title: quiz.data?.title ?? '…' })}
        </h2>
        <Button asChild variant="outline" size="sm">
          <Link to={`/teacher/courses/${cid}/quizzes`}>← {t('common.back')}</Link>
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('quizzes.attemptsListTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {attempts.isLoading ? (
              <p>{t('common.loading')}</p>
            ) : !attempts.data || attempts.data.length === 0 ? (
              <EmptyState title={t('quizzes.noAttempts')} />
            ) : (
              <ul className="space-y-1">
                {attempts.data.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedAttemptId(a.id)}
                      className={`w-full rounded-md border p-2 text-left text-sm transition hover:bg-accent ${
                        selectedAttemptId === a.id ? 'border-primary bg-accent' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{a.student.name}</span>
                        <Badge variant={a.teacherReviewed ? 'success' : 'secondary'}>
                          {t(`quizzes.attemptStatus.${a.status}`)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {a.score ?? '—'} / {a.maxScore ?? '—'} ·{' '}
                        {a.teacherReviewed
                          ? t('quizzes.reviewed')
                          : t('quizzes.pendingReview')}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('quizzes.gradingTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!attempt.data ? (
              <p className="text-sm text-muted-foreground">{t('quizzes.pickAttempt')}</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm">
                  {t('quizzes.totalScore')}: {attempt.data.score ?? '—'} /{' '}
                  {attempt.data.maxScore ?? '—'}
                </p>
                {attempt.data.questions.map((q, idx) => {
                  const tq = q as QuizQuestionTeacherView;
                  const ans = attempt.data?.answers.find((a) => a.questionId === q.id);
                  const draftKey = ans?.id ?? '';
                  const draftRow = draft[draftKey] ?? {
                    points: ans?.pointsAwarded != null ? String(ans.pointsAwarded) : '',
                    feedback: ans?.feedback ?? '',
                  };
                  return (
                    <div key={q.id} className="rounded-md border p-3">
                      <p className="font-medium">
                        {idx + 1}. {q.prompt}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t(`quizzes.type.${q.type}`)} ·{' '}
                        {t('quizzes.pointsValue', { points: q.points })}
                      </p>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <div>
                          <Label>{t('quizzes.studentAnswer')}</Label>
                          <div className="rounded-md bg-muted p-2 text-sm">
                            {formatAnswer(ans?.answer, tq)}
                          </div>
                        </div>
                        <div>
                          <Label>{t('quizzes.correctAnswer')}</Label>
                          <div className="rounded-md bg-emerald-50 p-2 text-sm">
                            {formatAnswer(tq.correctAnswers, tq)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_2fr_auto]">
                        <div>
                          <Label>{t('quizzes.pointsAwarded')}</Label>
                          <Input
                            type="number"
                            min={0}
                            max={tq.points}
                            value={draftRow.points}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                [draftKey]: { ...draftRow, points: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>{t('quizzes.feedback')}</Label>
                          <Textarea
                            value={draftRow.feedback}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                [draftKey]: { ...draftRow, feedback: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            size="sm"
                            disabled={!ans}
                            onClick={async () => {
                              if (!ans) return;
                              try {
                                await grade.mutateAsync({
                                  id: ans.id,
                                  input: {
                                    pointsAwarded: Number(draftRow.points) || 0,
                                    feedback: draftRow.feedback.trim() || null,
                                  },
                                });
                                toast.push({ title: t('quizzes.graded'), tone: 'success' });
                              } catch (err) {
                                toast.push({
                                  title: t(pickI18nKey(err, 'errors.internal')),
                                  tone: 'error',
                                });
                              }
                            }}
                          >
                            {t('common.save')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
