import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardEdit } from 'lucide-react';
import type {
  RecordCorrectionRequestSummary,
  RecordCorrectionStatus,
} from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Label, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ApiClientError } from '@/lib/api';
import {
  useCourseCorrectionRequests,
  useResolveCorrectionRequest,
} from '@/lib/queries';

function statusVariant(
  s: RecordCorrectionStatus,
): 'secondary' | 'success' | 'destructive' | 'info' {
  switch (s) {
    case 'open':
      return 'info';
    case 'accepted':
      return 'success';
    case 'declined':
      return 'destructive';
    case 'withdrawn':
    default:
      return 'secondary';
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const STATUS_OPTIONS: Array<RecordCorrectionStatus | ''> = [
  '',
  'open',
  'accepted',
  'declined',
  'withdrawn',
];

export function TeacherCorrectionRequestsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState<RecordCorrectionStatus | ''>('open');
  const q = useCourseCorrectionRequests(id || null, statusFilter || undefined);
  const resolveMutation = useResolveCorrectionRequest(id);

  const items = q.data ?? [];
  const [resolveTarget, setResolveTarget] =
    useState<RecordCorrectionRequestSummary | null>(null);
  const [resolveAction, setResolveAction] = useState<'accepted' | 'declined'>('accepted');
  const [resolveNote, setResolveNote] = useState('');

  const startResolve = (item: RecordCorrectionRequestSummary, action: 'accepted' | 'declined') => {
    setResolveTarget(item);
    setResolveAction(action);
    setResolveNote('');
  };

  const submitResolve = async () => {
    if (!resolveTarget) return;
    try {
      await resolveMutation.mutateAsync({
        id: resolveTarget.id,
        input: {
          status: resolveAction,
          resolutionNote: resolveNote.trim() || null,
        },
      });
      toast.push({
        title:
          resolveAction === 'accepted'
            ? t('correctionRequests.acceptedToast')
            : t('correctionRequests.declinedToast'),
        tone: 'success',
      });
      setResolveTarget(null);
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{t('correctionRequests.staffTitle')}</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t('correctionRequests.staffDescription')}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cr-filter-status">{t('correctionRequests.filterStatus')}</Label>
          <select
            id="cr-filter-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RecordCorrectionStatus | '')}
            className="flex h-10 w-44 rounded-md border border-input bg-background px-3 text-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s || 'all'} value={s}>
                {s ? t(`correctionRequests.statusValue.${s}`) : t('correctionRequests.allStatuses')}
              </option>
            ))}
          </select>
        </div>
      </header>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ClipboardEdit className="h-6 w-6" />}
          title={t('correctionRequests.staffEmptyTitle')}
          description={t('correctionRequests.staffEmptyBody')}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.id} className="space-y-2 rounded border bg-background p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(it.status)}>
                    {t(`correctionRequests.statusValue.${it.status}`)}
                  </Badge>
                  <span className="font-medium">
                    {t(`correctionRequests.targetTypeOption.${it.targetType}`)}
                  </span>
                  <span className="text-muted-foreground">— {it.studentName}</span>
                </div>
                {it.status === 'open' ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startResolve(it, 'declined')}
                    >
                      {t('correctionRequests.decline')}
                    </Button>
                    <Button size="sm" onClick={() => startResolve(it, 'accepted')}>
                      {t('correctionRequests.accept')}
                    </Button>
                  </div>
                ) : null}
              </div>
              {it.targetId ? (
                <div className="text-xs text-muted-foreground">
                  {t('correctionRequests.targetIdRow', { id: it.targetId })}
                </div>
              ) : null}
              <p className="whitespace-pre-wrap text-foreground">{it.description}</p>
              {it.resolutionNote ? (
                <div className="rounded border bg-muted/30 p-2 text-xs">
                  <div className="font-medium text-foreground">
                    {t('correctionRequests.resolutionFrom', {
                      name: it.resolvedByName ?? t('correctionRequests.unknownResolver'),
                    })}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {it.resolutionNote}
                  </p>
                </div>
              ) : null}
              <div className="text-xs text-muted-foreground">
                {t('correctionRequests.createdAt', { when: formatDate(it.createdAt) })}
                {it.resolvedAt
                  ? ` · ${t('correctionRequests.resolvedAt', { when: formatDate(it.resolvedAt) })}`
                  : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={resolveTarget !== null}
        onClose={() => setResolveTarget(null)}
        title={
          resolveAction === 'accepted'
            ? t('correctionRequests.acceptTitle')
            : t('correctionRequests.declineTitle')
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {resolveAction === 'accepted'
              ? t('correctionRequests.acceptBody')
              : t('correctionRequests.declineBody')}
          </p>
          <div className="space-y-1">
            <Label htmlFor="cr-resolution-note">{t('correctionRequests.resolutionNote')}</Label>
            <Textarea
              id="cr-resolution-note"
              rows={4}
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              maxLength={4000}
              placeholder={t('correctionRequests.resolutionNotePlaceholder')}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setResolveTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void submitResolve()}
              disabled={resolveMutation.isPending}
            >
              {resolveMutation.isPending ? t('common.loading') : t('common.submit')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
