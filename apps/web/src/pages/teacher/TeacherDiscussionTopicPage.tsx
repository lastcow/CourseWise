import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  MessageSquare,
  MessagesSquare,
  Percent,
  Reply,
  Search,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea, Input, Label } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty';
import { Markdown, MarkdownView, stripMarkdown } from '@/components/ui/markdown';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { StatCard, StatGrid } from '@/components/dashboard/DashboardKit';
import type { DiscussionGradeRow, DiscussionPostSummary } from '@coursewise/shared';
import {
  useCreateDiscussionPost,
  useDeleteDiscussionPost,
  useDiscussionGrades,
  useDiscussionThread,
  useDiscussionTopic,
  useGradeDiscussion,
  useReplyDiscussionPost,
  useStudentPosts,
} from '@/lib/queries';
import { ApiClientError, pickI18nKey } from '@/lib/api';
import { cn } from '@/lib/utils';

// Spinner-free score input, same as the gradebook.
const SCORE_INPUT_CLASS =
  'w-20 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden';

const STUDENTS_PER_PAGE = 10;

interface ThreadNode {
  post: DiscussionPostSummary;
  children: ThreadNode[];
}

function nest(posts: DiscussionPostSummary[]): ThreadNode[] {
  const map = new Map<string, ThreadNode>();
  const roots: ThreadNode[] = [];
  for (const p of posts) map.set(p.id, { post: p, children: [] });
  for (const p of posts) {
    const node = map.get(p.id)!;
    if (p.parentId && map.has(p.parentId)) {
      map.get(p.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ThreadView({
  nodes,
  onReply,
  onDelete,
  depth = 0,
}: {
  nodes: ThreadNode[];
  onReply: (parentId: string) => void;
  onDelete: (postId: string) => void;
  depth?: number;
}) {
  const { t } = useTranslation();
  return (
    <ul className={depth > 0 ? 'ml-4 mt-2 space-y-2 border-l pl-3' : 'space-y-2'}>
      {nodes.map((n) => (
        <li key={n.post.id} className="rounded-md border bg-card p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              <b className="text-foreground">{n.post.author.name}</b> ·{' '}
              <span>{n.post.author.role}</span>
            </span>
            <span className="tabular-nums">{formatDateTime(n.post.createdAt)}</span>
          </div>
          <div className="mt-2">
            {n.post.isDeleted ? (
              <p className="text-sm italic text-muted-foreground">{t('discussion.deletedPost')}</p>
            ) : (
              <Markdown source={n.post.content ?? ''} />
            )}
          </div>
          {!n.post.isDeleted ? (
            <div className="mt-2 flex items-center gap-1.5">
              <ActionIconButton
                size="sm"
                icon={Reply}
                label={t('discussion.reply')}
                color="sky"
                onClick={() => onReply(n.post.id)}
              />
              <ActionIconButton
                size="sm"
                icon={Trash2}
                label={t('common.delete')}
                color="red"
                onClick={() => onDelete(n.post.id)}
              />
            </div>
          ) : null}
          {n.children.length > 0 ? (
            <ThreadView
              nodes={n.children}
              onReply={onReply}
              onDelete={onDelete}
              depth={depth + 1}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

type GradeFilter = 'ungraded' | 'graded' | 'noposts';

function postExcerpt(content: string | null): string {
  const text = stripMarkdown(content ?? '').trim();
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

export function TeacherDiscussionTopicPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId, topicId } = useParams();
  const cId = courseId ?? '';
  const tId = topicId ?? '';
  const topic = useDiscussionTopic(tId);
  const thread = useDiscussionThread(tId);
  const grades = useDiscussionGrades(tId);
  const createPost = useCreateDiscussionPost(tId);
  const reply = useReplyDiscussionPost(tId);
  const del = useDeleteDiscussionPost(tId);
  const toast = useToast();
  const confirm = useConfirm();

  const isGraded = !!topic.data?.isGraded;
  const [view, setView] = useState<'students' | 'thread' | null>(null);
  // Graded topics open on the grading view; plain topics only have the thread.
  const activeView: 'students' | 'thread' = view ?? (isGraded ? 'students' : 'thread');

  // ----- grading view state -----
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Set<GradeFilter>>(new Set());
  const [page, setPage] = useState(0);

  // ----- thread view state -----
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const allPosts = useMemo(
    () => (thread.data ? thread.data.pages.flatMap((p) => p.posts) : []),
    [thread.data],
  );
  const tree = useMemo(() => nest(allPosts), [allPosts]);
  const rootTotal = thread.data?.pages[0]?.total ?? 0;
  const loadedRoots = tree.length;

  const rows = useMemo(() => grades.data ?? [], [grades.data]);
  const stats = useMemo(() => {
    const posted = rows.filter((g) => g.postCount > 0);
    const graded = rows.filter((g) => g.score !== null);
    const scores = graded.map((g) => g.score!) as number[];
    return {
      posted: posted.length,
      total: rows.length,
      ungraded: rows.filter((g) => g.postCount > 0 && g.score === null).length,
      graded: graded.length,
      avg: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    };
  }, [rows]);

  const matchesFilter = (g: DiscussionGradeRow): boolean => {
    if (filters.size === 0) return true;
    if (filters.has('ungraded') && g.postCount > 0 && g.score === null) return true;
    if (filters.has('graded') && g.score !== null) return true;
    if (filters.has('noposts') && g.postCount === 0) return true;
    return false;
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((g) => {
      if (q && !g.studentName.toLowerCase().includes(q) && !g.studentEmail.toLowerCase().includes(q)) {
        return false;
      }
      return matchesFilter(g);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, filters]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / STUDENTS_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filteredRows.slice(
    safePage * STUDENTS_PER_PAGE,
    (safePage + 1) * STUDENTS_PER_PAGE,
  );

  function toggleFilter(f: GradeFilter): void {
    setPage(0);
    setFilters((cur) => {
      const next = new Set(cur);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  const post = async () => {
    if (!draft.trim()) return;
    try {
      await createPost.mutateAsync({ content: draft.trim() });
      setDraft('');
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  };

  const onReplySubmit = async () => {
    if (!replyTo || !replyText.trim()) return;
    try {
      await reply.mutateAsync({ parentId: replyTo, input: { content: replyText.trim() } });
      setReplyTo(null);
      setReplyText('');
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const filtering = search.trim() !== '' || filters.size > 0;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">
          <Link to={`/teacher/courses/${cId}/discussion`} className="text-muted-foreground hover:underline">
            {t('discussion.title')}
          </Link>
          {' › '}
          {topic.data?.title ?? t('common.loading')}
        </h2>
        <div className="flex items-center gap-2">
          {topic.data?.isGraded ? (
            <Badge variant="info">
              {t('discussion.gradeSidebar', { max: topic.data.maxScore ?? 0 })}
            </Badge>
          ) : null}
          {topic.data ? (
            <Badge variant={topic.data.status === 'published' ? 'success' : 'secondary'}>
              {t(`discussion.status${topic.data.status[0]!.toUpperCase()}${topic.data.status.slice(1)}`)}
            </Badge>
          ) : null}
        </div>
      </header>

      {topic.data?.description ? (
        <Card>
          <CardContent className="pt-4">
            <Markdown source={topic.data.description} />
          </CardContent>
        </Card>
      ) : null}

      {isGraded ? (
        <>
          <StatGrid className="lg:grid-cols-4">
            <StatCard
              icon={Users}
              label={t('discussion.statPosted')}
              value={`${stats.posted}/${stats.total}`}
            />
            <StatCard
              icon={MessageSquare}
              tone="alert"
              label={t('discussion.statUngraded')}
              value={stats.ungraded}
            />
            <StatCard
              icon={CheckCircle2}
              label={t('discussion.statGraded')}
              value={stats.graded}
            />
            <StatCard
              icon={Percent}
              label={t('discussion.statAvg')}
              value={stats.avg !== null ? stats.avg.toFixed(1) : '—'}
            />
          </StatGrid>

          <div className="flex items-center gap-0.5 self-start rounded-md border bg-background p-0.5">
            {(['students', 'thread'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={activeView === v}
                onClick={() => setView(v)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  activeView === v
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {v === 'students' ? t('discussion.tabByStudent') : t('discussion.tabThread')}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {activeView === 'students' && isGraded ? (
        <div className="space-y-3">
          {/* Toolbar attached to the student list */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  placeholder={t('discussion.searchStudents')}
                  aria-label={t('discussion.searchStudents')}
                  className="h-9 w-64 max-w-full bg-background pl-8"
                />
              </div>
              {filtering ? (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t('grading.filterShowing', { shown: filteredRows.length, total: rows.length })}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['ungraded', stats.ungraded, 'border-amber-500/60 text-amber-700 dark:text-amber-300', 'bg-amber-500/10'],
                  ['graded', stats.graded, 'border-emerald-500/60 text-emerald-700 dark:text-emerald-300', 'bg-emerald-500/10'],
                  ['noposts', stats.total - stats.posted, 'border-muted-foreground/40 text-muted-foreground', 'bg-muted'],
                ] as Array<[GradeFilter, number, string, string]>
              ).map(([f, count, tone, active]) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filters.has(f)}
                  onClick={() => toggleFilter(f)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium transition',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    tone,
                    filters.has(f) && active,
                    filters.has(f) && 'ring-1 ring-current/40',
                  )}
                >
                  <span>{t(`discussion.filter${f === 'ungraded' ? 'Ungraded' : f === 'graded' ? 'Graded' : 'NoPosts'}`)}</span>
                  <span className="tabular-nums opacity-70">{count}</span>
                </button>
              ))}
              {filtering ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setFilters(new Set());
                    setPage(0);
                  }}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline focus:outline-none focus-visible:underline"
                >
                  {t('grading.filterClear')}
                </button>
              ) : null}
            </div>
          </div>

          {grades.isLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : filteredRows.length === 0 ? (
            <EmptyState icon={<Users className="h-6 w-6" />} title={t('grading.filterNoMatch')} />
          ) : (
            <>
              <ul className="space-y-3">
                {pageRows.map((g) => (
                  <StudentGradeCard
                    key={g.studentId}
                    topicId={tId}
                    row={g}
                    maxScore={topic.data?.maxScore ?? 100}
                  />
                ))}
              </ul>
              {pageCount > 1 ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t('discussion.pageOf', {
                      from: safePage * STUDENTS_PER_PAGE + 1,
                      to: Math.min((safePage + 1) * STUDENTS_PER_PAGE, filteredRows.length),
                      total: filteredRows.length,
                    })}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage === 0}
                      onClick={() => setPage(safePage - 1)}
                    >
                      <ChevronLeft className="mr-1 h-3.5 w-3.5" aria-hidden />
                      {t('discussion.prevPage')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage >= pageCount - 1}
                      onClick={() => setPage(safePage + 1)}
                    >
                      {t('discussion.nextPage')}
                      <ChevronRight className="ml-1 h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {thread.isLoading ? (
            <p>{t('common.loading')}</p>
          ) : tree.length === 0 ? (
            <EmptyState title={t('discussion.noPosts')} />
          ) : (
            <>
              <ThreadView
                nodes={tree}
                onReply={(id) => setReplyTo(id)}
                onDelete={async (id) => {
                  const post = allPosts.find((p) => p.id === id);
                  const ok = await confirm({
                    title: t('discussion.postDeleteTitle'),
                    description: t('discussion.postDeleteBody'),
                    detail: post ? { name: postExcerpt(post.content) } : undefined,
                    confirmLabel: t('common.delete'),
                  });
                  if (!ok) return;
                  await del.mutateAsync(id);
                }}
              />
              {rootTotal > loadedRoots ? (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={thread.isFetchingNextPage}
                    onClick={() => void thread.fetchNextPage()}
                  >
                    {t('discussion.loadMore', { count: rootTotal - loadedRoots })}
                  </Button>
                </div>
              ) : null}
            </>
          )}

          {replyTo ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('discussion.replyTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setReplyTo(null)}>
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={onReplySubmit} disabled={reply.isPending}>
                    {t('discussion.reply')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {topic.data?.status === 'published' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('discussion.newPostTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Textarea
                  rows={4}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('discussion.composePlaceholder')}
                />
                <div className="flex justify-end">
                  <Button onClick={post} disabled={!draft.trim() || createPost.isPending}>
                    {t('discussion.post')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * One student's grading card: their posts (lazy-loaded) with the score and
 * feedback controls directly underneath — grade the work right where you
 * read it.
 */
function StudentGradeCard({
  topicId,
  row,
  maxScore,
}: {
  topicId: string;
  row: DiscussionGradeRow;
  maxScore: number;
}): JSX.Element {
  const { t } = useTranslation();
  const posts = useStudentPosts(topicId, row.studentId);
  const gradeMut = useGradeDiscussion(topicId);
  const toast = useToast();
  const [score, setScore] = useState<string>(row.score !== null ? String(row.score) : '');
  const [feedback, setFeedback] = useState<string>(row.feedback ?? '');
  const dirty =
    score !== (row.score !== null ? String(row.score) : '') || feedback !== (row.feedback ?? '');

  const onSave = async (): Promise<void> => {
    const trimmed = score.trim();
    if (trimmed === '') return;
    const n = Number(trimmed);
    if (Number.isNaN(n) || n < 0 || n > maxScore) {
      toast.push({ title: t('grading.detailScoreInvalid'), tone: 'error' });
      return;
    }
    try {
      await gradeMut.mutateAsync({
        studentId: row.studentId,
        input: { score: n, feedback: feedback.trim() || null },
      });
      toast.push({ title: t('discussion.gradeSaved'), tone: 'success' });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  };

  return (
    <li className="list-none overflow-hidden rounded-lg border bg-card">
      {/* Student band */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-medium">{row.studentName}</span>
          <span className="truncate text-xs text-muted-foreground">{row.studentEmail}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline" className="gap-1 tabular-nums">
            <MessagesSquare className="h-3 w-3" aria-hidden />
            {t('discussion.postsLabel', { count: row.postCount })}
          </Badge>
          {row.score !== null ? (
            <Badge variant="success" className="tabular-nums">
              {t('grading.graded')} · {row.score}
            </Badge>
          ) : row.postCount > 0 ? (
            <Badge variant="warning">{t('grading.awaitingGrade')}</Badge>
          ) : (
            <Badge variant="secondary">{t('discussion.filterNoPosts')}</Badge>
          )}
        </div>
      </div>

      {/* The student's posts */}
      <div className="space-y-2 px-4 py-3">
        {row.postCount === 0 ? (
          <p className="rounded-md border border-dashed bg-muted/20 p-3 text-center text-sm italic text-muted-foreground">
            {t('discussion.noPostsYet')}
          </p>
        ) : posts.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          (posts.data?.posts ?? []).map((p) => (
            <div key={p.id} className="rounded-md border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="tabular-nums">{formatDateTime(p.createdAt)}</span>
                {p.parentAuthorName ? (
                  <span className="inline-flex items-center gap-1">
                    <CornerDownRight className="h-3 w-3" aria-hidden />
                    {t('discussion.replyTo', { name: p.parentAuthorName })}
                  </span>
                ) : null}
              </div>
              <MarkdownView source={p.content} className="mt-1.5 text-sm leading-relaxed" />
            </div>
          ))
        )}
      </div>

      {/* Grading controls directly under the posts */}
      <div className="flex flex-wrap items-end gap-3 border-t bg-muted/20 px-4 py-3">
        <div className="space-y-1">
          <Label htmlFor={`score-${row.studentId}`} className="text-xs">
            {t('submissions.scoreLabel')}
          </Label>
          <div className="flex items-center gap-1.5">
            <Input
              id={`score-${row.studentId}`}
              type="number"
              min={0}
              max={maxScore}
              step={0.5}
              className={SCORE_INPUT_CLASS}
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
            <span className="whitespace-nowrap font-mono text-sm tabular-nums text-muted-foreground">
              / {maxScore}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor={`fb-${row.studentId}`} className="text-xs">
            {t('submissions.feedbackLabel')}
          </Label>
          <Input
            id={`fb-${row.studentId}`}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          {row.gradedAt ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatDateTime(row.gradedAt)}
            </span>
          ) : null}
          <Button size="sm" onClick={onSave} disabled={!dirty || gradeMut.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </li>
  );
}
