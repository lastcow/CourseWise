import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity } from 'lucide-react';
import type { EChartsCoreOption } from 'echarts/core';
import type { AdminActivityPoint } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EChart } from '@/components/charts/EChart';
import { useAdminActivity } from '@/lib/queries';
import { cn } from '@/lib/utils';

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

// Series definitions: gradebook/grading accent palette (tailwind 500s) so the
// chart speaks the same color language as the rest of the app.
const SERIES: Array<{
  key: keyof Omit<AdminActivityPoint, 'date'>;
  labelKey: string;
  color: string;
}> = [
  { key: 'submissions', labelKey: 'dashboard.seriesSubmissions', color: '#0ea5e9' },
  { key: 'quizAttempts', labelKey: 'dashboard.seriesQuizAttempts', color: '#8b5cf6' },
  { key: 'enrollments', labelKey: 'dashboard.seriesEnrollments', color: '#10b981' },
  { key: 'posts', labelKey: 'dashboard.seriesPosts', color: '#f59e0b' },
  { key: 'newUsers', labelKey: 'dashboard.seriesNewUsers', color: '#64748b' },
];

export function AdminActivityCard(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState<Range>(30);
  const activity = useAdminActivity(range);

  const option = useMemo<EChartsCoreOption | null>(() => {
    const points = activity.data?.points;
    if (!points) return null;
    const dates = points.map((p) =>
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
        valueFormatter: (v: unknown) => String(v ?? 0),
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#94a3b8', fontSize: 11, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.18)' } },
        axisLabel: { color: '#94a3b8', fontSize: 11 },
      },
      series: SERIES.map((s) => ({
        name: t(s.labelKey),
        type: 'line',
        smooth: true,
        showSymbol: false,
        emphasis: { focus: 'series' },
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.07 },
        data: points.map((p) => p[s.key]),
      })),
    };
  }, [activity.data, i18n.language, t]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <Activity className="h-3.5 w-3.5" aria-hidden />
          {t('dashboard.activityTitle')}
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
        {activity.isLoading || !option ? (
          activity.isError ? (
            <div className="flex h-72 flex-col items-center justify-center gap-3">
              <p className="text-sm text-muted-foreground">{t('common.error')}</p>
              <Button variant="outline" size="sm" onClick={() => void activity.refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          ) : (
            <div className="h-72 w-full animate-pulse rounded-md bg-muted/50" />
          )
        ) : (
          <EChart option={option} className="h-72" />
        )}
      </div>
    </Card>
  );
}
