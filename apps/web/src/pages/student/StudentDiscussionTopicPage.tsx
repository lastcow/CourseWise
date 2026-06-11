import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pencil, Reply, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty';
import { Markdown } from '@/components/ui/markdown';
import { useToast } from '@/components/ui/toast';
import type { DiscussionPostSummary } from '@coursewise/shared';
import {
  useCreateDiscussionPost,
  useDiscussionThread,
  useDiscussionTopic,
  useReplyDiscussionPost,
  useUpdateDiscussionPost,
  useDeleteDiscussionPost,
} from '@/lib/queries';
import { useAuth } from '@/lib/authContext';
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

export function StudentDiscussionTopicPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId, topicId } = useParams();
  const cId = courseId ?? '';
  const tId = topicId ?? '';
  const topic = useDiscussionTopic(tId);
  const posts = useDiscussionThread(tId);
  const createPost = useCreateDiscussionPost(tId);
  const reply = useReplyDiscussionPost(tId);
  const update = useUpdateDiscussionPost(tId);
  const del = useDeleteDiscussionPost(tId);
  const toast = useToast();
  const { auth } = useAuth();
  const userId = auth?.user.id ?? null;

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const allPosts = posts.data ? posts.data.pages.flatMap((pg) => pg.posts) : [];
  const tree = nest(allPosts);
  const rootTotal = posts.data?.pages[0]?.total ?? 0;

  const onPost = async () => {
    if (!draft.trim()) return;
    try {
      await createPost.mutateAsync({ content: draft.trim() });
      setDraft('');
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onReplySubmit = async () => {
    if (!replyTo || !replyText.trim()) return;
    await reply.mutateAsync({ parentId: replyTo, input: { content: replyText.trim() } });
    setReplyTo(null);
    setReplyText('');
  };

  const onEditSubmit = async () => {
    if (!editing) return;
    await update.mutateAsync({ id: editing, input: { content: editText.trim() } });
    setEditing(null);
    setEditText('');
  };

  // own-post controls
  const renderNode = (node: ThreadNode, depth: number): JSX.Element => {
    const mine = node.post.author.id === userId;
    const isEditing = editing === node.post.id;
    return (
      <li key={node.post.id} className="rounded-md border bg-card p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            <b className="text-foreground">{node.post.author.name}</b> · {node.post.author.role}
          </span>
          <span>{new Date(node.post.createdAt).toLocaleString()}</span>
        </div>
        <div className="mt-2">
          {node.post.isDeleted ? (
            <p className="text-sm italic text-muted-foreground">{t('discussion.deletedPost')}</p>
          ) : isEditing ? (
            <div className="space-y-2">
              <Textarea
                rows={3}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={onEditSubmit}>
                  {t('common.save')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <Markdown source={node.post.content ?? ''} />
          )}
        </div>
        {!node.post.isDeleted && !isEditing ? (
          <div className="mt-2 flex items-center gap-1.5">
            {topic.data?.status === 'published' ? (
              <ActionIconButton
                size="sm"
                icon={Reply}
                label={t('discussion.reply')}
                color="sky"
                onClick={() => setReplyTo(node.post.id)}
              />
            ) : null}
            {mine ? (
              <>
                <ActionIconButton
                  size="sm"
                  icon={Pencil}
                  label={t('common.edit')}
                  color="yellow"
                  onClick={() => {
                    setEditing(node.post.id);
                    setEditText(node.post.content ?? '');
                  }}
                />
                <ActionIconButton
                  size="sm"
                  icon={Trash2}
                  label={t('common.delete')}
                  color="red"
                  onClick={async () => {
                    if (!confirm(t('discussion.postDeleteConfirm'))) return;
                    await del.mutateAsync(node.post.id);
                  }}
                />
              </>
            ) : null}
          </div>
        ) : null}
        {node.children.length > 0 ? (
          <ul className={depth >= 0 ? 'ml-4 mt-2 space-y-2 border-l pl-3' : ''}>
            {node.children.map((c) => renderNode(c, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  // hoist grade banner
  const myGradeFromPosts = topic.data?.isGraded ? null : null; // student grade comes from server response if exposed
  void myGradeFromPosts;

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">
          <Link to={`/student/courses/${cId}/discussion`} className="text-muted-foreground hover:underline">
            {t('discussion.title')}
          </Link>
          {' › '}
          {topic.data?.title ?? t('common.loading')}
        </h2>
      </header>

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
        <>
          <ul className="space-y-2">{tree.map((n) => renderNode(n, 0))}</ul>
          {rootTotal > tree.length ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={posts.isFetchingNextPage}
                onClick={() => void posts.fetchNextPage()}
              >
                {t('discussion.loadMore', { count: rootTotal - tree.length })}
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
            <Textarea rows={3} value={replyText} onChange={(e) => setReplyText(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReplyTo(null)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={onReplySubmit} disabled={reply.isPending || !replyText.trim()}>
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
              <Button onClick={onPost} disabled={!draft.trim() || createPost.isPending}>
                {t('discussion.post')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
