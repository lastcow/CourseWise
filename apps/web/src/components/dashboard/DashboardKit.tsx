import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleAlert, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { AlertSeverity, AlertSummary } from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Consistent page heading for the role dashboards. */
export function DashboardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function StatGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>{children}</div>
  );
}

type StatTone = 'default' | 'alert' | 'danger';

/** A compact KPI card: icon chip + value + label. `tone` highlights non-zero
 *  attention metrics (open alerts, items to grade). */
export function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  tone?: StatTone;
}): JSX.Element {
  const active = typeof value === 'number' && value > 0;
  const valueColor =
    tone === 'danger' && active
      ? 'text-destructive'
      : tone === 'alert' && active
        ? 'text-amber-600'
        : '';
  const chip =
    tone === 'danger' && active
      ? 'bg-destructive/10 text-destructive'
      : tone === 'alert' && active
        ? 'bg-amber-100 text-amber-700'
        : 'bg-muted text-muted-foreground';
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', chip)}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className={cn('text-2xl font-semibold leading-none tabular-nums', valueColor)}>
            {value}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const SEVERITY: Record<
  AlertSeverity,
  { icon: LucideIcon; iconColor: string; accent: string }
> = {
  critical: { icon: CircleAlert, iconColor: 'text-destructive', accent: 'border-l-destructive' },
  warning: { icon: TriangleAlert, iconColor: 'text-amber-600', accent: 'border-l-amber-500' },
  info: { icon: Info, iconColor: 'text-sky-600', accent: 'border-l-sky-500' },
};

/** Severity-coded alert list with a colored left rail, an icon, the type, and
 *  optional timestamp. Rows link through when the alert carries a linkUrl. */
export function AlertList({
  alerts,
  showTime = false,
}: {
  alerts: AlertSummary[];
  showTime?: boolean;
}): JSX.Element {
  const { t, i18n } = useTranslation();
  return (
    <ul className="divide-y">
      {alerts.map((a) => {
        const s = SEVERITY[a.severity] ?? SEVERITY.info;
        const Icon = s.icon;
        const inner = (
          <div
            className={cn(
              'flex gap-3 border-l-2 px-4 py-3',
              s.accent,
              a.linkUrl && 'transition-colors hover:bg-muted/50',
            )}
          >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', s.iconColor)} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium">{a.title}</span>
                <Badge variant="outline" className="text-[10px] font-normal">
                  {t(`alerts.type.${a.type}`)}
                </Badge>
                {showTime ? (
                  <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString(i18n.language)}
                  </span>
                ) : null}
              </div>
              {a.body ? (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.body}</p>
              ) : null}
            </div>
          </div>
        );
        return (
          <li key={a.id}>
            {a.linkUrl ? (
              <Link to={a.linkUrl} className="block">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardError({ onRetry }: { onRetry: () => void }): JSX.Element {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <TriangleAlert className="h-6 w-6 text-amber-600" aria-hidden />
        <p className="text-sm text-muted-foreground">{t('common.error')}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      </CardContent>
    </Card>
  );
}

export function DashboardSkeleton({ stats = 4 }: { stats?: number }): JSX.Element {
  return (
    <div className="space-y-6">
      <StatGrid>
        {Array.from({ length: stats }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-md bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-10 animate-pulse rounded bg-muted" />
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              </div>
            </CardContent>
          </Card>
        ))}
      </StatGrid>
      <Card>
        <CardContent className="divide-y p-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <div className="h-3.5 flex-1 animate-pulse rounded bg-muted" />
              <div className="h-3.5 w-12 animate-pulse rounded bg-muted" />
              <div className="h-3.5 w-12 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
