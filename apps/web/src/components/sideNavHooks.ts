import { useCallback, useEffect, useState } from 'react';

export const SIDENAV_STORAGE_KEY = 'coursewise:sidenav:collapsed';
export const COURSE_SIDENAV_STORAGE_KEY = 'coursewise:course-sidenav:collapsed';

function readInitialCollapsed(key: string): boolean {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(key);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return window.innerWidth < 1024;
}

function usePersistedCollapsed(key: string): readonly [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsedState] = useState<boolean>(() => readInitialCollapsed(key));
  const setCollapsed = useCallback(
    (next: boolean): void => {
      setCollapsedState(next);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, String(next));
      }
    },
    [key],
  );
  return [collapsed, setCollapsed];
}

export function useSideNavCollapsed(): readonly [boolean, (next: boolean) => void] {
  return usePersistedCollapsed(SIDENAV_STORAGE_KEY);
}

export function useCourseSideNavCollapsed(): readonly [boolean, (next: boolean) => void] {
  return usePersistedCollapsed(COURSE_SIDENAV_STORAGE_KEY);
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
