import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty';
import { Markdown } from '@/components/ui/markdown';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import {
  getDownloadUrl,
  useCreateSlide,
  useDeleteSlide,
  usePresentation,
  useReorderSlides,
  useSlidesList,
  useTransitionPresentation,
  useUpdateSlide,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import { cn } from '@/lib/utils';

export function TeacherPresentationEditorPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId, presentationId } = useParams();
  const cId = courseId ?? '';
  const pId = presentationId ?? '';
  const presentation = usePresentation(pId);
  const slides = useSlidesList(pId);
  const transition = useTransitionPresentation(cId);
  const createSlide = useCreateSlide(pId);
  const updateSlide = useUpdateSlide(pId);
  const deleteSlide = useDeleteSlide(pId);
  const reorderSlides = useReorderSlides(pId);
  const toast = useToast();
  const confirm = useConfirm();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftLayout, setDraftLayout] = useState('default');

  useEffect(() => {
    if (!selectedId && slides.data && slides.data.length > 0) {
      setSelectedId(slides.data[0]!.id);
    }
  }, [slides.data, selectedId]);

  useEffect(() => {
    const s = slides.data?.find((x) => x.id === selectedId);
    if (s) {
      setDraftTitle(s.title ?? '');
      setDraftContent(s.content ?? '');
      setDraftNotes(s.speakerNotes ?? '');
      setDraftLayout(s.layout ?? 'default');
    }
  }, [selectedId, slides.data]);

  const move = (dir: -1 | 1) => {
    if (!slides.data || !selectedId) return;
    const ids = slides.data.map((s) => s.id);
    const idx = ids.indexOf(selectedId);
    const target = idx + dir;
    if (target < 0 || target >= ids.length) return;
    const next = [...ids];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved!);
    void reorderSlides.mutateAsync({ ids: next });
  };

  const save = async () => {
    if (!selectedId) return;
    try {
      await updateSlide.mutateAsync({
        id: selectedId,
        input: {
          title: draftTitle || null,
          content: draftContent || null,
          speakerNotes: draftNotes || null,
          layout: draftLayout || null,
        },
      });
      toast.push({ title: t('slides.saved'), tone: 'success' });
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const addSlide = async () => {
    const created = await createSlide.mutateAsync({
      title: 'New slide',
      content: '',
      layout: 'default',
    });
    setSelectedId(created.id);
  };

  // External-deck short-circuit: when a Gamma-rendered presentation is loaded,
  // we skip the slide editor entirely and render a small landing card with
  // links to the Gamma deck and the cached .pptx.
  if (presentation.data?.provider === 'gamma') {
    const ext = presentation.data.externalUrl;
    const fileId = presentation.data.fileAssetId;
    const onDownload = async () => {
      if (!fileId) return;
      try {
        const res = await getDownloadUrl(fileId);
        window.location.href = res.downloadUrl;
      } catch (err) {
        const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
        toast.push({ title: t(key), tone: 'error' });
      }
    };
    return (
      <div className="space-y-4 p-2">
        <Link
          to={`/teacher/courses/${cId}/presentations`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {t('common.back')}
        </Link>
        <h1 className="text-xl font-semibold">{presentation.data.title}</h1>
        <p className="text-muted-foreground">{t('gamma.externalDeckBanner')}</p>
        <div className="flex flex-wrap gap-2">
          {ext ? (
            <Button asChild>
              <a href={ext} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                {t('gamma.openInGamma')}
              </a>
            </Button>
          ) : null}
          {fileId ? (
            <Button variant="outline" onClick={onDownload}>
              <Download className="h-4 w-4" />
              {t('gamma.downloadPptx')}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">
            <Link to={`/teacher/courses/${cId}/presentations`} className="text-muted-foreground hover:underline">
              {t('presentations.title')}
            </Link>
            {' › '}
            {presentation.data?.title ?? t('common.loading')}
          </h2>
          {presentation.data ? (
            <Badge variant={presentation.data.status === 'published' ? 'success' : 'secondary'}>
              {t(
                `presentations.status${presentation.data.status[0]!.toUpperCase()}${presentation.data.status.slice(1)}`,
              )}
            </Badge>
          ) : null}
        </div>
        <div className="flex gap-2">
          {presentation.data?.status !== 'published' ? (
            <Button
              size="sm"
              onClick={async () => {
                await transition.mutateAsync({ id: pId, action: 'publish' });
                toast.push({ title: t('presentations.published'), tone: 'success' });
              }}
            >
              {t('presentations.publish')}
            </Button>
          ) : null}
          {presentation.data?.status !== 'archived' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await transition.mutateAsync({ id: pId, action: 'archive' });
              }}
            >
              {t('presentations.archive')}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">{t('slides.list')}</CardTitle>
            <Button size="sm" onClick={addSlide}>
              {t('slides.addCta')}
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {slides.isLoading ? (
              <p className="px-2 text-sm">{t('common.loading')}</p>
            ) : !slides.data || slides.data.length === 0 ? (
              <EmptyState title={t('slides.empty')} />
            ) : (
              slides.data.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-muted',
                    selectedId === s.id ? 'bg-muted font-medium' : '',
                  )}
                >
                  <span className="truncate">
                    {idx + 1}. {s.title?.trim() || t('slides.untitled')}
                  </span>
                </button>
              ))
            )}
            {slides.data && slides.data.length > 1 && selectedId ? (
              <div className="flex justify-end gap-1.5 pt-2">
                <ActionIconButton
                  size="sm"
                  icon={ChevronUp}
                  label={t('modules.moveUp')}
                  color="sky"
                  onClick={() => move(-1)}
                />
                <ActionIconButton
                  size="sm"
                  icon={ChevronDown}
                  label={t('modules.moveDown')}
                  color="sky"
                  onClick={() => move(1)}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        {selectedId ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('slides.editTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="slide-title">{t('slides.titleLabel')}</Label>
                <Input
                  id="slide-title"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="slide-layout">{t('slides.layoutLabel')}</Label>
                <select
                  id="slide-layout"
                  value={draftLayout}
                  onChange={(e) => setDraftLayout(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="default">{t('slides.layoutDefault')}</option>
                  <option value="title">{t('slides.layoutTitle')}</option>
                  <option value="image">{t('slides.layoutImage')}</option>
                  <option value="two-column">{t('slides.layoutTwoColumn')}</option>
                </select>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label htmlFor="slide-content">{t('slides.contentLabel')}</Label>
                  <Textarea
                    id="slide-content"
                    rows={10}
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                  />
                </div>
                <div>
                  <Label>{t('slides.preview')}</Label>
                  <div className="min-h-[240px] rounded-md border bg-muted/20 p-3">
                    <Markdown source={draftContent} />
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="slide-notes">{t('slides.speakerNotes')}</Label>
                <Textarea
                  id="slide-notes"
                  rows={4}
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                />
              </div>
              <div className="flex justify-between">
                <Button
                  variant="destructive"
                  onClick={async () => {
                    const idx = slides.data?.findIndex((s) => s.id === selectedId) ?? -1;
                    const current = idx >= 0 ? slides.data?.[idx] : undefined;
                    const ok = await confirm({
                      title: t('slides.deleteConfirm'),
                      description: t('slides.deleteBody'),
                      detail: {
                        name: current?.title?.trim()
                          ? current.title
                          : t('slides.slideN', { n: idx + 1 }),
                      },
                      confirmLabel: t('common.delete'),
                    });
                    if (!ok) return;
                    await deleteSlide.mutateAsync(selectedId);
                    setSelectedId(null);
                  }}
                >
                  {t('common.delete')}
                </Button>
                <Button onClick={save} disabled={updateSlide.isPending}>
                  {t('common.save')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <EmptyState title={t('slides.selectPrompt')} />
        )}
      </div>
    </div>
  );
}
