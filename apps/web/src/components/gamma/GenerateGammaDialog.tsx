import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GAMMA_BUILTIN_THEMES,
  GAMMA_FORMATS,
  GAMMA_IMAGE_SOURCES,
  GAMMA_IMAGE_STYLES,
  GAMMA_MAX_NUM_CARDS,
  GAMMA_MIN_NUM_CARDS,
  GAMMA_TEXT_AMOUNTS,
  GAMMA_TEXT_MODES,
  type GammaFormat,
  type GammaImageSource,
  type GammaImageStyleSlug,
  type GammaTextAmount,
  type GammaTextMode,
  type GammaTheme,
  type GenerateGammaPresentationInput,
  type MaterialSummary,
  type ModuleSummary,
} from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import {
  useCreateGammaPresentation,
  useGammaThemes,
  useMaterialsList,
  useModulesList,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

type Props = {
  open: boolean;
  onClose: () => void;
  courseId: string;
  defaultModuleId?: string | null;
  onStarted: (jobId: string, presentationId: string) => void;
};

const UNASSIGNED_GROUP_ID = '__unassigned__';

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

function sourceTypeKey(t: MaterialSummary['sourceType']): string {
  switch (t) {
    case 'upload':
      return 'materials.kindUpload';
    case 'external_link':
      return 'materials.kindExternalLink';
    case 'manual_text':
    default:
      return 'materials.kindManualText';
  }
}

export function GenerateGammaDialog({
  open,
  onClose,
  courseId,
  defaultModuleId,
  onStarted,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const themesQ = useGammaThemes();
  const modulesQ = useModulesList(open ? courseId : null);
  const materialsQ = useMaterialsList(open ? courseId : null);
  const create = useCreateGammaPresentation(courseId);
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [moduleId, setModuleId] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [touchedSelection, setTouchedSelection] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [themeId, setThemeId] = useState<string>('');
  const [format, setFormat] = useState<GammaFormat>('presentation');
  const [imageSource, setImageSource] = useState<GammaImageSource>('aiGenerated');
  const [imageStyleSlug, setImageStyleSlug] = useState<GammaImageStyleSlug>('auto');
  const [amount, setAmount] = useState<GammaTextAmount>('medium');
  const [textMode, setTextMode] = useState<GammaTextMode>('condense');
  // Empty string = "let Gamma decide". Keeping the input as text avoids a
  // forced 0/NaN state while the field is being typed.
  const [numCards, setNumCards] = useState<string>('');

  const modules: ModuleSummary[] = useMemo(() => modulesQ.data ?? [], [modulesQ.data]);
  // Always include Gamma's built-in themes (e.g. Pearl), de-duping by id so an
  // API entry with the same id wins on metadata like previewUrl.
  const themes = useMemo<GammaTheme[]>(() => {
    const apiThemes = themesQ.data ?? [];
    const seen = new Set(apiThemes.map((t) => t.id));
    const fallback = GAMMA_BUILTIN_THEMES.filter((t) => !seen.has(t.id));
    return [...apiThemes, ...fallback];
  }, [themesQ.data]);
  const materials = useMemo<MaterialSummary[]>(
    () => (materialsQ.data ?? []).filter((m) => m.status !== 'draft'),
    [materialsQ.data],
  );

  // Pre-check every manual_text material the first time the list lands —
  // seed once, before the user touches the selection.
  useEffect(() => {
    if (!open) return;
    if (touchedSelection) return;
    if (!materialsQ.data) return;
    const initial = materialsQ.data
      .filter((m) => m.status !== 'draft' && m.sourceType === 'manual_text')
      .map((m) => m.id);
    if (initial.length === 0) return;
    setSelected((prev) => {
      if (prev.size > 0) return prev;
      return new Set(initial);
    });
  }, [open, materialsQ.data, touchedSelection]);

  // When the dialog opens, sync moduleId to defaultModuleId (only once).
  useEffect(() => {
    if (open) {
      setModuleId(defaultModuleId ?? '');
    }
  }, [open, defaultModuleId]);

  const moduleTitle = useMemo(() => {
    const map = new Map<string, string>();
    modules.forEach((m) => map.set(m.id, m.title));
    return map;
  }, [modules]);

  // Group materials by module for the multi-select.
  const grouped = useMemo(() => {
    const groups = new Map<string, { id: string; title: string; items: MaterialSummary[] }>();
    materials.forEach((m) => {
      const key = m.moduleId ?? UNASSIGNED_GROUP_ID;
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(m);
      } else {
        groups.set(key, {
          id: key,
          title:
            key === UNASSIGNED_GROUP_ID
              ? t('materials.unassignedGroup')
              : moduleTitle.get(key) ?? t('materials.unassignedGroup'),
          items: [m],
        });
      }
    });
    return Array.from(groups.values());
  }, [materials, moduleTitle, t]);

  const toggleMaterial = (id: string) => {
    setTouchedSelection(true);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => {
    setTitle('');
    setModuleId(defaultModuleId ?? '');
    setSelected(new Set());
    setTouchedSelection(false);
    setInstructions('');
    setThemeId('');
    setFormat('presentation');
    setImageSource('aiGenerated');
    setImageStyleSlug('auto');
    setAmount('medium');
    setTextMode('condense');
    setNumCards('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const onSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();
    if (!title.trim() || selected.size === 0) return;
    const trimmedCards = numCards.trim();
    const parsedCards = trimmedCards === '' ? null : Number.parseInt(trimmedCards, 10);
    if (parsedCards != null && !Number.isFinite(parsedCards)) return;
    const input: GenerateGammaPresentationInput = {
      title: title.trim(),
      moduleId: moduleId || null,
      materialIds: Array.from(selected),
      additionalInstructions: instructions.trim() || null,
      themeId: themeId || null,
      imageSource,
      imageStyle:
        GAMMA_IMAGE_STYLES.find((s) => s.slug === imageStyleSlug)?.value || null,
      amount,
      textMode,
      numCards: parsedCards,
      exportAs: 'pptx',
      format,
    };
    try {
      const res = await create.mutateAsync(input);
      toast.push({ title: t('gamma.generationStarted'), tone: 'success' });
      onStarted(res.jobId, res.presentationId);
      close();
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('gamma.dialogTitle')}
      className="max-w-2xl"
      dismissOnBackdropClick={false}
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1">
          <Label htmlFor="gamma-title">{t('gamma.fields.title')}</Label>
          <Input
            id="gamma-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="gamma-module">{t('gamma.fields.module')}</Label>
          <select
            id="gamma-module"
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            className={SELECT_CLASS}
            disabled={modulesQ.isLoading}
          >
            <option value="">{t('materials.unassignedGroup')}</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label>{t('gamma.fields.materials')}</Label>
          <p className="text-xs text-muted-foreground">{t('gamma.fields.materialsHint')}</p>
          {materialsQ.isLoading ? (
            <p className="text-sm">{t('common.loading')}</p>
          ) : materials.length === 0 ? (
            <p className="rounded border bg-muted/30 p-3 text-sm text-muted-foreground">
              {t('materials.empty')}
            </p>
          ) : (
            <ul className="max-h-56 space-y-3 overflow-y-auto rounded border bg-background p-2">
              {grouped.map((group) => (
                <li key={group.id}>
                  <div className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {group.title}
                  </div>
                  <ul className="space-y-1">
                    {group.items.map((m) => (
                      <li key={m.id}>
                        <label className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/40">
                          <input
                            type="checkbox"
                            checked={selected.has(m.id)}
                            onChange={() => toggleMaterial(m.id)}
                          />
                          <span className="flex-1 truncate">{m.title}</span>
                          <Badge variant="outline">{t(sourceTypeKey(m.sourceType))}</Badge>
                        </label>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="gamma-instructions">{t('gamma.fields.instructions')}</Label>
          <Textarea
            id="gamma-instructions"
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={5000}
            placeholder={t('gamma.fields.instructionsHint')}
          />
          <p className="text-xs text-muted-foreground">{t('gamma.fields.instructionsHint')}</p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="gamma-format">{t('gamma.fields.format')}</Label>
          <select
            id="gamma-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as GammaFormat)}
            className={SELECT_CLASS}
          >
            {GAMMA_FORMATS.map((f) => (
              <option key={f} value={f}>
                {t(`gamma.format.${f}`)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{t('gamma.fields.formatHint')}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="gamma-theme">{t('gamma.fields.theme')}</Label>
            <select
              id="gamma-theme"
              value={themeId}
              onChange={(e) => setThemeId(e.target.value)}
              className={SELECT_CLASS}
              disabled={themesQ.isLoading}
            >
              <option value="">—</option>
              {themes.map((th) => (
                <option key={th.id} value={th.id}>
                  {th.name}
                </option>
              ))}
            </select>
            {themeId
              ? (() => {
                  const sel = themes.find((th) => th.id === themeId);
                  return sel?.previewUrl ? (
                    <img
                      src={sel.previewUrl}
                      alt={sel.name}
                      className="mt-2 h-16 w-28 rounded border object-cover"
                    />
                  ) : null;
                })()
              : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="gamma-image-style">{t('gamma.fields.imageStyle')}</Label>
            <select
              id="gamma-image-style"
              value={imageStyleSlug}
              onChange={(e) => setImageStyleSlug(e.target.value as GammaImageStyleSlug)}
              className={SELECT_CLASS}
            >
              {GAMMA_IMAGE_STYLES.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {t(`gamma.imageStyle.${s.slug}`)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{t('gamma.fields.imageStyleHint')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="gamma-text-mode">{t('gamma.fields.textMode')}</Label>
            <select
              id="gamma-text-mode"
              value={textMode}
              onChange={(e) => setTextMode(e.target.value as GammaTextMode)}
              className={SELECT_CLASS}
            >
              {GAMMA_TEXT_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`gamma.textMode.${m}`)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{t(`gamma.textModeHint.${textMode}`)}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="gamma-num-cards">{t('gamma.fields.numCards')}</Label>
            <Input
              id="gamma-num-cards"
              type="number"
              inputMode="numeric"
              min={GAMMA_MIN_NUM_CARDS}
              max={GAMMA_MAX_NUM_CARDS}
              step={1}
              value={numCards}
              onChange={(e) => setNumCards(e.target.value)}
              placeholder={t('gamma.fields.numCardsPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('gamma.fields.numCardsHint')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="gamma-image-source">{t('gamma.fields.imageSource')}</Label>
            <select
              id="gamma-image-source"
              value={imageSource}
              onChange={(e) => setImageSource(e.target.value as GammaImageSource)}
              className={SELECT_CLASS}
            >
              {GAMMA_IMAGE_SOURCES.map((src) => (
                <option key={src} value={src}>
                  {t(`gamma.imageSource.${src}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="gamma-amount">{t('gamma.fields.amount')}</Label>
            <select
              id="gamma-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value as GammaTextAmount)}
              className={SELECT_CLASS}
            >
              {GAMMA_TEXT_AMOUNTS.map((a) => (
                <option key={a} value={a}>
                  {t(`gamma.amount.${a}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={!title.trim() || selected.size === 0 || create.isPending}
          >
            {create.isPending ? t('common.loading') : t('gamma.dialogTitle')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
