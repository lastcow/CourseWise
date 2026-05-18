import { describe, expect, it } from 'vitest';
import app, { type Env } from './index';

const env: Env = {
  DATABASE_URL: 'postgres://test',
  JWT_SECRET: 'test-secret-test-secret-test-secret-12',
  JWT_ISSUER: 'coursewise',
  JWT_AUDIENCE: 'coursewise-web',
  CORS_ORIGIN: 'http://localhost:5173',
};

describe('health endpoint', () => {
  it('returns ok with a timestamp', async () => {
    const res = await app.request('/health', {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });
});
