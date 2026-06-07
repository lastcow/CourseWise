import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  Circle,
  CircleCheck,
  FolderInput,
  MessagesSquare,
  Pin,
  PinOff,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { CourseSectionHeader, ListSkeleton } from '@/components/course/CourseSectionHeader';
import { Input, Label } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { stripMarkdown } from '@/components/ui/markdown';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import {
  useAssignmentGroups,
  useCreateDiscussionTopic,
  useDeleteDiscussionTopic,
  useDiscussionTopicsList,
  useModulesList,
  useTransitionDiscussionTopic,
  useUpdateDiscussionTopic,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import type { DiscussionTopicSummary } from '@coursewise/shared';

function StatusIcon({ status }: { status: DiscussionTopicSummary['status'] }): JSX.Element {
  const { t } = useTranslation();
  const label = t(`discussion.status${status[0]!.toUpperCase()}${status.slice(1)}`);
  const { Icon, tone } = (() => {
    switch (status) {
      case 'published':
        return { Icon: CircleCheck, tone: 'border-emerald-500/60 text-emerald-500' };
      case 'archived':
        return { Icon: Archive, tone: 'border-orange-500/60 text-orange-500' };
      default:
        return { Icon: Circle, tone: 'border-slate-400/60 text-slate-400' };
    }
  })();
  return (
    <span
      aria-label={label}
      title={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border bg-transparent ${tone}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

export function TeacherDiscussionPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = useDiscussionTopicsList(id);
  const create = useCreateDiscussionTopic(id);
  const transition = useTransitionDiscussionTopic(id);
  const del = useDeleteDiscussionTopic(id);
  const update = useUpdateDiscussionTopic(id);
  const modulesQ = useModulesList(id || null);
  const groupsQ = useAssignmentGroups(id);
  const toast = useToast();

  const [openCreate, setOpenCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isGraded, setIsGraded] = useState(false);
  const [maxScore, setMaxScore] = useState<number | ''>('');

  const [deleteTarget, setDeleteTarget] = useState<DiscussionTopicSummary | null>(null);
  const [moveTarget, setMoveTarget] = useState<DiscussionTopicSummary | null>(null);
  const [moveModuleId, setMoveModuleId] = useState<string>('');
  const [moveGroupId, setMoveGroupId] = useState<string>('');

  const moduleTitleById = new Map((modulesQ.data ?? []).map((m) => [m.id, m.title]));

  const onSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();
    try {
      await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        isGraded,
        maxScore: isGraded && maxScore !== '' ? Number(maxScore) : null,
      });
      toast.push({ title: t('discussion.topicCreated'), tone: 'success' });
      setOpenCreate(false);
      setTitle('');
      setDescription('');
      setIsGraded(false);
      setMaxScore('');
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <CourseSectionHeader
        title={t('discussion.title')}
        count={list.data?.length}
        actions={
          <>
            <Button size="sm" onClick={() => setOpenCreate(true)}>
              {t('discussion.newTopicCta')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void list.refetch()}
              disabled={list.isFetching}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
            >
              <RefreshCw
                className={list.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
                aria-hidden
              />
            </Button>
          </>
        }
      />

      {list.isLoading ? (
        <ListSkeleton />
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState icon={<MessagesSquare className="h-6 w-6" />} title={t('discussion.empty')} />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('discussion.colTitle')}</TableHead>
                <TableHead>{t('discussion.colDescription')}</TableHead>
                <TableHead>{t('discussion.colModule')}</TableHead>
                <TableHead className="text-right">{t('discussion.colPosts')}</TableHead>
                <TableHead className="text-right">{t('discussion.colScore')}</TableHead>
                <TableHead className="text-right">{t('discussion.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((topic) => (
                <TableRow key={topic.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={topic.status} />
                      {topic.isPinned ? (
                        <span
                          aria-label={t('discussion.pin')}
                          title={t('discussion.pin')}
                          className="inline-flex"
                        >
                          <Pin className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                        </span>
                      ) : null}
                      <Link
                        to={`/teacher/courses/${id}/discussion/${topic.id}`}
                        className="hover:underline"
                      >
                        {topic.title}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[24ch] text-muted-foreground">
                    <span className="line-clamp-1">
                      {topic.description ? stripMarkdown(topic.description) : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-between gap-2">
                      <span className={topic.moduleId ? 'line-clamp-1' : 'text-muted-foreground'}>
                        {topic.moduleId ? (moduleTitleById.get(topic.moduleId) ?? '—') : '—'}
                      </span>
                      <ActionIconButton
                        icon={FolderInput}
                        label={t('discussion.linkModuleAction')}
                        color="sky"
                        size="sm"
                        onClick={() => {
                          setMoveModuleId(topic.moduleId ?? '');
                          setMoveGroupId(topic.groupId ?? '');
                          setMoveTarget(topic);
                        }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{topic.postCount ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {topic.isGraded ? (topic.maxScore ?? '—') : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      {topic.status === 'draft' ? (
                        <ActionIconButton
                          icon={CircleCheck}
                          label={t('discussion.publish')}
                          color="emerald"
                          onClick={async () => {
                            await transition.mutateAsync({ id: topic.id, action: 'publish' });
                          }}
                        />
                      ) : null}
                      <ActionIconButton
                        icon={topic.isPinned ? PinOff : Pin}
                        label={topic.isPinned ? t('discussion.unpin') : t('discussion.pin')}
                        color="amber"
                        onClick={() =>
                          transition.mutate({
                            id: topic.id,
                            action: topic.isPinned ? 'unpin' : 'pin',
                          })
                        }
                      />
                      {topic.status !== 'archived' ? (
                        <ActionIconButton
                          icon={Archive}
                          label={t('discussion.archive')}
                          color="orange"
                          onClick={() => transition.mutate({ id: topic.id, action: 'archive' })}
                        />
                      ) : null}
                      <ActionIconButton
                        icon={Trash2}
                        label={t('common.delete')}
                        color="red"
                        onClick={() => setDeleteTarget(topic)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title={t('discussion.newTopicTitle')}
      >
        <form className="space-y-3" onSubmit={onSubmit}>
          <div>
            <Label htmlFor="topic-title">{t('discussion.titleLabel')}</Label>
            <Input
              id="topic-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="topic-desc">{t('discussion.descriptionLabel')}</Label>
            <MarkdownEditor id="topic-desc" value={description} onChange={setDescription} />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="topic-graded"
              type="checkbox"
              checked={isGraded}
              onChange={(e) => setIsGraded(e.target.checked)}
            />
            <Label htmlFor="topic-graded">{t('discussion.isGraded')}</Label>
          </div>
          {isGraded ? (
            <div>
              <Label htmlFor="topic-max">{t('discussion.maxScore')}</Label>
              <Input
                id="topic-max"
                type="number"
                min={1}
                step={0.5}
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpenCreate(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {t('common.create')}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('discussion.deleteDialogTitle')}
        dismissOnBackdropClick={false}
      >
        <p className="text-sm text-muted-foreground">{t('discussion.deleteConfirm')}</p>
        {deleteTarget ? <p className="mt-2 text-sm font-medium">{deleteTarget.title}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={async () => {
              if (!deleteTarget) return;
              try {
                await del.mutateAsync(deleteTarget.id);
                toast.push({ title: t('discussion.deleted'), tone: 'success' });
                setDeleteTarget(null);
              } catch (err) {
                const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                toast.push({ title: t(key), tone: 'error' });
              }
            }}
          >
            {t('common.delete')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={moveTarget !== null}
        onClose={() => setMoveTarget(null)}
        title={t('discussion.linkModuleTitle')}
        dismissOnBackdropClick={false}
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="move-module">{t('discussion.moduleLabel')}</Label>
            <select
              id="move-module"
              value={moveModuleId}
              onChange={(e) => setMoveModuleId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={modulesQ.isLoading}
            >
              <option value="">{t('discussion.unassignedModule')}</option>
              {(modulesQ.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="move-group">{t('discussion.groupLabel')}</Label>
            <select
              id="move-group"
              value={moveGroupId}
              onChange={(e) => setMoveGroupId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={groupsQ.isLoading}
            >
              <option value="">{t('discussion.unassignedGroup')}</option>
              {(groupsQ.data ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setMoveTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={update.isPending}
            onClick={async () => {
              if (!moveTarget) return;
              try {
                await update.mutateAsync({
                  id: moveTarget.id,
                  input: {
                    moduleId: moveModuleId || null,
                    groupId: moveGroupId || null,
                  },
                });
                toast.push({ title: t('discussion.moduleUpdated'), tone: 'success' });
                setMoveTarget(null);
              } catch (err) {
                const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                toast.push({ title: t(key), tone: 'error' });
              }
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
