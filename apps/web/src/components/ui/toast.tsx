import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ToastTone = 'default' | 'success' | 'error' | 'info';
export interface ToastEntry {
  id: number;
  title: string;
  description?: string;
  tone?: ToastTone;
}

interface ToastCtx {
  push: (t: Omit<ToastEntry, 'id'>) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastEntry[]>([]);
  const push = useCallback<ToastCtx['push']>((t) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { ...t, id }]);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
        {items.map((t) => (
          <ToastItem key={t.id} entry={t} onDismiss={() => setItems((prev) => prev.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ entry, onDismiss }: { entry: ToastEntry; onDismiss: () => void }): JSX.Element {
  useEffect(() => {
    const handle = window.setTimeout(onDismiss, 4500);
    return () => window.clearTimeout(handle);
  }, [onDismiss]);
  const tone: Record<ToastTone, string> = {
    default: 'bg-background',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-950',
    error: 'bg-rose-50 border-rose-200 text-rose-950',
    info: 'bg-sky-50 border-sky-200 text-sky-950',
  };
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto rounded-md border p-3 text-sm shadow-md',
        tone[entry.tone ?? 'default'],
      )}
    >
      <div className="font-medium">{entry.title}</div>
      {entry.description ? <div className="mt-0.5 text-xs opacity-80">{entry.description}</div> : null}
    </div>
  );
}

export function useToast(): ToastCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be inside <ToastProvider>');
  return v;
}
