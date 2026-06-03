import type { ApiError, ApiResponse } from '@coursewise/shared';

const TOKEN_KEY = 'coursewise.accessToken';
const REFRESH_KEY = 'coursewise.refreshToken';
const USER_KEY = 'coursewise.user';

export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'teacher' | 'student';
    status: string;
    preferredLanguage: string;
  };
}

export function getStoredAuth(): StoredAuth | null {
  try {
    const accessToken = localStorage.getItem(TOKEN_KEY);
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    const userRaw = localStorage.getItem(USER_KEY);
    if (!accessToken || !refreshToken || !userRaw) return null;
    return { accessToken, refreshToken, user: JSON.parse(userRaw) as StoredAuth['user'] };
  } catch {
    return null;
  }
}

export function storeAuth(auth: StoredAuth): void {
  localStorage.setItem(TOKEN_KEY, auth.accessToken);
  localStorage.setItem(REFRESH_KEY, auth.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
}

export function clearStoredAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

function getApiBase(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_API_BASE_URL ?? '';
}

export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly error: ApiError) {
    super(error.message);
  }
}

export interface ApiCallOpts {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** If true, attaches the stored access token. Defaults to true. */
  auth?: boolean;
  /** Skip JSON body parsing — used for blob/binary endpoints. */
  raw?: boolean;
}

// Single-flight token refresh. Access tokens expire (12h); when an
// authenticated request comes back 401 we exchange the refresh token for a new
// pair and retry once. Refresh tokens are single-use (rotated + reuse-detected
// server-side), so concurrent 401s must share ONE refresh — otherwise the
// second refresh would look like reuse and revoke the whole session.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const stored = getStoredAuth();
  if (!stored?.refreshToken) return false;
  try {
    const res = await fetch(`${getApiBase()}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: stored.refreshToken }),
    });
    if (!res.ok) {
      clearStoredAuth();
      return false;
    }
    const payload = (await res.json()) as ApiResponse<{
      accessToken: string;
      refreshToken: string;
    }>;
    if (!payload || payload.success === false) {
      clearStoredAuth();
      return false;
    }
    storeAuth({
      accessToken: payload.data.accessToken,
      refreshToken: payload.data.refreshToken,
      user: stored.user,
    });
    return true;
  } catch {
    // Network error — leave tokens in place so a later retry can recover.
    return false;
  }
}

function ensureRefreshed(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiCall<T>(
  path: string,
  opts: ApiCallOpts = {},
  retryOnAuthFailure = true,
): Promise<T> {
  const url = `${getApiBase()}${path}`;
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }
  if (opts.auth !== false) {
    const stored = getStoredAuth();
    if (stored?.accessToken) {
      headers['authorization'] = `Bearer ${stored.accessToken}`;
    }
  }
  const init: RequestInit = {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
  };
  if (opts.body !== undefined) {
    init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }
  const res = await fetch(url, init);
  // Access token likely expired — refresh once (shared across concurrent calls)
  // and retry the original request with the new token.
  if (res.status === 401 && opts.auth !== false && retryOnAuthFailure) {
    if (await ensureRefreshed()) {
      return apiCall<T>(path, opts, false);
    }
  }
  if (opts.raw) return res as unknown as T;
  const text = await res.text();
  let payload: ApiResponse<T> | undefined;
  try {
    payload = text ? (JSON.parse(text) as ApiResponse<T>) : undefined;
  } catch {
    throw new ApiClientError(res.status, {
      code: 'NON_JSON',
      message: 'Non-JSON response',
      i18nKey: 'errors.internal',
    });
  }
  if (!res.ok || !payload || payload.success === false) {
    const err: ApiError =
      payload && 'error' in payload
        ? payload.error
        : { code: 'UNKNOWN', message: res.statusText, i18nKey: 'errors.internal' };
    throw new ApiClientError(res.status, err);
  }
  return payload.data;
}

export function pickI18nKey(err: unknown, fallback = 'errors.internal'): string {
  if (err instanceof ApiClientError) return err.error.i18nKey || fallback;
  return fallback;
}
