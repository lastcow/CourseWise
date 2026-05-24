import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { cn } from '@/lib/utils';

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  className?: string;
};

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className,
}: PaginationProps): JSX.Element {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);
  const atFirst = safePage <= 1;
  const atLast = safePage >= totalPages;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-3 py-2 text-xs',
        className,
      )}
    >
      <div className="text-muted-foreground">
        {t('common.pageRange', { from, to, total })}
      </div>
      <div className="flex items-center gap-3">
        {onPageSizeChange ? (
          <label className="flex items-center gap-1.5 text-muted-foreground">
            <span>{t('common.pageSizeLabel')}</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number.parseInt(e.target.value, 10))}
              className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <span className="text-muted-foreground">
          {t('common.pageOfTotal', { page: safePage, total: totalPages })}
        </span>
        <div className="flex items-center gap-1">
          <ActionIconButton
            icon={ChevronFirst}
            label={t('common.pageFirst')}
            color="sky"
            size="sm"
            onClick={() => onPageChange(1)}
            disabled={atFirst}
          />
          <ActionIconButton
            icon={ChevronLeft}
            label={t('common.pagePrev')}
            color="sky"
            size="sm"
            onClick={() => onPageChange(safePage - 1)}
            disabled={atFirst}
          />
          <ActionIconButton
            icon={ChevronRight}
            label={t('common.pageNext')}
            color="sky"
            size="sm"
            onClick={() => onPageChange(safePage + 1)}
            disabled={atLast}
          />
          <ActionIconButton
            icon={ChevronLast}
            label={t('common.pageLast')}
            color="sky"
            size="sm"
            onClick={() => onPageChange(totalPages)}
            disabled={atLast}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Slice an in-memory list to a page window and return the slice plus
 * normalized indices. Caller is responsible for owning `page` / `pageSize`
 * state and resetting `page` to 1 when the underlying list mutates.
 */
export function usePageSlice<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
): {
  slice: T[];
  totalPages: number;
  safePage: number;
} {
  return useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    return {
      slice: rows.slice(start, start + pageSize),
      totalPages,
      safePage,
    };
  }, [rows, page, pageSize]);
}
