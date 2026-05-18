import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty';
import {
  useCreateModule,
  useDeleteModule,
  useModulesList,
  useReorderModules,
  useUpdateModule,
} from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';

export function TeacherModulesPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const list = useModulesList(id);
  const create = useCreateModule(id);
  const update = useUpdateModule(id);
  const del = useDeleteModule(id);
  const reorder = useReorderModules(id);
  const toast = useToast();

  const [openCreate, setOpenCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const onMove = async (index: number, dir: -1 | 1) => {
    if (!list.data) return;
    const next = list.data.slice();
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    try {
      await reorder.mutateAsync({ ids: next.map((m) => m.id) });
      toast.push({ title: t('modules.reordered'), tone: 'success' });
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18n), tone: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t('modules.title')}</h2>
        <Button onClick={() => setOpenCreate(true)}>{t('modules.newCta')}</Button>
      </header>
      {list.isLoading ? (
        <p>{t('common.loading')}</p>
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState
          title={t('modules.empty')}
          action={<Button onClick={() => setOpenCreate(true)}>{t('modules.newCta')}</Button>}
        />
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {list.data.map((m, idx) => (
              <div key={m.id} className="flex items-center justify-between gap-2 p-3">
                <div className="flex-1">
                  <div className="font-medium">{m.title}</div>
                  {m.description ? <p className="text-sm text-muted-foreground">{m.description}</p> : null}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => onMove(idx, -1)} disabled={idx === 0}>
                    ↑
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onMove(idx, 1)} disabled={idx === list.data!.length - 1}>
                    ↓
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(m.id)}>
                    {t('common.edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      if (!window.confirm(`${t('common.delete')}: ${m.title}?`)) return;
                      try {
                        await del.mutateAsync(m.id);
                        toast.push({ title: t('modules.deleted'), tone: 'success' });
                      } catch (err) {
                        const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                        toast.push({ title: t(i18n), tone: 'error' });
                      }
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ModuleDialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onSubmit={async (input) => {
          try {
            await create.mutateAsync(input);
            toast.push({ title: t('modules.created'), tone: 'success' });
            setOpenCreate(false);
          } catch (err) {
            const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
            toast.push({ title: t(i18n), tone: 'error' });
          }
        }}
      />

      {editingId ? (
        <ModuleDialog
          open
          onClose={() => setEditingId(null)}
          initial={list.data?.find((m) => m.id === editingId) ?? null}
          onSubmit={async (input) => {
            try {
              await update.mutateAsync({ id: editingId, input });
              toast.push({ title: t('modules.updated'), tone: 'success' });
              setEditingId(null);
            } catch (err) {
              const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
              toast.push({ title: t(i18n), tone: 'error' });
            }
          }}
        />
      ) : null}
    </div>
  );
}

function ModuleDialog({
  open,
  onClose,
  onSubmit,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { title: string; description: string | null }) => Promise<void>;
  initial?: { title: string; description: string | null } | null;
}): JSX.Element {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  return (
    <Dialog open={open} onClose={onClose} title={initial ? t('common.edit') : t('modules.newCta')}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await onSubmit({ title, description: description || null });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="title">{t('modules.titleLabel')}</Label>
          <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="description">{t('modules.descriptionLabel')}</Label>
          <Textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit">{t('common.save')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
