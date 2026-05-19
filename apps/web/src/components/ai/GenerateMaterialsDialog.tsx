import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AI_GENERATION_DEPTHS,
  AI_GENERATION_LANGUAGES,
  type AiGenerationDepth,
  type AiGenerationLanguage,
  type GenerateMaterialsInput,
  type ModuleSummary,
} from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Label, Textarea } from '@/components/ui/input';
import { useCourseAiModels, useGenerateMaterials, useModulesList } from '@/lib/queries';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';

type Props = {
  courseId: string;
  open: boolean;
  onClose: () => void;
  onStarted: (jobId: string) => void;
};

export function GenerateMaterialsDialog({ courseId, open, onClose, onStarted }: Props): JSX.Element {
  const { t } = useTranslation();
  const modelsQ = useCourseAiModels(open ? courseId : null);
  const modulesQ = useModulesList(open ? courseId : null);
  const generate = useGenerateMaterials(courseId);
  const toast = useToast();

  const models = modelsQ.data ?? [];
  const allModules: ModuleSummary[] = useMemo(() => modulesQ.data ?? [], [modulesQ.data]);

  const [modelId, setModelId] = useState('');
  const [moduleIds, setModuleIds] = useState<Set<string>>(new Set());
  const [language, setLanguage] = useState<AiGenerationLanguage>('en');
  const [depth, setDepth] = useState<AiGenerationDepth>('standard');
  const [instructions, setInstructions] = useState('');

  // Fall back to the first available model until the user picks one. We
  // derive rather than `useEffect`-write to avoid the exhaustive-deps trap.
  const effectiveModelId = modelId || models[0]?.id || '';

  const toggleAll = () => {
    if (moduleIds.size === allModules.length) {
      setModuleIds(new Set());
    } else {
      setModuleIds(new Set(allModules.map((m) => m.id)));
    }
  };

  const toggleOne = (id: string) => {
    setModuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => {
    setModelId('');
    setModuleIds(new Set());
    setLanguage('en');
    setDepth('standard');
    setInstructions('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveModelId || moduleIds.size === 0) return;
    const input: GenerateMaterialsInput = {
      modelId: effectiveModelId,
      moduleIds: Array.from(moduleIds),
      language,
      depth,
      instructions: instructions.trim() ? instructions.trim() : undefined,
    };
    try {
      const res = await generate.mutateAsync(input);
      toast.push({ title: t('ai.generate.started'), tone: 'success' });
      onStarted(res.jobId);
      close();
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18n), tone: 'error' });
    }
  };

  return (
    <Dialog open={open} onClose={close} title={t('ai.generate.title')}>
      <form className="space-y-4" onSubmit={onSubmit}>
        {modelsQ.isLoading ? (
          <p>{t('common.loading')}</p>
        ) : models.length === 0 ? (
          <p className="rounded border bg-muted/30 p-3 text-sm text-muted-foreground">
            {t('ai.generate.noModelsHint')}
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <Label htmlFor="ai-gen-model">{t('ai.generate.model')}</Label>
              <select
                id="ai-gen-model"
                value={effectiveModelId}
                onChange={(e) => setModelId(e.target.value)}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName} ({m.modelId})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>{t('ai.generate.modules')}</Label>
                {allModules.length > 0 ? (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs text-primary underline-offset-2 hover:underline"
                  >
                    {moduleIds.size === allModules.length
                      ? t('ai.generate.deselectAll')
                      : t('ai.generate.selectAll')}
                  </button>
                ) : null}
              </div>
              {allModules.length === 0 ? (
                <p className="rounded border bg-muted/30 p-3 text-sm text-muted-foreground">
                  {t('ai.generate.noModulesHint')}
                </p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded border bg-background p-2">
                  {allModules.map((m) => (
                    <li key={m.id}>
                      <label className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/40">
                        <input
                          type="checkbox"
                          checked={moduleIds.has(m.id)}
                          onChange={() => toggleOne(m.id)}
                        />
                        <span className="truncate">{m.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ai-gen-language">{t('ai.generate.language')}</Label>
                <select
                  id="ai-gen-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as AiGenerationLanguage)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {AI_GENERATION_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {t(`ai.generate.lang.${l === 'zh-CN' ? 'zhCN' : l}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ai-gen-depth">{t('ai.generate.depth')}</Label>
                <select
                  id="ai-gen-depth"
                  value={depth}
                  onChange={(e) => setDepth(e.target.value as AiGenerationDepth)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {AI_GENERATION_DEPTHS.map((d) => (
                    <option key={d} value={d}>
                      {t(`ai.generate.depthValue.${d}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ai-gen-instructions">{t('ai.generate.instructions')}</Label>
              <Textarea
                id="ai-gen-instructions"
                rows={3}
                placeholder={t('ai.generate.instructionsPlaceholder')}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                maxLength={4000}
              />
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={
              models.length === 0 ||
              allModules.length === 0 ||
              !effectiveModelId ||
              moduleIds.size === 0 ||
              generate.isPending
            }
          >
            {generate.isPending ? t('common.loading') : t('ai.generate.start')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
