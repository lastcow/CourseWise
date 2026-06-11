import { useMemo, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Save } from 'lucide-react';
import type {
  AiArtifactKind,
  AiPromptDepthConfig,
  AiPromptTemplate,
  UpdateAiPromptTemplateInput,
} from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { ApiClientError } from '@/lib/api';
import {
  useAiPromptTemplates,
  useResetAiPromptTemplate,
  useUpdateAiPromptTemplate,
} from '@/lib/queries';

const SYSTEM_VARIABLES = [
  'course.title',
  'course.code',
  'course.termLabel',
  'course.description',
  'moduleSummary',
  'language',
  'wordTarget',
  'teacherInstructions',
] as const;

const USER_MESSAGE_VARIABLES = ['module.title', 'module.description'] as const;

type Depth = 'brief' | 'standard' | 'detailed';
const DEPTHS: Depth[] = ['brief', 'standard', 'detailed'];

export function PromptTemplateCard(): JSX.Element {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const templatesQ = useAiPromptTemplates();
  const templates = templatesQ.data ?? [];
  const [activeKind, setActiveKind] = useState<AiArtifactKind | null>(null);
  const dirtyRef = useRef<() => boolean>(() => false);

  // Default to the first template once loaded.
  const effectiveKind = activeKind ?? templates[0]?.kind ?? null;
  const active = effectiveKind
    ? templates.find((tpl) => tpl.kind === effectiveKind) ?? null
    : null;

  async function tryChangeKind(next: AiArtifactKind): Promise<void> {
    if (dirtyRef.current()) {
      const ok = await confirm({
        title: t('ai.prompts.discardTitle'),
        description: t('ai.prompts.discardBody'),
        detail: effectiveKind ? { name: t(`ai.prompts.kinds.${effectiveKind}`) } : undefined,
        confirmLabel: t('ai.prompts.discardAction'),
      });
      if (!ok) return;
    }
    setActiveKind(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('ai.prompts.title')}</CardTitle>
        <CardDescription>{t('ai.prompts.description', { example: '{{name}}' })}</CardDescription>
      </CardHeader>
      <CardContent>
        {templatesQ.isLoading ? (
          <p>{t('common.loading')}</p>
        ) : templates.length === 0 ? (
          <p className="rounded border bg-muted/30 p-3 text-sm text-muted-foreground">
            {t('ai.prompts.empty')}
          </p>
        ) : (
          <div className="space-y-4">
            <KindTabs
              kinds={templates.map((tpl) => tpl.kind)}
              active={effectiveKind}
              onChange={tryChangeKind}
            />
            {active ? (
              <PromptTemplateForm key={active.id} template={active} dirtyRef={dirtyRef} />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KindTabs({
  kinds,
  active,
  onChange,
}: {
  kinds: AiArtifactKind[];
  active: AiArtifactKind | null;
  onChange: (k: AiArtifactKind) => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {kinds.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={
            'rounded-full border px-3 py-1 text-xs ' +
            (k === active ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')
          }
        >
          {t(`ai.prompts.kinds.${k}`)}
        </button>
      ))}
    </div>
  );
}

function PromptTemplateForm({
  template,
  dirtyRef,
}: {
  template: AiPromptTemplate;
  dirtyRef: MutableRefObject<() => boolean>;
}): JSX.Element {
  const { t } = useTranslation();
  const updateM = useUpdateAiPromptTemplate();
  const resetM = useResetAiPromptTemplate();
  const toast = useToast();
  const confirm = useConfirm();

  const [systemPrompt, setSystemPrompt] = useState(template.systemPrompt);
  const [userMessage, setUserMessage] = useState(template.userMessage);
  const [depthConfig, setDepthConfig] = useState<AiPromptDepthConfig>(template.depthConfig);

  const sysRef = useRef<HTMLTextAreaElement>(null);
  const usrRef = useRef<HTMLTextAreaElement>(null);

  const dirty = useMemo(
    () =>
      systemPrompt !== template.systemPrompt ||
      userMessage !== template.userMessage ||
      JSON.stringify(depthConfig) !== JSON.stringify(template.depthConfig),
    [systemPrompt, userMessage, depthConfig, template],
  );
  // Publish a fresh "isDirty" getter so the parent's tryChangeKind reads current state.
  dirtyRef.current = () => dirty;

  // Local validation — server is the source of truth, this is just to gate Save.
  const valid = useMemo(() => {
    if (!systemPrompt.trim() || systemPrompt.length > 8000) return false;
    if (!userMessage.trim() || userMessage.length > 8000) return false;
    for (const d of DEPTHS) {
      const e = depthConfig[d];
      if (!e.wordTarget.trim()) return false;
      if (!Number.isInteger(e.maxTokens) || e.maxTokens < 100 || e.maxTokens > 32000) return false;
    }
    return true;
  }, [systemPrompt, userMessage, depthConfig]);

  function insertAt(ref: RefObject<HTMLTextAreaElement>, varName: string): void {
    const el = ref.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const after = el.value.slice(el.selectionEnd);
    const inserted = `{{${varName}}}`;
    const next = before + inserted + after;
    if (ref === sysRef) setSystemPrompt(next);
    else setUserMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = before.length + inserted.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  async function onSave(): Promise<void> {
    const input: UpdateAiPromptTemplateInput = {
      systemPrompt: systemPrompt.trim(),
      userMessage: userMessage.trim(),
      depthConfig,
    };
    try {
      await updateM.mutateAsync({ kind: template.kind, input });
      toast.push({ title: t('ai.prompts.saved'), tone: 'success' });
    } catch (err) {
      const i18nKey = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18nKey), tone: 'error' });
    }
  }

  async function onReset(): Promise<void> {
    const ok = await confirm({
      title: t('ai.prompts.resetTitle'),
      description: t('ai.prompts.resetBody'),
      detail: { name: t(`ai.prompts.kinds.${template.kind}`) },
      confirmLabel: t('ai.prompts.resetAction'),
    });
    if (!ok) return;
    try {
      await resetM.mutateAsync(template.kind);
      toast.push({ title: t('ai.prompts.resetDone'), tone: 'success' });
    } catch (err) {
      const i18nKey = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18nKey), tone: 'error' });
    }
  }

  return (
    <div className="space-y-5">
      <PromptField
        label={t('ai.prompts.systemLabel')}
        value={systemPrompt}
        onChange={setSystemPrompt}
        variables={SYSTEM_VARIABLES}
        onInsertVariable={(v) => insertAt(sysRef, v)}
        textareaRef={sysRef}
        rows={14}
      />
      <PromptField
        label={t('ai.prompts.userMessageLabel')}
        value={userMessage}
        onChange={setUserMessage}
        variables={USER_MESSAGE_VARIABLES}
        onInsertVariable={(v) => insertAt(usrRef, v)}
        textareaRef={usrRef}
        rows={4}
      />
      <DepthGrid value={depthConfig} onChange={setDepthConfig} />
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onReset} disabled={resetM.isPending} type="button">
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> {t('ai.prompts.reset')}
        </Button>
        <Button onClick={onSave} disabled={!dirty || !valid || updateM.isPending} type="button">
          <Save className="mr-1 h-3.5 w-3.5" /> {t('ai.prompts.save')}
        </Button>
      </div>
    </div>
  );
}

