import { useEffect, useRef } from 'react';
import type { EChartsCoreOption, ECharts } from 'echarts/core';
import { cn } from '@/lib/utils';

/**
 * Thin Apache ECharts wrapper. The library (core + the few modules we use)
 * loads through a dynamic import so Vite splits it out of the main bundle —
 * only routes that actually render a chart pay for it. Handles init,
 * option updates, container resizes, and disposal.
 */
export function EChart({
  option,
  className,
}: {
  option: EChartsCoreOption;
  className?: string;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const optionRef = useRef(option);
  optionRef.current = option;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let disposed = false;
    let observer: ResizeObserver | null = null;

    void (async () => {
      const [core, { LineChart }, components, { CanvasRenderer }] = await Promise.all([
        import('echarts/core'),
        import('echarts/charts'),
        import('echarts/components'),
        import('echarts/renderers'),
      ]);
      core.use([
        LineChart,
        components.GridComponent,
        components.TooltipComponent,
        components.LegendComponent,
        CanvasRenderer,
      ]);
      if (disposed) return;
      const chart = core.init(el);
      chartRef.current = chart;
      chart.setOption(optionRef.current);
      observer = new ResizeObserver(() => chart.resize());
      observer.observe(el);
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  // Push option changes into the already-initialised chart.
  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={containerRef} className={cn('h-72 w-full', className)} />;
}
