import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, ExternalLink, Reply } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/input';
import { Markdown } from '@/components/ui/markdown';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/authContext';
import { ApiClientError } from '@/lib/api';
import {
  getDownloadUrl,
  useAssignmentsList,
  useCreateDiscussionPost,
  useDeleteDiscussionPost,
  useDiscussionPosts,
  useDiscussionTopicsList,
  useMaterialsList,
  useModulesList,
  useMySubmission,
  usePresentationsList,
  useQuizzesList,
  useReplyDiscussionPost,
  useSubmitSubmission,
  useUpdateDiscussionPost,
  useUpdateSubmission,
} from '@/lib/queries';
import type {
  AssignmentSummary,
  DiscussionPostSummary,
  DiscussionTopicSummary,
  MaterialSummary,
  PresentationSummary,
  QuizSummary,
} from '@coursewise/shared';

function bucket<T extends { moduleId: string | null }>(items: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    if (!it.moduleId) continue;
    const arr = m.get(it.moduleId) ?? [];
    arr.push(it);
    m.set(it.moduleId, arr);
  }
  return m;
}

function MaterialItem({ mat, courseId }: { mat: MaterialSummary; courseId: string }): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const onDownload = async () => {
    if (!mat.fileAssetId) return;
    try {
      const res = await getDownloadUrl(mat.fileAssetId);
      window.location.href = res.downloadUrl;
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };
  return (
    <AccordionItem value={`mat-${mat.id}`}>
      <AccordionTrigger>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{mat.title}</span>
          <Badge variant="info">
            {t(
              `materials.kind${mat.sourceType.replace(/(^|_)(\w)/g, (_, _b, c: string) =>
                c.toUpperCase(),
              )}`,
            )}
          </Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-3">
        {mat.description ? (
          <p className="text-sm text-muted-foreground">{mat.description}</p>
        ) : null}
        {mat.sourceType === 'manual_text' && mat.content ? <Markdown source={mat.content} /> : null}
        {mat.sourceType === 'external_link' && mat.externalUrl ? (
          <Button size="sm" variant="outline" asChild>
            <a href={mat.externalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              {t('materials.openLink')}
            </a>
          </Button>
        ) : null}
        {mat.sourceType === 'upload' && mat.fileAssetId ? (
          <Button size="sm" variant="outline" onClick={onDownload}>
            <Download className="h-4 w-4" />
            {t('common.download')}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          <Link to={`/student/courses/${courseId}/materials`} className="hover:underline">
            {t('studentModules.openFull')}
          </Link>
        </p>
      </AccordionContent>
    </AccordionItem>
  );
}

function PresentationItem({
  pres,
  courseId,
}: {
  pres: PresentationSummary;
  courseId: string;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const onDownload = async () => {
    if (!pres.fileAssetId) return;
    try {
      const res = await getDownloadUrl(pres.fileAssetId);
      window.location.href = res.downloadUrl;
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };
  return (
    <AccordionItem value={`pres-${pres.id}`}>
      <AccordionTrigger>
        <span className="text-sm font-medium">{pres.title}</span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3">
        {pres.description ? (
          <p className="text-sm text-muted-foreground">{pres.description}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {pres.externalUrl ? (
            <Button size="sm" variant="outline" asChild>
              <a href={pres.externalUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                {t('gamma.openInGamma')}
              </a>
            </Button>
          ) : null}
          {pres.fileAssetId ? (
            <Button size="sm" variant="outline" onClick={onDownload}>
              <Download className="h-4 w-4" />
              {t('gamma.downloadPptx')}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/student/courses/${courseId}/presentations/${pres.id}`}>
              {t('studentModules.openFull')}
            </Link>
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function AssignmentItem({ a, courseId }: { a: AssignmentSummary; courseId: string }): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  // Lazy-load the submission only when expanded (useMySubmission POSTs to
  // create a draft on first access; we don't want that to fire for every
  // assignment on the page).
  const submission = useMySubmission(expanded ? a.id : null);
  const update = useUpdateSubmission(a.id);
  const submit = useSubmitSubmission(a.id);
  const [text, setText] = useState('');

  useEffect(() => {
    if (submission.data) setText(submission.data.textAnswer ?? '');
  }, [submission.data]);

  const editable = submission.data?.status === 'draft' || submission.data?.status === 'returned';

  const onSaveDraft = async () => {
    if (!submission.data) return;
    try {
      await update.mutateAsync({
        id: submission.data.id,
        input: { textAnswer: text.trim() || null, fileAssetId: submission.data.fileAssetId },
      });
      toast.push({ title: t('submissions.draftSaved'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onSubmit = async () => {
    if (!submission.data) return;
    try {
      await update.mutateAsync({
        id: submission.data.id,
        input: { textAnswer: text.trim() || null, fileAssetId: submission.data.fileAssetId },
      });
      await submit.mutateAsync(submission.data.id);
      toast.push({ title: t('submissions.submitted'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  return (
    <AccordionItem value={`asg-${a.id}`}>
      <AccordionTrigger onClick={() => setExpanded((v) => !v)}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{a.title}</span>
          {a.dueDate ? (
            <span className="text-xs text-muted-foreground">
              {t('assignments.dueLabel')}: {new Date(a.dueDate).toLocaleDateString()}
            </span>
          ) : null}
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-3">
        {a.description ? (
          <Markdown source={a.description} />
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
        {submission.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : submission.data ? (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              {t('submissions.statusLabel', { defaultValue: 'Status' })}:{' '}
              {t(
                `submissions.status${submission.data.status[0]!.toUpperCase()}${submission.data.status.slice(1)}`,
              )}
            </div>
            <Textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={!editable}
              placeholder={t('submissions.textAnswer')}
            />
            {editable ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onSaveDraft}
                  disabled={update.isPending}
                >
                  {t('submissions.saveDraft')}
                </Button>
                <Button
                  size="sm"
                  onClick={onSubmit}
                  disabled={update.isPending || submit.isPending}
                >
                  {t('submissions.submitCta')}
                </Button>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              <Link
                to={`/student/courses/${courseId}/assignments/${a.id}`}
                className="hover:underline"
              >
                {t('studentModules.openFullForFiles')}
              </Link>
            </p>
          </div>
        ) : null}
      </AccordionContent>
    </AccordionItem>
  );
}

function QuizItem({ q, courseId }: { q: QuizSummary; courseId: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <AccordionItem value={`qz-${q.id}`}>
      <AccordionTrigger>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{q.title}</span>
          <span className="text-xs text-muted-foreground">
            {t('quizzes.questionsCount', { count: q.questionCount ?? 0 })}
          </span>
          {q.timeLimitMinutes ? (
            <span className="text-xs text-muted-foreground">
              {t('quizzes.timeLimitDisplay', { minutes: q.timeLimitMinutes })}
            </span>
          ) : null}
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-3">
        {q.description ? <p className="text-sm text-muted-foreground">{q.description}</p> : null}
        <Button size="sm" asChild>
          <Link to={`/student/courses/${courseId}/quizzes/${q.id}`}>
            {t('studentModules.startQuiz')}
          </Link>
        </Button>
      </AccordionContent>
    </AccordionItem>
  );
}

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

function DiscussionItem({ topic }: { topic: DiscussionTopicSummary }): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const { auth } = useAuth();
  const userId = auth?.user.id ?? null;
  const [expanded, setExpanded] = useState(false);
  const posts = useDiscussionPosts(expanded ? topic.id : null);
  const createPost = useCreateDiscussionPost(topic.id);
  const reply = useReplyDiscussionPost(topic.id);
  const update = useUpdateDiscussionPost(topic.id);
  const del = useDeleteDiscussionPost(topic.id);

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const tree = useMemo(() => (posts.data ? nest(posts.data) : []), [posts.data]);

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

  const renderNode = (node: ThreadNode, depth: number): JSX.Element => {
    const mine = node.post.author.id === userId;
    const isEditing = editing === node.post.id;
    return (
      <li key={node.post.id} className="rounded-md border bg-background p-2.5">
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
              <Textarea rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} />
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
        {!node.post.isDeleted && !isEditing && topic.status === 'published' ? (
          <div className="mt-2 flex items-center gap-1.5">
            <ActionIconButton
              size="sm"
              icon={Reply}
              label={t('discussion.reply')}
              color="sky"
              onClick={() => setReplyTo(node.post.id)}
            />
            {mine ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(node.post.id);
                  setEditText(node.post.content ?? '');
                }}
              >
                {t('common.edit')}
              </Button>
            ) : null}
            {mine ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (!confirm(t('discussion.postDeleteConfirm'))) return;
                  await del.mutateAsync(node.post.id);
                }}
              >
                {t('common.delete')}
              </Button>
            ) : null}
          </div>
        ) : null}
        {node.children.length > 0 ? (
          <ul className="ml-3 mt-2 space-y-2 border-l pl-3">
            {node.children.map((c) => renderNode(c, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <AccordionItem value={`dsc-${topic.id}`}>
      <AccordionTrigger onClick={() => setExpanded((v) => !v)}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{topic.title}</span>
          <span className="text-xs text-muted-foreground">
            {t('discussion.postCount', { count: topic.postCount ?? 0 })}
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-3">
        {topic.description ? <Markdown source={topic.description} /> : null}
        {posts.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : tree.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('discussion.noPosts')}</p>
        ) : (
          <ul className="space-y-2">{tree.map((n) => renderNode(n, 0))}</ul>
        )}

        {replyTo ? (
          <div className="space-y-2 rounded-md border bg-background p-2.5">
            <div className="text-xs text-muted-foreground">{t('discussion.replyTitle')}</div>
            <Textarea rows={3} value={replyText} onChange={(e) => setReplyText(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setReplyTo(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={onReplySubmit}
                disabled={reply.isPending || !replyText.trim()}
              >
                {t('discussion.reply')}
              </Button>
            </div>
          </div>
        ) : null}

        {topic.status === 'published' ? (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">{t('discussion.newPostTitle')}</div>
            <Textarea
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('discussion.composePlaceholder')}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={onPost} disabled={!draft.trim() || createPost.isPending}>
                {t('discussion.post')}
              </Button>
            </div>
          </div>
        ) : null}
      </AccordionContent>
    </AccordionItem>
  );
}

function Section<T>({
  titleKey,
  items,
  renderItem,
}: {
  titleKey: string;
  items: T[];
  renderItem: (item: T) => JSX.Element;
}): JSX.Element | null {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{t(titleKey)}</div>
      <Accordion className="space-y-1.5">{items.map(renderItem)}</Accordion>
    </div>
  );
}

export function StudentModulesPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const modulesQ = useModulesList(id);
  const materialsQ = useMaterialsList(id);
  const presentationsQ = usePresentationsList(id);
  const assignmentsQ = useAssignmentsList(id);
  const quizzesQ = useQuizzesList(id);
  const discussionsQ = useDiscussionTopicsList(id);

  const matsByModule = useMemo(() => bucket(materialsQ.data ?? []), [materialsQ.data]);
  const presByModule = useMemo(() => bucket(presentationsQ.data ?? []), [presentationsQ.data]);
  const asgByModule = useMemo(() => bucket(assignmentsQ.data ?? []), [assignmentsQ.data]);
  const qzByModule = useMemo(() => bucket(quizzesQ.data ?? []), [quizzesQ.data]);
  const dscByModule = useMemo(() => bucket(discussionsQ.data ?? []), [discussionsQ.data]);

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t('modules.title')}</h2>
      </header>

      {modulesQ.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : !modulesQ.data || modulesQ.data.length === 0 ? (
        <p className="rounded-md border bg-background p-8 text-center text-sm text-muted-foreground">
          {t('modules.empty')}
        </p>
      ) : (
        <Accordion single className="space-y-3">
          {modulesQ.data.map((m) => {
            const mats = matsByModule.get(m.id) ?? [];
            const pres = presByModule.get(m.id) ?? [];
            const asgs = asgByModule.get(m.id) ?? [];
            const qzs = qzByModule.get(m.id) ?? [];
            const dscs = dscByModule.get(m.id) ?? [];
            const total = mats.length + pres.length + asgs.length + qzs.length + dscs.length;
            return (
              <AccordionItem key={m.id} value={m.id}>
                <AccordionTrigger>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('studentModules.itemCount', { count: total })}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
                  {m.description ? (
                    <p className="text-sm text-muted-foreground">{m.description}</p>
                  ) : null}

                  <Section
                    titleKey="materials.title"
                    items={mats}
                    renderItem={(mat) => <MaterialItem key={mat.id} mat={mat} courseId={id} />}
                  />
                  <Section
                    titleKey="presentations.title"
                    items={pres}
                    renderItem={(p) => <PresentationItem key={p.id} pres={p} courseId={id} />}
                  />
                  <Section
                    titleKey="assignments.title"
                    items={asgs}
                    renderItem={(a) => <AssignmentItem key={a.id} a={a} courseId={id} />}
                  />
                  <Section
                    titleKey="quizzes.title"
                    items={qzs}
                    renderItem={(q) => <QuizItem key={q.id} q={q} courseId={id} />}
                  />
                  <Section
                    titleKey="discussion.title"
                    items={dscs}
                    renderItem={(d) => <DiscussionItem key={d.id} topic={d} />}
                  />
                  {total === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t('studentModules.emptyModule')}
                    </p>
                  ) : null}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
