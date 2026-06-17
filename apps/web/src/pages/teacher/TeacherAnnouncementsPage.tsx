import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Archive, CircleCheck, Megaphone, Pencil, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input, Label } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { MarkdownView } from '@/components/ui/markdown';
import { EmptyState } from '@/components/ui/empty';
import { CourseSectionHeader, ListSkeleton } from '@/components/course/CourseSectionHeader';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { ApiClientError } from '@/lib/api';
import {
  useAnnouncements,
  useCreateAnnouncement,
  useDeleteAnnouncement,
  useTransitionAnnouncement,
  useUpdateAnnouncement,
} from '@/lib/queries';
import type { AnnouncementStatus, AnnouncementSummary } from '@coursewise/shared';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function statusVariant(s: AnnouncementStatus): 'secondary' | 'success' | 'info' | 'outline' {
  if (s === 'published') return 'success';
  if (s === 'scheduled') return 'info';
  if (s === 'archived') return 'outline';
  return 'secondary';
}

type EditorState = { id: string | null; title: string; body: string };

export function TeacherAnnouncementsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const toast = useToast();

  const listQ = useAnnouncements(id);
  const create = useCreateAnnouncement(id);
  const update = useUpdateAnnouncement(id);
  const transition = useTransitionAnnouncement(id);
  const del = useDeleteAnnouncement(id);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementSummary | null>(null);

  const rows = listQ.data ?? [];
  const saving = create.isPending || update.isPending;

  const openNew = () => setEditor({ id: null, title: '', body: '' });
  const openEdit = (a: AnnouncementSummary) => setEditor({ id: a.id, title: a.title, body: a.body });

  const onSave = async (publish: boolean) => {
    if (!editor) return;
    const title = editor.title.trim();
    const body = editor.body.trim();
    if (!title || !body) {
      toast.push({ title: t('announcements.validationRequired'), tone: 'error' });
      return;
    }
    try {
      if (editor.id) {
        await update.mutateAsync({ id: editor.id, input: { title, body } });
        if (publish) await transition.mutateAsync({ id: editor.id, action: 'publish' });
      } else {
        await create.mutateAsync({ title, body, publish });
      }
      toast.push({ title: t('announcements.saved'), tone: 'success' });
      setEditor(null);
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onTransition = async (a: AnnouncementSummary, action: 'publish' | 'archive' | 'unpublish') => {
    try {
      await transition.mutateAsync({ id: a.id, action });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <CourseSectionHeader
        title={t('announcements.title')}
        description={t('announcements.helpTeacher')}
        count={rows.length}
        actions={
          <>
            <ActionIconButton
              icon={RefreshCw}
              label={t('common.refresh')}
              color="sky"
              size="sm"
              onClick={() => void listQ.refetch()}
              disabled={listQ.isFetching}
              className={cn(listQ.isFetching && '[&_svg]:animate-spin')}
            />
            <Button size="sm" onClick={openNew}>
              {t('announcements.newCta')}
            </Button>
          </>
        }
      />

      {listQ.isLoading ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Megaphone className="h-6 w-6" />} title={t('announcements.empty')} />
      ) : (
        <div className="space-y-3">
          {rows.map((a) => (
            <div key={a.id} className="rounded-md border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{a.title}</h3>
                    <Badge variant={statusVariant(a.status)}>
                      {t(`announcements.status.${a.status}`)}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {a.authorName ?? '—'} · {formatDate(a.publishedAt ?? a.createdAt)} ·{' '}
                    {t('announcements.readStat', {
                      read: a.readCount ?? 0,
                      total: a.audienceCount ?? 0,
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {a.status !== 'published' ? (
                    <ActionIconButton
                      icon={CircleCheck}
                      label={t('announcements.publish')}
                      color="emerald"
                      onClick={() => onTransition(a, 'publish')}
                    />
                  ) : (
                    <ActionIconButton
                      icon={RotateCcw}
                      label={t('announcements.unpublish')}
                      color="amber"
                      onClick={() => onTransition(a, 'unpublish')}
                    />
                  )}
                  {a.status !== 'archived' ? (
                    <ActionIconButton
                      icon={Archive}
                      label={t('announcements.archive')}
                      color="orange"
                      onClick={() => onTransition(a, 'archive')}
                    />
                  ) : null}
                  <ActionIconButton
                    icon={Pencil}
                    label={t('common.edit')}
                    color="sky"
                    onClick={() => openEdit(a)}
                  />
                  <ActionIconButton
                    icon={Trash2}
                    label={t('common.delete')}
                    color="red"
                    onClick={() => setDeleteTarget(a)}
                  />
                </div>
              </div>
              <MarkdownView source={a.body} className="mt-3 border-t pt-3" />
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor?.id ? t('announcements.editTitle') : t('announcements.newTitle')}
        className="max-w-2xl"
      >
        {editor ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="ann-title">{t('announcements.fieldTitle')}</Label>
              <Input
                id="ann-title"
                value={editor.title}
                onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                maxLength={200}
                placeholder={t('announcements.titlePlaceholder')}
              />
            </div>
            <div>
              <Label>{t('announcements.fieldBody')}</Label>
              <MarkdownEditor
                value={editor.body}
                onChange={(body) => setEditor({ ...editor, body })}
                placeholder={t('announcements.bodyPlaceholder')}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditor(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="outline" onClick={() => onSave(false)} disabled={saving}>
                {t('announcements.saveDraft')}
              </Button>
              <Button onClick={() => onSave(true)} disabled={saving}>
                {t('announcements.publish')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('announcements.deleteTitle')}
        dismissOnBackdropClick={false}
      >
        <p className="text-sm text-muted-foreground">{t('announcements.deleteConfirm')}</p>
        {deleteTarget ? <p className="mt-2 text-sm font-medium">{deleteTarget.title}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={del.isPending}>
            {t('common.delete')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
