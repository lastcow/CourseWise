import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { apiCall, clearStoredAuth, getStoredAuth, storeAuth, type StoredAuth } from './api';
import { AuthCtx, type AuthContextValue } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [auth, setAuth] = useState<StoredAuth | null>(() => getStoredAuth());
  const [isLoading, setIsLoading] = useState(false);

  const accessToken = auth?.accessToken;
  useEffect(() => {
    if (!accessToken) return;
    // Best-effort whoami to confirm the token is still valid; if it 401s, sign out.
    void apiCall<{ user: StoredAuth['user'] }>('/api/auth/me').catch(() => {
      clearStoredAuth();
      setAuth(null);
    });
  }, [accessToken]);

  const login = useCallback<AuthContextValue['login']>(async (email, password) => {
    setIsLoading(true);
    try {
      const data = await apiCall<StoredAuth & { expiresIn: number }>(
        '/api/auth/login',
        { method: 'POST', body: { email, password }, auth: false },
      );
      const stored: StoredAuth = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      };
      storeAuth(stored);
      setAuth(stored);
      return stored;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback<AuthContextValue['register']>(async (input) => {
    setIsLoading(true);
    try {
      const data = await apiCall<StoredAuth & { expiresIn: number }>(
        '/api/auth/register-student',
        { method: 'POST', body: input, auth: false },
      );
      const stored: StoredAuth = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      };
      storeAuth(stored);
      setAuth(stored);
      return stored;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    const current = getStoredAuth();
    if (current?.accessToken && current.refreshToken) {
      try {
        // Call the server first so it can revoke the refresh-token family.
        // The endpoint requires Bearer auth (COU-17); we use the current
        // access token, which is still in localStorage at this point.
        await apiCall<{ ok: boolean }>('/api/auth/logout', {
          method: 'POST',
          body: { refreshToken: current.refreshToken },
        });
      } catch {
        // ignore — proceed to clear local state even if the server rejects
        // (e.g. token already expired).
      }
    }
    clearStoredAuth();
    setAuth(null);
  }, []);

  const value = useMemo(() => ({ auth, login, register, logout, isLoading }), [auth, login, register, logout, isLoading]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
