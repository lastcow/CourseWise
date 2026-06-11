import { Fragment, createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export interface ConfirmOptions {
  /** Short action question, e.g. "Delete this module?" */
  title: string;
  /** Consequence sentence shown under the title. */
  description?: string;
  /** The specific item being acted on, rendered in a highlighted card. */
  detail?: { name: string; facts?: Array<{ label: string; value: string }> };
  /** Label for the confirming button; defaults to t('common.confirm'). */
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * 'danger' (default) renders a destructive confirm button and focuses
   * Cancel; 'default' renders a primary button and focuses Confirm.
   */
  tone?: 'danger' | 'default';
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<ConfirmFn | null>(null);

interface PendingConfirm {
  opts: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setPending((prev) => {
        // A confirm() raised while another is open cancels the first.
        prev?.resolve(false);
        return { opts, resolve };
      });
    });
  }, []);

  function settle(ok: boolean): void {
    pending?.resolve(ok);
    setPending(null);
  }

  const opts = pending?.opts;
  const danger = (opts?.tone ?? 'danger') === 'danger';
  return (
    <Ctx.Provider value={useMemo(() => confirm, [confirm])}>
      {children}
      <Dialog
        open={pending !== null}
        onClose={() => settle(false)}
        title={opts?.title}
        className="max-w-md"
      >
        {opts ? (
          <div className="space-y-4">
            {opts.description ? (
              <p className="text-sm text-muted-foreground">{opts.description}</p>
            ) : null}
            {opts.detail ? (
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="break-words text-sm font-semibold">{opts.detail.name}</div>
                {opts.detail.facts?.length ? (
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {opts.detail.facts.map((f) => (
                      <Fragment key={f.label}>
                        <dt>{f.label}</dt>
                        <dd className="text-foreground">{f.value}</dd>
                      </Fragment>
                    ))}
                  </dl>
                ) : null}
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => settle(false)} autoFocus={danger}>
                {opts.cancelLabel ?? t('common.cancel')}
              </Button>
              <Button
                variant={danger ? 'destructive' : 'default'}
                onClick={() => settle(true)}
                autoFocus={!danger}
              >
                {opts.confirmLabel ?? t('common.confirm')}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </Ctx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const v = useContext(Ctx);
  if (!v) throw new Error('useConfirm must be inside <ConfirmProvider>');
  return v;
}
