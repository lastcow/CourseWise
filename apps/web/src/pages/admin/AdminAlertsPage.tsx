import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AlertStatus } from '@coursewise/shared';
import { Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { CourseSectionHeader, ListSkeleton } from '@/components/course/CourseSectionHeader';
import { useAdminDashboard, useResolveAlert } from '@/lib/queries';
import { pickI18nKey } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

const STATUS_TABS: AlertStatus[] = ['open', 'resolved', 'dismissed'];

export function AdminAlertsPage(): JSX.Element {
  const { t } = useTranslation();
  const dashboard = useAdminDashboard();
  const resolve = useResolveAlert();
  const toast = useToast();
  const [tab, setTab] = useState<AlertStatus>('open');

  // The admin dashboard returns latestAlerts (open). For resolved/dismissed,
  // fall back to the same query (only "open" shape is exposed at this aggregate;
  // resolved/dismissed alerts are surfaced via per-course views).
  const items = (dashboard.data?.latestAlerts ?? []).filter((a) => a.status === tab);

  async function onResolve(id: string, action: 'resolved' | 'dismissed') {
    try {
      await resolve.mutateAsync({ id, input: { status: action } });
      toast.push({
        title: action === 'resolved' ? t('alerts.resolved') : t('alerts.dismissed'),
        tone: 'success',
      });
    } catch (err) {
      toast.push({ title: t(pickI18nKey(err, 'errors.internal')), tone: 'error' });
    }
  }

  return (
    <div className="space-y-4">
      <CourseSectionHeader title={t('alerts.adminCenterTitle')} count={items.length} />
      <div>
        <div className="mb-3 flex gap-2">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTab(s)}
              className={`rounded-md border px-3 py-1 text-sm ${
                tab === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground'
              }`}
            >
              {t(`alerts.status.${s}`)}
            </button>
          ))}
        </div>
        {dashboard.isLoading ? (
          <ListSkeleton rows={4} />
        ) : items.length === 0 ? (
          <EmptyState icon={<Bell className="h-6 w-6" />} title={t('alerts.emptyTitle')} />
        ) : (
          <ul className="space-y-2">
            {items.map((a) => (
              <li key={a.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{t(`alerts.severity.${a.severity}`)}</Badge>
                  <Badge variant="outline">{t(`alerts.type.${a.type}`)}</Badge>
                  <span className="font-medium">{a.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString()}
                  </span>
                </div>
                {a.body ? (
                  <p className="mt-1 text-xs text-muted-foreground">{a.body}</p>
                ) : null}
                {a.status === 'open' ? (
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onResolve(a.id, 'dismissed')}
                    >
                      {t('alerts.dismissCta')}
                    </Button>
                    <Button size="sm" onClick={() => onResolve(a.id, 'resolved')}>
                      {t('alerts.resolveCta')}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
