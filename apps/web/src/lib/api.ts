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

export async function apiCall<T>(path: string, opts: ApiCallOpts = {}): Promise<T> {
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
