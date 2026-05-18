import { describe, expect, it } from 'vitest';
import app, { type Env } from './index';
import { PUBLIC_ROUTE_WHITELIST, isPublicRoute } from './lib/openapi';

const env: Env = {
  DATABASE_URL: 'postgresql://user:pw@host.tld/db?sslmode=require',
  JWT_SECRET: 'test-secret-test-secret-test-secret-12',
  JWT_REFRESH_SECRET: 'test-refresh-secret-test-secret-test-secret-12',
  JWT_ISSUER: 'coursewise',
  JWT_AUDIENCE: 'coursewise-web',
  CORS_ORIGIN: 'http://localhost:5173',
};

// Substitute a dummy value for every :param segment so we can fire a real
// request at any registered route. The handler runs *after* the auth
// middleware, so the substituted ID never has to match a real record.
function concretize(path: string): string {
  return path.replace(/:[^/]+/g, '00000000-0000-0000-0000-000000000000');
}

// Hono's `app.routes` already stores the fully-qualified path after mounting,
// so we just dedupe by (method, path). Wildcard middleware entries
// (path ending in `/*` or method `ALL`) aren't real endpoints; skip them.
interface RoutePair {
  method: string;
  path: string;
}

function collectRoutes(): RoutePair[] {
  const seen = new Map<string, RoutePair>();
  for (const r of app.routes) {
    const method = r.method.toUpperCase();
    if (method === 'ALL') continue;
    const path = r.path;
    if (path.endsWith('/*') || path === '*') continue;
    const key = `${method} ${path}`;
    if (!seen.has(key)) seen.set(key, { method, path });
  }
  return [...seen.values()];
}

describe('auth coverage (route-table guard rail)', () => {
  const allRoutes = collectRoutes();

  it('discovers at least one route per major resource', () => {
    expect(allRoutes.length).toBeGreaterThan(20);
    const paths = new Set(allRoutes.map((r) => r.path));
    expect(paths.has('/api/courses')).toBe(true);
    expect(paths.has('/api/auth/login')).toBe(true);
    expect(paths.has('/api/me/api-tokens')).toBe(true);
  });

  it('every whitelisted route is actually mounted on the app', () => {
    const lookup = new Set(allRoutes.map((r) => `${r.method.toLowerCase()} ${r.path}`));
    for (const w of PUBLIC_ROUTE_WHITELIST) {
      expect(lookup.has(`${w.method} ${w.path}`), `whitelist entry ${w.method.toUpperCase()} ${w.path} is not mounted`).toBe(
        true,
      );
    }
  });

  it('every non-whitelisted route rejects unauthenticated requests with 401', async () => {
    const failures: string[] = [];
    for (const route of allRoutes) {
      if (isPublicRoute(route.method, route.path)) continue;
      const concretePath = concretize(route.path);
      const res = await app.request(
        concretePath,
        { method: route.method, headers: { 'content-type': 'application/json' }, body: route.method === 'GET' || route.method === 'DELETE' ? undefined : '{}' },
        env,
      );
      // Anything 2xx, or a 4xx that isn't UNAUTHORIZED, would mean this
      // endpoint is reachable without a Bearer token. We accept 401 only.
      if (res.status !== 401) {
        const body = await res.text();
        failures.push(`${route.method} ${route.path} returned ${res.status} (expected 401). body=${body.slice(0, 200)}`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('whitelisted routes do NOT 401 when called without a Bearer token', async () => {
    // Smoke-check a few obvious whitelist members. We don't drive the body
    // through to a valid handler — we only assert the auth gate is absent.
    const res = await app.request('/api/health', {}, env);
    expect(res.status).toBe(200);

    const versionRes = await app.request('/api/version', {}, env);
    expect(versionRes.status).toBe(200);

    const openapiRes = await app.request('/api/openapi.json', {}, env);
    expect(openapiRes.status).toBe(200);
  });
});
