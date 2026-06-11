import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, BadgeCheck, Bot, Coins, Hash, MessageSquareText, User } from 'lucide-react';
import type { EChartsCoreOption } from 'echarts/core';
import { useQuery } from '@tanstack/react-query';
import type { AiUsageResponse } from '@coursewise/shared';
import { apiCall } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EChart } from '@/components/charts/EChart';
import { StatCard, StatGrid } from '@/components/dashboard/DashboardKit';
import { EmptyState } from '@/components/ui/empty';
import { cn } from '@/lib/utils';

type Range = 7 | 30 | 90;
const RANGES: Range[] = [7, 30, 90];
type Tab = 'profile' | 'aiUsage';

function useAiUsage(days: Range) {
  return useQuery({
    queryKey: ['me', 'ai-usage', days],
    queryFn: () => apiCall<AiUsageResponse>(`/api/me/ai-usage?days=${days}`),
    placeholderData: (prev) => prev,
  });
}

export function ProfilePage(): JSX.Element {
  const { t } = useTranslation();
  const { auth } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');
  const user = auth?.user;
  if (!user) return <p>{t('common.loading')}</p>;

  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
          {initials}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <Badge variant="secondary" className="ml-auto capitalize">
          {t(`profile.role.${user.role}`)}
        </Badge>
      </header>

      <div className="flex items-center gap-0.5 self-start rounded-md border bg-background p-0.5">
        {(['profile', 'aiUsage'] as Tab[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              'rounded px-3 py-1.5 text-sm font-medium transition-colors',
              tab === k
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {t(k === 'profile' ? 'profile.tabProfile' : 'profile.tabAiUsage')}
          </button>
        ))}
      </div>

      {tab === 'profile' ? <ProfileTab /> : <AiUsageTab />}
    </div>
  );
}

function ProfileTab(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { auth } = useAuth();
  const user = auth?.user;
  if (!user) return <></>;
  const rows: Array<{ icon: typeof User; label: string; value: string }> = [
    { icon: User, label: t('profile.fieldName'), value: user.name },
    { icon: Hash, label: t('profile.fieldEmail'), value: user.email },
    { icon: BadgeCheck, label: t('profile.fieldRole'), value: t(`profile.role.${user.role}`) },
    {
      icon: Activity,
      label: t('profile.fieldStatus'),
      value: user.status,
    },
    {
      icon: MessageSquareText,
      label: t('profile.fieldLanguage'),
      value: i18n.language,
    },
  ];
  return (
    <Card>
      <div className="border-b bg-muted/30 px-4 py-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {t('profile.accountTitle')}
        </span>
      </div>
      <CardContent className="pt-4">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start gap-3">
              <row.icon className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="break-words text-sm font-medium">{row.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function AiUsageTab(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState<Range>(30);
  const usage = useAiUsage(range);
  const data = usage.data;

  const option = useMemo<EChartsCoreOption | null>(() => {
    if (!data) return null;
    const dates = data.points.map((p) =>
      new Date(`${p.date}T00:00:00Z`).toLocaleDateString(i18n.language, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
    );
    return {
      color: ['#6366f1', '#10b981'],
      grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
      legend: {
        top: 4,
        left: 4,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 16,
        textStyle: { color: '#64748b', fontSize: 11 },
      },
      tooltip: {
        trigger: 'axis',
        borderColor: 'rgba(148,163,184,0.3)',
        textStyle: { fontSize: 12 },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#94a3b8', fontSize: 11, hideOverlap: true },
      },
      yAxis: [
        {
          type: 'value',
          name: t('profile.chartNeurons'),
          nameTextStyle: { color: '#94a3b8', fontSize: 10 },
          splitLine: { lineStyle: { color: 'rgba(148,163,184,0.18)' } },
          axisLabel: { color: '#94a3b8', fontSize: 11 },
        },
        {
          type: 'value',
          name: t('profile.chartRequests'),
          nameTextStyle: { color: '#94a3b8', fontSize: 10 },
          minInterval: 1,
          splitLine: { show: false },
          axisLabel: { color: '#94a3b8', fontSize: 11 },
        },
      ],
      series: [
        {
          name: t('profile.chartNeurons'),
          type: 'line',
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.1 },
          data: data.points.map((p) => p.neurons),
        },
        {
          name: t('profile.chartRequests'),
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, type: 'dashed' },
          data: data.points.map((p) => p.requests),
        },
      ],
    };
  }, [data, i18n.language, t]);

  const fmt = (n: number): string => n.toLocaleString(i18n.language);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="info">{t('aiTutor.freeBeta')}</Badge>
        <p className="text-xs text-muted-foreground">{t('profile.usageHint')}</p>
      </div>

      <StatGrid>
        <StatCard icon={Coins} label={t('profile.statNeurons')} value={fmt(data?.totals.neurons ?? 0)} />
        <StatCard icon={Bot} label={t('profile.statRequests')} value={data?.totals.requests ?? 0} />
        <StatCard
          icon={Activity}
          label={t('profile.statTokensIn')}
          value={fmt(data?.totals.promptTokens ?? 0)}
        />
        <StatCard
          icon={Activity}
          label={t('profile.statTokensOut')}
          value={fmt(data?.totals.completionTokens ?? 0)}
        />
      </StatGrid>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <Activity className="h-3.5 w-3.5" aria-hidden />
            {t('profile.chartTitle')}
          </span>
          <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => setRange(r)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  range === r
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {t(`dashboard.range${r}d`)}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4">
          {usage.isLoading || !option ? (
            usage.isError ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3">
                <p className="text-sm text-muted-foreground">{t('common.error')}</p>
                <Button variant="outline" size="sm" onClick={() => void usage.refetch()}>
                  {t('common.retry')}
                </Button>
              </div>
            ) : (
              <div className="h-64 w-full animate-pulse rounded-md bg-muted/50" />
            )
          ) : (
            <EChart option={option} className="h-64" />
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b bg-muted/30 px-4 py-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t('profile.recentTitle')}
          </span>
        </div>
        {data && data.recent.length === 0 ? (
          <CardContent className="pt-4">
            <EmptyState title={t('profile.recentEmpty')} />
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t('profile.colWhen')}</th>
                  <th className="px-4 py-2 font-medium">{t('profile.colContext')}</th>
                  <th className="px-4 py-2 font-medium">{t('profile.colModel')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('profile.colTokens')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('profile.colNeurons')}</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recent ?? []).map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString(i18n.language, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="max-w-[18rem] px-4 py-2">
                      <div className="truncate font-medium">
                        {e.contextTitle ?? t(`profile.feature.${e.feature}`)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t(`profile.feature.${e.feature}`)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                      {e.model.split('/').pop()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                      {e.promptTokens ?? '—'} / {e.completionTokens ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums">
                      {e.neurons !== null ? fmt(e.neurons) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
