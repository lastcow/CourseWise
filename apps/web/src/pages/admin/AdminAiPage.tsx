import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2 } from 'lucide-react';
import {
  AI_MODEL_CATALOG,
  AI_PROVIDER_KINDS,
  type AiModelSummary,
  type AiProviderKind,
  type AiProviderSummary,
  type CreateAiModelInput,
  type CreateAiProviderInput,
  type UpdateAiModelInput,
  type UpdateAiProviderInput,
} from '@coursewise/shared';
import { ApiClientError } from '@/lib/api';
import {
  useAiModels,
  useAiProviders,
  useCreateAiModel,
  useCreateAiProvider,
  useDeleteAiModel,
  useDeleteAiProvider,
  useUpdateAiModel,
  useUpdateAiProvider,
} from '@/lib/queries';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Input, Label } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { PromptTemplateCard } from '@/components/admin/PromptTemplateCard';

export function AdminAiPage(): JSX.Element {
  const { t } = useTranslation();
  const providersQ = useAiProviders();
  const modelsQ = useAiModels();
  const toast = useToast();
  const confirm = useConfirm();

  const createProvider = useCreateAiProvider();
  const updateProvider = useUpdateAiProvider();
  const deleteProvider = useDeleteAiProvider();
  const createModel = useCreateAiModel();
  const updateModel = useUpdateAiModel();
  const deleteModel = useDeleteAiModel();

  const [providerDialog, setProviderDialog] = useState<{ open: boolean; initial?: AiProviderSummary }>(
    { open: false },
  );
  const [modelDialog, setModelDialog] = useState<{ open: boolean; initial?: AiModelSummary }>({
    open: false,
  });

  const handle = async <T,>(fn: () => Promise<T>, successKey: string) => {
    try {
      await fn();
      toast.push({ title: t(successKey), tone: 'success' });
    } catch (err) {
      const i18n = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(i18n), tone: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{t('ai.adminTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('ai.adminSubtitle')}</p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>{t('ai.providersTitle')}</CardTitle>
              <CardDescription>{t('ai.providersDescription')}</CardDescription>
            </div>
            <Button onClick={() => setProviderDialog({ open: true })}>
              {t('ai.providerNewCta')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {providersQ.isLoading ? (
            <p className="p-4">{t('common.loading')}</p>
          ) : !providersQ.data || providersQ.data.length === 0 ? (
            <EmptyState
              className="m-4"
              title={t('ai.providersEmpty')}
              action={
                <Button onClick={() => setProviderDialog({ open: true })}>
                  {t('ai.providerNewCta')}
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('ai.kind')}</TableHead>
                  <TableHead>{t('ai.displayName')}</TableHead>
                  <TableHead>{t('ai.secretRef')}</TableHead>
                  <TableHead>{t('ai.status')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providersQ.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono uppercase">{row.kind}</TableCell>
                    <TableCell>{row.displayName}</TableCell>
                    <TableCell className="font-mono text-xs">{row.apiKeySecretRef}</TableCell>
                    <TableCell className="space-x-1.5">
                      <Badge variant={row.enabled ? 'success' : 'outline'}>
                        {t(row.enabled ? 'ai.enabled' : 'ai.disabled')}
                      </Badge>
                      <Badge variant={row.secretConfigured ? 'info' : 'destructive'}>
                        {t(row.secretConfigured ? 'ai.secretConfigured' : 'ai.secretMissing')}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-1.5 text-right">
                      <ActionIconButton
                        icon={Pencil}
                        label={t('common.edit')}
                        color="yellow"
                        onClick={() => setProviderDialog({ open: true, initial: row })}
                      />
                      <ActionIconButton
                        icon={Trash2}
                        label={t('common.delete')}
                        color="red"
                        onClick={async () => {
                          const ok = await confirm({
                            title: t('ai.deleteProviderTitle'),
                            description: t('ai.deleteProviderBody'),
                            detail: { name: row.displayName },
                            confirmLabel: t('common.delete'),
                          });
                          if (!ok) return;
                          void handle(
                            () => deleteProvider.mutateAsync(row.id),
                            'ai.providerDeleted',
                          );
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>{t('ai.modelsTitle')}</CardTitle>
              <CardDescription>{t('ai.modelsDescription')}</CardDescription>
            </div>
            <Button
              onClick={() => setModelDialog({ open: true })}
              disabled={!providersQ.data || providersQ.data.length === 0}
            >
              {t('ai.modelNewCta')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {modelsQ.isLoading ? (
            <p className="p-4">{t('common.loading')}</p>
          ) : !modelsQ.data || modelsQ.data.length === 0 ? (
            <EmptyState className="m-4" title={t('ai.modelsEmpty')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('ai.kind')}</TableHead>
                  <TableHead>{t('ai.modelId')}</TableHead>
                  <TableHead>{t('ai.displayName')}</TableHead>
                  <TableHead>{t('ai.costIn')}</TableHead>
                  <TableHead>{t('ai.costOut')}</TableHead>
                  <TableHead>{t('ai.status')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modelsQ.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono uppercase">{row.providerKind}</TableCell>
                    <TableCell className="font-mono text-xs">{row.modelId}</TableCell>
                    <TableCell>{row.displayName}</TableCell>
                    <TableCell>{row.costInPer1m ?? '—'}</TableCell>
                    <TableCell>{row.costOutPer1m ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={row.enabled ? 'success' : 'outline'}>
                        {t(row.enabled ? 'ai.enabled' : 'ai.disabled')}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-1.5 text-right">
                      <ActionIconButton
                        icon={Pencil}
                        label={t('common.edit')}
                        color="yellow"
                        onClick={() => setModelDialog({ open: true, initial: row })}
                      />
                      <ActionIconButton
                        icon={Trash2}
                        label={t('common.delete')}
                        color="red"
                        onClick={async () => {
                          const ok = await confirm({
                            title: t('ai.deleteModelTitle'),
                            description: t('ai.deleteModelBody'),
                            detail: { name: row.displayName },
                            confirmLabel: t('common.delete'),
                          });
                          if (!ok) return;
                          void handle(() => deleteModel.mutateAsync(row.id), 'ai.modelDeleted');
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PromptTemplateCard />

      <ProviderDialog
        key={`provider-${providerDialog.initial?.id ?? 'new'}-${providerDialog.open}`}
        open={providerDialog.open}
        initial={providerDialog.initial}
        onClose={() => setProviderDialog({ open: false })}
        onCreate={async (input) => {
          await handle(async () => {
            await createProvider.mutateAsync(input);
            setProviderDialog({ open: false });
          }, 'ai.providerCreated');
        }}
        onUpdate={async (id, input) => {
          await handle(async () => {
            await updateProvider.mutateAsync({ id, input });
            setProviderDialog({ open: false });
          }, 'ai.providerUpdated');
        }}
      />

      <ModelDialog
        key={`model-${modelDialog.initial?.id ?? 'new'}-${modelDialog.open}`}
        open={modelDialog.open}
        initial={modelDialog.initial}
        providers={providersQ.data ?? []}
        onClose={() => setModelDialog({ open: false })}
        onCreate={async (input) => {
          await handle(async () => {
            await createModel.mutateAsync(input);
            setModelDialog({ open: false });
          }, 'ai.modelCreated');
        }}
        onUpdate={async (id, input) => {
          await handle(async () => {
            await updateModel.mutateAsync({ id, input });
            setModelDialog({ open: false });
          }, 'ai.modelUpdated');
        }}
      />
    </div>
  );
}

function ProviderDialog({
  open,
  initial,
  onClose,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  initial?: AiProviderSummary;
  onClose: () => void;
  onCreate: (input: CreateAiProviderInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateAiProviderInput) => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  const [kind, setKind] = useState<AiProviderKind>(initial?.kind ?? 'anthropic');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [apiKeySecretRef, setApiKeySecretRef] = useState(initial?.apiKeySecretRef ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  return (
    <Dialog open={open} onClose={onClose} title={initial ? t('common.edit') : t('ai.providerNewCta')}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (initial) {
            await onUpdate(initial.id, { displayName, apiKeySecretRef, enabled });
          } else {
            await onCreate({ kind, displayName, apiKeySecretRef, enabled });
          }
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="ai-provider-kind">{t('ai.kind')}</Label>
          <select
            id="ai-provider-kind"
            disabled={!!initial}
            value={kind}
            onChange={(e) => setKind(e.target.value as AiProviderKind)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {AI_PROVIDER_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ai-provider-name">{t('ai.displayName')}</Label>
          <Input
            id="ai-provider-name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ai-provider-secret">{t('ai.secretRef')}</Label>
          <Input
            id="ai-provider-secret"
            required
            value={apiKeySecretRef}
            onChange={(e) => setApiKeySecretRef(e.target.value.toUpperCase())}
            placeholder="ANTHROPIC_API_KEY"
            pattern="[A-Z][A-Z0-9_]*"
          />
          <p className="text-xs text-muted-foreground">{t('ai.secretRefHint')}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t('ai.enabled')}
        </label>
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

function ModelDialog({
  open,
  initial,
  providers,
  onClose,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  initial?: AiModelSummary;
  providers: AiProviderSummary[];
  onClose: () => void;
  onCreate: (input: CreateAiModelInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateAiModelInput) => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  const [providerId, setProviderId] = useState(initial?.providerId ?? providers[0]?.id ?? '');
  const [modelId, setModelId] = useState(initial?.modelId ?? '');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [costIn, setCostIn] = useState(initial?.costInPer1m?.toString() ?? '');
  const [costOut, setCostOut] = useState(initial?.costOutPer1m?.toString() ?? '');

  const selectedProvider = providers.find((p) => p.id === providerId);
  const catalog = selectedProvider
    ? (AI_MODEL_CATALOG[selectedProvider.kind] ?? [])
    : [];

  // Picking a catalog entry pre-fills displayName when the admin hasn't yet
  // edited it. Editing keeps whatever they typed.
  const onPickModelId = (next: string) => {
    setModelId(next);
    const match = catalog.find((m) => m.id === next);
    if (match && (!displayName || catalog.some((m) => m.label === displayName))) {
      setDisplayName(match.label);
    }
  };

  const onPickProvider = (next: string) => {
    setProviderId(next);
    // Reset modelId since the previous provider's catalog no longer applies.
    setModelId('');
  };

  const parseCost = (s: string): number | null => {
    if (!s.trim()) return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  return (
    <Dialog open={open} onClose={onClose} title={initial ? t('common.edit') : t('ai.modelNewCta')}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const costInPer1m = parseCost(costIn);
          const costOutPer1m = parseCost(costOut);
          if (initial) {
            await onUpdate(initial.id, { displayName, enabled, costInPer1m, costOutPer1m });
          } else {
            await onCreate({
              providerId,
              modelId,
              displayName,
              enabled,
              costInPer1m,
              costOutPer1m,
            });
          }
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="ai-model-provider">{t('ai.kind')}</Label>
          <select
            id="ai-model-provider"
            disabled={!!initial}
            value={providerId}
            onChange={(e) => onPickProvider(e.target.value)}
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName} ({p.kind})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ai-model-id">{t('ai.modelId')}</Label>
          {initial ? (
            <Input id="ai-model-id" disabled value={modelId} />
          ) : (
            <select
              id="ai-model-id"
              required
              value={modelId}
              onChange={(e) => onPickModelId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="" disabled>
                {t('ai.modelIdPlaceholder')}
              </option>
              {catalog.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.id})
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="ai-model-name">{t('ai.displayName')}</Label>
          <Input
            id="ai-model-name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="ai-model-cost-in">{t('ai.costIn')}</Label>
            <Input
              id="ai-model-cost-in"
              type="number"
              step="0.0001"
              min={0}
              value={costIn}
              onChange={(e) => setCostIn(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ai-model-cost-out">{t('ai.costOut')}</Label>
            <Input
              id="ai-model-cost-out"
              type="number"
              step="0.0001"
              min={0}
              value={costOut}
              onChange={(e) => setCostOut(e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t('ai.enabled')}
        </label>
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
