import { describe, expect, it } from 'vitest';
import app, { type Env } from './index';

const env: Env = {
  DATABASE_URL: 'postgresql://user:pw@host.tld/db?sslmode=require',
  JWT_SECRET: 'test-secret-test-secret-test-secret-12',
  JWT_REFRESH_SECRET: 'test-refresh-secret-test-secret-test-secret-12',
  JWT_ISSUER: 'coursewise',
  JWT_AUDIENCE: 'coursewise-web',
  CORS_ORIGIN: 'http://localhost:5173',
};

describe('health endpoint', () => {
  it('returns ok with a timestamp on /api/health', async () => {
    const res = await app.request('/api/health', {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns version info on /api/version', async () => {
    const res = await app.request('/api/version', {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { commit: string; version: string };
    expect(body.version).toBe('1.0.0');
    expect(typeof body.commit).toBe('string');
  });
});