function PromptField({
  label,
  value,
  onChange,
  variables,
  onInsertVariable,
  textareaRef,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  variables: readonly string[];
  onInsertVariable: (v: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  rows: number;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]">
      <div className="space-y-1">
        <Label>{label}</Label>
        <Textarea
          ref={textareaRef}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs"
          maxLength={8000}
        />
      </div>
      <div className="space-y-1">
        <Label>{t('ai.prompts.variablesLabel')}</Label>
        <ul className="space-y-1 rounded border bg-muted/30 p-2 text-xs">
          {variables.map((v) => (
            <li key={v} className="flex items-center justify-between gap-2">
              <code className="truncate text-[11px]">{`{{${v}}}`}</code>
              <button
                type="button"
                onClick={() => onInsertVariable(v)}
                className="rounded border bg-background px-1.5 py-0.5 text-[10px] hover:bg-muted"
              >
                {t('ai.prompts.insertVariable')}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DepthGrid({
  value,
  onChange,
}: {
  value: AiPromptDepthConfig;
  onChange: (next: AiPromptDepthConfig) => void;
}): JSX.Element {
  const { t } = useTranslation();
  function update(depth: Depth, patch: Partial<{ wordTarget: string; maxTokens: number }>): void {
    onChange({ ...value, [depth]: { ...value[depth], ...patch } });
  }
  return (
    <div className="space-y-1">
      <Label>{t('ai.prompts.depthLabel')}</Label>
      <div className="grid grid-cols-[100px_1fr_140px] gap-2 text-xs">
        <div />
        <div className="text-muted-foreground">{t('ai.prompts.wordTargetLabel')}</div>
        <div className="text-muted-foreground">{t('ai.prompts.maxTokensLabel')}</div>
        {DEPTHS.map((d) => (
          <DepthRow key={d} depth={d} entry={value[d]} onChange={(patch) => update(d, patch)} />
        ))}
      </div>
    </div>
  );
}

function DepthRow({
  depth,
  entry,
  onChange,
}: {
  depth: Depth;
  entry: { wordTarget: string; maxTokens: number };
  onChange: (patch: Partial<{ wordTarget: string; maxTokens: number }>) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const tokensValid =
    Number.isInteger(entry.maxTokens) && entry.maxTokens >= 100 && entry.maxTokens <= 32000;
  return (
    <>
      <div className="self-center font-medium">{depth}</div>
      <Input
        value={entry.wordTarget}
        onChange={(e) => onChange({ wordTarget: e.target.value })}
        maxLength={120}
      />
      <div>
        <Input
          type="number"
          min={100}
          max={32000}
          value={entry.maxTokens}
          onChange={(e) => onChange({ maxTokens: Number(e.target.value) || 0 })}
          aria-invalid={!tokensValid}
        />
        {!tokensValid ? (
          <p className="mt-0.5 text-[10px] text-destructive">
            {t('ai.prompts.validation.tokensRange', { min: 100, max: 32000 })}
          </p>
        ) : null}
      </div>
    </>
  );
}
