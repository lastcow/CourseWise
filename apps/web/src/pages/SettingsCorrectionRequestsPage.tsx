import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardEdit, Plus } from 'lucide-react';
import {
  RECORD_CORRECTION_TARGETS,
  type CreateRecordCorrectionRequestInput,
  type RecordCorrectionRequestSummary,
  type RecordCorrectionStatus,
  type RecordCorrectionTarget,
} from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Input, Label, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import {
  useCoursesList,
  useCreateCorrectionRequest,
  useMyCorrectionRequests,
  useWithdrawCorrectionRequest,
} from '@/lib/queries';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function statusVariant(
  s: RecordCorrectionStatus,
): 'secondary' | 'success' | 'destructive' | 'warning' | 'info' {
  switch (s) {
    case 'open':
      return 'info';
    case 'accepted':
      return 'success';
    case 'declined':
      return 'destructive';
    case 'withdrawn':
      return 'secondary';
    default:
      return 'warning';
  }
}

export function SettingsCorrectionRequestsPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const listQ = useMyCorrectionRequests();
  const createMutation = useCreateCorrectionRequest();
  const withdrawMutation = useWithdrawCorrectionRequest();
  const coursesQ = useCoursesList();

  const courses = useMemo(() => coursesQ.data ?? [], [coursesQ.data]);
  const items = listQ.data ?? [];

  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState<string>('');
  const [targetType, setTargetType] = useState<RecordCorrectionTarget>('final_grade');
  const [targetId, setTargetId] = useState('');
  const [description, setDescription] = useState('');

  const reset = () => {
    setCourseId('');
    setTargetType('final_grade');
    setTargetId('');
    setDescription('');
  };
  const close = () => {
    reset();
    setOpen(false);
  };

  const onSubmit: React.FormEventHandler = async (e) => {
    e.preventDefault();
    if (description.trim().length < 10) {
      toast.push({ title: t('correctionRequests.descriptionTooShort'), tone: 'error' });
      return;
    }
    const input: CreateRecordCorrectionRequestInput = {
      courseId: courseId || null,
      targetType,
      targetId: targetId.trim() || null,
      description: description.trim(),
    };
    try {
      await createMutation.mutateAsync(input);
      toast.push({ title: t('correctionRequests.createdToast'), tone: 'success' });
      close();
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('correctionRequests.title')}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t('correctionRequests.description')}
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('correctionRequests.newCta')}
        </Button>
      </header>

      {listQ.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ClipboardEdit className="h-6 w-6" />}
          title={t('correctionRequests.emptyTitle')}
          description={t('correctionRequests.emptyBody')}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <CorrectionRequestRow
              key={it.id}
              item={it}
              onWithdraw={async (id) => {
                try {
                  await withdrawMutation.mutateAsync(id);
                  toast.push({ title: t('correctionRequests.withdrewToast'), tone: 'success' });
                } catch {
                  toast.push({ title: t('common.error'), tone: 'error' });
                }
              }}
            />
          ))}
        </ul>
      )}

      <Dialog open={open} onClose={close} title={t('correctionRequests.newCta')}>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1">
            <Label htmlFor="cr-course">{t('correctionRequests.courseLabel')}</Label>
            <select
              id="cr-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t('correctionRequests.noCourse')}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cr-target-type">{t('correctionRequests.targetType')}</Label>
            <select
              id="cr-target-type"
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as RecordCorrectionTarget)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {RECORD_CORRECTION_TARGETS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`correctionRequests.targetTypeOption.${kind}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cr-target-id">{t('correctionRequests.targetIdLabel')}</Label>
            <Input
              id="cr-target-id"
              placeholder={t('correctionRequests.targetIdPlaceholder')}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cr-description">{t('correctionRequests.descriptionLabel')}</Label>
            <Textarea
              id="cr-description"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
              required
              placeholder={t('correctionRequests.descriptionPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">
              {t('correctionRequests.descriptionHint')}
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? t('common.loading') : t('common.submit')}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function CorrectionRequestRow({
  item,
  onWithdraw,
}: {
  item: RecordCorrectionRequestSummary;
  onWithdraw: (id: string) => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <li className="space-y-2 rounded border bg-background p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(item.status)}>
            {t(`correctionRequests.statusValue.${item.status}`)}
          </Badge>
          <span className="font-medium">
            {t(`correctionRequests.targetTypeOption.${item.targetType}`)}
          </span>
          {item.courseCode ? (
            <span className="text-xs text-muted-foreground">· {item.courseCode}</span>
          ) : null}
        </div>
        {item.status === 'open' ? (
          <Button size="sm" variant="outline" onClick={() => void onWithdraw(item.id)}>
            {t('correctionRequests.withdraw')}
          </Button>
        ) : null}
      </div>
      <p className="whitespace-pre-wrap text-foreground">{item.description}</p>
      {item.resolutionNote ? (
        <div className="rounded border bg-muted/30 p-2 text-xs">
          <div className="font-medium text-foreground">
            {t('correctionRequests.resolutionFrom', {
              name: item.resolvedByName ?? t('correctionRequests.unknownResolver'),
            })}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.resolutionNote}</p>
        </div>
      ) : null}
      <div className="text-xs text-muted-foreground">
        {t('correctionRequests.createdAt', { when: formatDate(item.createdAt) })}
        {item.resolvedAt
          ? ` · ${t('correctionRequests.resolvedAt', { when: formatDate(item.resolvedAt) })}`
          : null}
      </div>
    </li>
  );
}
