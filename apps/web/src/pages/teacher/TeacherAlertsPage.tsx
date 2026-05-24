import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleCheck, Mail } from 'lucide-react';
import { MessageComposeDialog } from '@/components/messaging/MessageComposeDialog';
import type { AlertStatus, AlertWithStudent } from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  useCourseAlerts,
  useGenerateAlerts,
  useResolveAlert,
} from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';

const STATUS_TABS: AlertStatus[] = ['open', 'resolved', 'dismissed'];

function severityVariant(severity: string) {
  if (severity === 'critical') return 'destructive' as const;
  if (severity === 'warning') return 'secondary' as const;
  return 'outline' as const;
}

export function TeacherAlertsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const cid = courseId ?? '';
  const [status, setStatus] = useState<AlertStatus>('open');
  const alerts = useCourseAlerts(cid || null, status);
  const generate = useGenerateAlerts(cid);
  const resolve = useResolveAlert();
  const toast = useToast();

  const [resolving, setResolving] = useState<AlertWithStudent | null>(null);
  const [note, setNote] = useState('');
  const [messageTarget, setMessageTarget] = useState<{
    id: string;
    name: string;
    subject: string;
    context: string;
  } | null>(null);

  async function onGenerate() {
    try {
      const res = await generate.mutateAsync();
      toast.push({
        title: t('alerts.generated', { count: res.generated }),
        tone: 'success',
      });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  async function onResolve(action: 'resolved' | 'dismissed') {
    if (!resolving) return;
    try {
      await resolve.mutateAsync({
        id: resolving.id,
        input: { status: action, resolutionNote: note.trim() || null },
      });
      setResolving(null);
      setNote('');
      toast.push({
        title: action === 'resolved' ? t('alerts.resolved') : t('alerts.dismissed'),
        tone: 'success',
      });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('alerts.title')}</CardTitle>
        <Button onClick={onGenerate} disabled={generate.isPending}>
          {t('alerts.runRules')}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex gap-2">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-md border px-3 py-1 text-sm ${
                status === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground'
              }`}
            >
              {t(`alerts.status.${s}`)}
            </button>
          ))}
        </div>
        {alerts.isLoading ? (
          <p>{t('common.loading')}</p>
        ) : !alerts.data || alerts.data.length === 0 ? (
          <EmptyState
            title={t('alerts.emptyTitle')}
            description={t('alerts.emptyDescription')}
          />
        ) : (
          <ul className="space-y-2">
            {alerts.data.map((a) => (
              <li key={a.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={severityVariant(a.severity)}>{t(`alerts.severity.${a.severity}`)}</Badge>
                  <Badge variant="outline">{t(`alerts.type.${a.type}`)}</Badge>
                  <span className="font-medium">{a.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.student?.name ?? '—'} · {new Date(a.createdAt).toLocaleString()}
                  </span>
                </div>
                {a.body ? (
                  <p className="mt-2 text-sm text-muted-foreground">{a.body}</p>
                ) : null}
                <div className="mt-2 flex justify-end gap-2">
                  {a.student?.id ? (
                    <ActionIconButton
                      size="sm"
                      icon={Mail}
                      label={t('messages.composeCta')}
                      color="sky"
                      onClick={() =>
                        setMessageTarget({
                          id: a.student!.id,
                          name: a.student!.name,
                          subject: t('messages.aboutAlert', { title: a.title }),
                          context: t('messages.contextAlert', { title: a.title }),
                        })
                      }
                    />
                  ) : null}
                  {a.status === 'open' ? (
                    <ActionIconButton
                      size="sm"
                      icon={CircleCheck}
                      label={t('alerts.resolveCta')}
                      color="emerald"
                      onClick={() => {
                        setResolving(a);
                        setNote('');
                      }}
                    />
                  ) : null}
                </div>
                {a.status !== 'open' && a.resolutionNote ? (
                  <div className="mt-2 text-xs text-muted-foreground">{a.resolutionNote}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <Dialog
        open={!!resolving}
        onClose={() => setResolving(null)}
        title={t('alerts.resolveTitle')}
      >
        {resolving ? (
          <div className="space-y-3">
            <p className="text-sm">{resolving.title}</p>
            <label className="block space-y-1 text-sm font-medium">
              <span>{t('alerts.resolveNote')}</span>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onResolve('dismissed')}>
                {t('alerts.dismissCta')}
              </Button>
              <Button onClick={() => onResolve('resolved')} disabled={resolve.isPending}>
                {t('alerts.resolveCta')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
      {messageTarget ? (
        <MessageComposeDialog
          open
          onClose={() => setMessageTarget(null)}
          courseId={cid}
          recipientId={messageTarget.id}
          recipientName={messageTarget.name}
          initialSubject={messageTarget.subject}
          contextLine={messageTarget.context}
        />
      ) : null}
    </Card>
  );
}
