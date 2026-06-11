import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, ArrowUpFromLine, Bot, Coins, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EChartsCoreOption } from 'echarts/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EChart } from '@/components/charts/EChart';
import { useAdminAiUsage } from '@/lib/queries';
import { cn } from '@/lib/utils';

type Range = 7 | 30 | 90 | 'all';
const RANGES: Range[] = [7, 30, 90, 'all'];

const SERIES = [
  { key: 'neurons', labelKey: 'dashboard.aiUsageNeurons', color: '#6366f1', yAxisIndex: 0 },
  { key: 'promptTokens', labelKey: 'dashboard.aiUsageTokensIn', color: '#0ea5e9', yAxisIndex: 0 },
  {
    key: 'completionTokens',
    labelKey: 'dashboard.aiUsageTokensOut',
    color: '#f59e0b',
    yAxisIndex: 0,
  },
  { key: 'requests', labelKey: 'dashboard.aiUsageRequests', color: '#10b981', yAxisIndex: 1 },
] as const;

const TILE_TONES = {
  indigo: 'bg-indigo-50 text-indigo-700',
  sky: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-50 text-amber-700',
  emerald: 'bg-emerald-50 text-emerald-700',
} as const;

/**
 * One totals tile under the chart. The icon chip color matches the series
 * line color, so the tiles double as a legend for the numbers.
 */
function UsageTile({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  tone: keyof typeof TILE_TONES;
  label: string;
  value: string;
  sub?: string;
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
          TILE_TONES[tone],
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="truncate text-lg font-semibold leading-tight tabular-nums">{value}</div>
        <div className="flex items-baseline gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">{label}</span>
          {sub ? (
            <span className="shrink-0 rounded bg-muted px-1 py-px tabular-nums">{sub}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * System-wide AI usage over time (neurons / tokens on the left axis,
 * request count on the right). Range picker covers 7/30/90 days plus the
 * full recorded history.
 */
export function AdminAiUsageCard(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState<Range>(30);
  const usage = useAdminAiUsage(range);
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
      color: SERIES.map((s) => s.color),
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
        valueFormatter: (v: unknown) =>
          typeof v === 'number' ? v.toLocaleString(i18n.language) : String(v ?? 0),
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
          name: t('dashboard.aiUsageLeftAxis'),
          nameTextStyle: { color: '#94a3b8', fontSize: 10 },
          splitLine: { lineStyle: { color: 'rgba(148,163,184,0.18)' } },
          axisLabel: { color: '#94a3b8', fontSize: 11 },
        },
        {
          type: 'value',
          name: t('dashboard.aiUsageRequests'),
          nameTextStyle: { color: '#94a3b8', fontSize: 10 },
          minInterval: 1,
          splitLine: { show: false },
          axisLabel: { color: '#94a3b8', fontSize: 11 },
        },
      ],
      series: SERIES.map((s) => ({
        name: t(s.labelKey),
        type: 'line',
        yAxisIndex: s.yAxisIndex,
        smooth: true,
        showSymbol: false,
        emphasis: { focus: 'series' },
        lineStyle: { width: 2, type: s.key === 'requests' ? 'dashed' : 'solid' },
        areaStyle: s.key === 'neurons' ? { opacity: 0.08 } : undefined,
        data: data.points.map((p) => p[s.key]),
      })),
    };
  }, [data, i18n.language, t]);

  const fmt = (n: number): string => n.toLocaleString(i18n.language);

  // Derived sub-metrics for the tiles. Neurons bill at $0.011 per 1,000;
  // per-day uses the window length; per-request averages guard against /0.
  const totals = data?.totals ?? { neurons: 0, requests: 0, promptTokens: 0, completionTokens: 0 };
  const estCost = ((totals.neurons / 1_000) * 0.011).toLocaleString(i18n.language, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const perDay = (totals.requests / Math.max(1, data?.days ?? 1)).toLocaleString(i18n.language, {
    maximumFractionDigits: 1,
  });
  const avgIn = totals.requests > 0 ? fmt(Math.round(totals.promptTokens / totals.requests)) : '0';
  const avgOut =
    totals.requests > 0 ? fmt(Math.round(totals.completionTokens / totals.requests)) : '0';

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {t('dashboard.aiUsageTitle')}
          <Badge variant="info">{t('aiTutor.freeBeta')}</Badge>
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
              {r === 'all' ? t('dashboard.rangeAll') : t(`dashboard.range${r}d`)}
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
          <>
            <EChart option={option} className="h-64" />
            <div className="mt-4 grid grid-cols-1 gap-2 border-t pt-4 sm:grid-cols-2 xl:grid-cols-4">
              <UsageTile
                icon={Coins}
                tone="indigo"
                label={t('dashboard.aiUsageNeurons')}
                value={fmt(totals.neurons)}
                sub={t('dashboard.aiUsageEstCost', { amount: estCost })}
              />
              <UsageTile
                icon={Bot}
                tone="emerald"
                label={t('dashboard.aiUsageRequests')}
                value={fmt(totals.requests)}
                sub={t('dashboard.aiUsagePerDay', { n: perDay })}
              />
              <UsageTile
                icon={ArrowDownToLine}
                tone="sky"
                label={t('dashboard.aiUsageTokensIn')}
                value={fmt(totals.promptTokens)}
                sub={t('dashboard.aiUsagePerRequest', { n: avgIn })}
              />
              <UsageTile
                icon={ArrowUpFromLine}
                tone="amber"
                label={t('dashboard.aiUsageTokensOut')}
                value={fmt(totals.completionTokens)}
                sub={t('dashboard.aiUsagePerRequest', { n: avgOut })}
              />
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
