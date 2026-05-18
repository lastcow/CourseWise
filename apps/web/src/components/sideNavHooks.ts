import { useCallback, useEffect, useState } from 'react';

export const SIDENAV_STORAGE_KEY = 'coursewise:sidenav:collapsed';

function readInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(SIDENAV_STORAGE_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return window.innerWidth < 1024;
}

export function useSideNavCollapsed(): readonly [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsedState] = useState<boolean>(readInitialCollapsed);
  const setCollapsed = useCallback((next: boolean): void => {
    setCollapsedState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SIDENAV_STORAGE_KEY, String(next));
    }
  }, []);
  return [collapsed, setCollapsed];
}

export function useEscapeToClose(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, onClose]);
}
