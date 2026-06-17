import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  CircleCheck,
  Megaphone,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input, Label } from '@/components/ui/input';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { MarkdownView } from '@/components/ui/markdown';
import { EmptyState } from '@/components/ui/empty';
import { CourseSectionHeader, ListSkeleton } from '@/components/course/CourseSectionHeader';
import { AnnouncementAttachments } from '@/components/announcements/AnnouncementAttachments';
import { AnnouncementInteractions } from '@/components/announcements/AnnouncementInteractions';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { ApiClientError } from '@/lib/api';
import {
  uploadFile,
  useAnnouncements,
  useCreateAnnouncement,
  useDeleteAnnouncement,
  useGroupSet,
  useGroupSets,
  usePinAnnouncement,
  useTransitionAnnouncement,
  useUpdateAnnouncement,
} from '@/lib/queries';
import type {
  AnnouncementAttachment,
  AnnouncementAudience,
  AnnouncementStatus,
  AnnouncementSummary,
} from '@coursewise/shared';

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

type EditorState = {
  id: string | null;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  targetGroupIds: string[];
  attachments: AnnouncementAttachment[];
};

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
  const pin = usePinAnnouncement(id);
  const groupSetsQ = useGroupSets(id || undefined);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pickerSetId, setPickerSetId] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickerSetQ = useGroupSet(id || undefined, pickerSetId || undefined);

  const rows = listQ.data ?? [];
  const saving = create.isPending || update.isPending;

  const openNew = () =>
    setEditor({ id: null, title: '', body: '', audience: 'course', targetGroupIds: [], attachments: [] });
  const openEdit = (a: AnnouncementSummary) => {
    setPickerSetId('');
    setEditor({
      id: a.id,
      title: a.title,
      body: a.body,
      audience: a.audience,
      targetGroupIds: a.targetGroupIds,
      attachments: a.attachments,
    });
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file || !editor) return;
    setUploading(true);
    try {
      const res = await uploadFile(file, id, 'announcement');
      setEditor((prev) =>
        prev
          ? {
              ...prev,
              attachments: [
                ...prev.attachments,
                {
                  fileAssetId: res.fileAssetId,
                  fileName: res.originalFilename,
                  contentType: res.contentType,
                  sizeBytes: res.sizeBytes,
                },
              ],
            }
          : prev,
      );
    } catch (err) {
      toast.push({ title: err instanceof Error ? err.message : t('errors.internal'), tone: 'error' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleGroup = (groupId: string) => {
    setEditor((prev) =>
      prev
        ? {
            ...prev,
            targetGroupIds: prev.targetGroupIds.includes(groupId)
              ? prev.targetGroupIds.filter((g) => g !== groupId)
              : [...prev.targetGroupIds, groupId],
          }
        : prev,
    );
  };

  const onSave = async (publish: boolean) => {
    if (!editor) return;
    const title = editor.title.trim();
    const body = editor.body.trim();
    if (!title || !body) {
      toast.push({ title: t('announcements.validationRequired'), tone: 'error' });
      return;
    }
    if (editor.audience === 'groups' && editor.targetGroupIds.length === 0) {
      toast.push({ title: t('announcements.validationAudience'), tone: 'error' });
      return;
    }
    const payload = {
      title,
      body,
      audience: editor.audience,
      targetGroupIds: editor.audience === 'groups' ? editor.targetGroupIds : [],
      attachmentFileIds: editor.attachments.map((a) => a.fileAssetId),
    };
    try {
      if (editor.id) {
        await update.mutateAsync({ id: editor.id, input: payload });
        if (publish) await transition.mutateAsync({ id: editor.id, action: 'publish' });
      } else {
        await create.mutateAsync({ ...payload, publish });
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

  const onPin = async (a: AnnouncementSummary) => {
    try {
      await pin.mutateAsync({ id: a.id, pinned: !a.pinned });
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
            <div key={a.id} className={cn('rounded-md border p-4', a.pinned && 'border-primary/40')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.pinned ? <Pin className="h-3.5 w-3.5 text-primary" aria-hidden /> : null}
                    <h3 className="font-medium">{a.title}</h3>
                    <Badge variant={statusVariant(a.status)}>
                      {t(`announcements.status.${a.status}`)}
                    </Badge>
                    {a.audience === 'groups' ? (
                      <Badge variant="outline">
                        {t('announcements.audienceGroupsCount', { count: a.targetGroupIds.length })}
                      </Badge>
                    ) : null}
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
                  <ActionIconButton
                    icon={a.pinned ? PinOff : Pin}
                    label={a.pinned ? t('announcements.unpin') : t('announcements.pin')}
                    color="amber"
                    onClick={() => onPin(a)}
                  />
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
              <AnnouncementAttachments attachments={a.attachments} />
              <AnnouncementInteractions announcement={a} courseId={id} />
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

            <div>
              <Label>{t('announcements.fieldAudience')}</Label>
              <div className="mt-1 flex flex-col gap-1.5 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="ann-audience"
                    checked={editor.audience === 'course'}
                    onChange={() => setEditor({ ...editor, audience: 'course' })}
                  />
                  {t('announcements.audienceCourse')}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="ann-audience"
                    checked={editor.audience === 'groups'}
                    onChange={() => setEditor({ ...editor, audience: 'groups' })}
                  />
                  {t('announcements.audienceGroups')}
                </label>
              </div>
              {editor.audience === 'groups' ? (
                <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    {t('announcements.audienceGroupsCount', { count: editor.targetGroupIds.length })}
                  </p>
                  <select
                    value={pickerSetId}
                    onChange={(e) => setPickerSetId(e.target.value)}
                    className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="">{t('announcements.pickGroupSet')}</option>
                    {(groupSetsQ.data ?? []).map((gs) => (
                      <option key={gs.id} value={gs.id}>
                        {gs.name}
                      </option>
                    ))}
                  </select>
                  {pickerSetId && pickerSetQ.data ? (
                    <div className="flex flex-col gap-1">
                      {pickerSetQ.data.groups.map((g) => (
                        <label key={g.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editor.targetGroupIds.includes(g.id)}
                            onChange={() => toggleGroup(g.id)}
                          />
                          {g.name}
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div>
              <Label>{t('announcements.fieldAttachments')}</Label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {editor.attachments.map((a) => (
                  <span
                    key={a.fileAssetId}
                    className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs"
                  >
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    <span className="max-w-[12rem] truncate">{a.fileName}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditor({
                          ...editor,
                          attachments: editor.attachments.filter((x) => x.fileAssetId !== a.fileAssetId),
                        })
                      }
                      aria-label={t('common.delete')}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </span>
                ))}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => void onPickFile(e.target.files?.[0])}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Paperclip className="h-4 w-4" />
                  {uploading ? t('announcements.uploading') : t('announcements.attachFile')}
                </Button>
              </div>
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
