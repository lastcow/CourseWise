import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Pagination, usePageSlice } from '@/components/ui/pagination';
import { useQuizAttempts } from '@/lib/queries';

const PAGE_SIZE = 10;

const Muted = ({ text }: { text: string }): JSX.Element => (
  <p className="px-1 py-3 text-sm text-muted-foreground">{text}</p>
);

/**
 * Attempts roster shown when a quiz row is expanded. Quiz scores are computed
 * from per-question grading (there's no direct override), so this is read-only:
 * each attempt shows its review state + score and links to the grading page.
 * Searchable + paginated.
 */
export function QuizAttemptsSubsection({
  courseId,
  quizId,
}: {
  courseId: string;
  quizId: string;
}): JSX.Element {
  const { t } = useTranslation();
  const attempts = useQuizAttempts(quizId);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const rows = useMemo(() => attempts.data ?? [], [attempts.data]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (a) =>
        a.student.name.toLowerCase().includes(term) ||
        a.student.email.toLowerCase().includes(term),
    );
  }, [rows, search]);
  const { slice } = usePageSlice(filtered, page, PAGE_SIZE);

  if (attempts.isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }
  if (attempts.isError) return <Muted text={t('errors.internal')} />;
  if (rows.length === 0) return <Muted text={t('quizzes.noAttempts')} />;

  const reviewHref = `/teacher/courses/${courseId}/quizzes/${quizId}/attempts`;

  return (
    <div className="space-y-2">
      <div className="relative max-w-xs">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder={t('quizzes.attemptsSearchPlaceholder')}
          aria-label={t('quizzes.attemptsSearchPlaceholder')}
          className="h-9 w-full bg-background pl-8"
        />
      </div>
      {filtered.length === 0 ? (
        <Muted text={t('quizzes.attemptsNoMatch')} />
      ) : (
        <div className="overflow-hidden rounded-md border bg-card">
          <ul className="divide-y divide-border/70">
            {slice.map((a) => {
              const needsReview = a.submittedAt != null && !a.teacherReviewed;
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{a.student.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.student.email}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {needsReview ? (
                      <Badge variant="warning">{t('quizzes.pendingReview')}</Badge>
                    ) : a.teacherReviewed ? (
                      <Badge variant="success">{t('quizzes.reviewed')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t(`quizzes.attemptStatus.${a.status}`)}</Badge>
                    )}
                    <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                      {a.score ?? '—'} / {a.maxScore ?? '—'}
                    </span>
                    <Link
                      to={reviewHref}
                      className="whitespace-nowrap text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
                    >
                      {t('grading.detailReviewQuiz')}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
          {filtered.length > PAGE_SIZE ? (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
