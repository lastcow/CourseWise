import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Reply, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea, Input, Label } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty';
import { Markdown } from '@/components/ui/markdown';
import { useToast } from '@/components/ui/toast';
import type { DiscussionPostSummary } from '@coursewise/shared';
import {
  useCreateDiscussionPost,
  useDeleteDiscussionPost,
  useDiscussionGrades,
  useDiscussionPosts,
  useDiscussionTopic,
  useGradeDiscussion,
  useReplyDiscussionPost,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';

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
            <span>{new Date(n.post.createdAt).toLocaleString()}</span>
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

export function TeacherDiscussionTopicPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId, topicId } = useParams();
  const cId = courseId ?? '';
  const tId = topicId ?? '';
  const topic = useDiscussionTopic(tId);
  const posts = useDiscussionPosts(tId);
  const grades = useDiscussionGrades(tId);
  const createPost = useCreateDiscussionPost(tId);
  const reply = useReplyDiscussionPost(tId);
  const del = useDeleteDiscussionPost(tId);
  const gradeMut = useGradeDiscussion(tId);
  const toast = useToast();

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const tree = posts.data ? nest(posts.data) : [];

  const post = async () => {
    if (!draft.trim()) return;
    await createPost.mutateAsync({ content: draft.trim() });
    setDraft('');
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

  const submitGrade = async (studentId: string, score: number, feedback: string) => {
    try {
      await gradeMut.mutateAsync({ studentId, input: { score, feedback: feedback || null } });
      toast.push({ title: t('discussion.gradeSaved'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

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
        {topic.data ? (
          <Badge variant={topic.data.status === 'published' ? 'success' : 'secondary'}>
            {t(`discussion.status${topic.data.status[0]!.toUpperCase()}${topic.data.status.slice(1)}`)}
          </Badge>
        ) : null}
      </header>

      <div className={`grid gap-4 ${topic.data?.isGraded ? 'md:grid-cols-[1fr_320px]' : ''}`}>
        <div className="space-y-3">
          {topic.data?.description ? (
            <Card>
              <CardContent className="pt-4">
                <Markdown source={topic.data.description} />
              </CardContent>
            </Card>
          ) : null}

          {posts.isLoading ? (
            <p>{t('common.loading')}</p>
          ) : tree.length === 0 ? (
            <EmptyState title={t('discussion.noPosts')} />
          ) : (
            <ThreadView
              nodes={tree}
              onReply={(id) => setReplyTo(id)}
              onDelete={async (id) => {
                if (!confirm(t('discussion.postDeleteConfirm'))) return;
                await del.mutateAsync(id);
              }}
            />
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

        {topic.data?.isGraded ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {t('discussion.gradeSidebar', { max: topic.data.maxScore ?? 0 })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {grades.isLoading ? (
                <p>{t('common.loading')}</p>
              ) : !grades.data || grades.data.length === 0 ? (
                <p className="text-muted-foreground">{t('discussion.noStudents')}</p>
              ) : (
                grades.data.map((g) => (
                  <GradeRow
                    key={g.studentId}
                    studentId={g.studentId}
                    studentName={g.studentName}
                    postCount={g.postCount}
                    initialScore={g.score}
                    initialFeedback={g.feedback ?? ''}
                    maxScore={topic.data?.maxScore ?? 0}
                    onSubmit={submitGrade}
                  />
                ))
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function GradeRow({
  studentId,
  studentName,
  postCount,
  initialScore,
  initialFeedback,
  maxScore,
  onSubmit,
}: {
  studentId: string;
  studentName: string;
  postCount: number;
  initialScore: number | null;
  initialFeedback: string;
  maxScore: number;
  onSubmit: (studentId: string, score: number, feedback: string) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const [score, setScore] = useState<number | ''>(initialScore ?? '');
  const [feedback, setFeedback] = useState<string>(initialFeedback);
  return (
    <div className="space-y-1 rounded border p-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">{studentName}</span>
        <span className="text-xs text-muted-foreground">
          {t('discussion.postsLabel', { count: postCount })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor={`score-${studentId}`} className="text-xs">
            {t('submissions.scoreLabel')} / {maxScore}
          </Label>
          <Input
            id={`score-${studentId}`}
            type="number"
            min={0}
            max={maxScore}
            step={0.5}
            value={score}
            onChange={(e) => setScore(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </div>
        <div>
          <Label htmlFor={`fb-${studentId}`} className="text-xs">
            {t('submissions.feedbackLabel')}
          </Label>
          <Input
            id={`fb-${studentId}`}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={score === ''}
          onClick={() => onSubmit(studentId, Number(score), feedback)}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
