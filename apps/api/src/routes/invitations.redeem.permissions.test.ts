/**
 * DB-less coverage for the POST /api/invitation-codes/redeem surface.
 * Verifies that the route is wired and gated by `requireAuth`. Full
 * redemption semantics (idempotency, race-loss, audit) live in the
 * DB-gated integration test.
 */
import { describe, expect, it } from 'vitest';
import app from '../index';
import type { Env } from '../index';

const env: Env = {
  DATABASE_URL: 'postgresql://user:pw@host.tld/db?sslmode=require',
  JWT_SECRET: 'test-secret-test-secret-test-secret-12',
  JWT_REFRESH_SECRET: 'test-refresh-test-refresh-test-refresh-12',
  JWT_ISSUER: 'coursewise',
  JWT_AUDIENCE: 'coursewise-web',
  CORS_ORIGIN: 'http://localhost:5173',
  R2_BUCKET: 'coursewise-files',
  R2_ACCOUNT_ID: 'test',
  R2_ACCESS_KEY_ID: 'test',
  R2_SECRET_ACCESS_KEY: 'test',
};

describe('Invitation-code redeem wiring', () => {
  it('POST /api/invitation-codes/redeem without auth → 401', async () => {
    const res = await app.request(
      '/api/invitation-codes/redeem',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'INV-ABCD-EFGH' }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('POST /api/invitation-codes/redeem with empty body without auth → 401', async () => {
    const res = await app.request(
      '/api/invitation-codes/redeem',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      },
      env,
    );
    expect(res.status).toBe(401);
  });
});
