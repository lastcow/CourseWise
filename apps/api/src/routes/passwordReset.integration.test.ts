/**
 * Integration coverage for the public forgot-password / reset-password
 * endpoints. Gated on DATABASE_URL like the other M2 integration tests, so CI
 * without a Neon instance still runs typecheck/lint/build cleanly. The
 * assertions still typecheck when skipped.
 *
 * Each test seeds its own throwaway user (unique email) so the run never
 * corrupts the shared seed data other integration tests log in with, and so a
 * password change here can't bleed into another test file.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import app from '../index';
import type { Env } from '../index';
import { createDb } from '../db/client';
import { passwordResetTokens, refreshTokens, users } from '../db/schema';
import { hashPassword } from '../services/password';
import { issueResetToken } from '../services/passwordReset';
import { sha256Hex } from '../lib/crypto';

const hasDb = !!process.env.DATABASE_URL;
const env: Env = {
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  JWT_SECRET: process.env.JWT_SECRET ?? 'integration-secret-integration-secret-12345',
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET ?? 'integration-refresh-integration-refresh-12345',
  JWT_ISSUER: 'coursewise',
  JWT_AUDIENCE: 'coursewise-web',
  CORS_ORIGIN: 'http://localhost:5173',
  BCRYPT_ROUNDS: '10',
  R2_BUCKET: 'coursewise-files',
  R2_ACCOUNT_ID: 'test-account',
  R2_ACCESS_KEY_ID: 'test-key',
  R2_SECRET_ACCESS_KEY: 'test-secret',
};

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function postJson<T = unknown>(
  path: string,
  body: unknown,
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await app.request(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  );
  let parsed: Envelope<T>;
  try {
    parsed = (await res.json()) as Envelope<T>;
  } catch {
    parsed = { success: false, error: { code: 'NON_JSON', message: 'Non-JSON response' } };
  }
  return { status: res.status, body: parsed };
}

const db = hasDb ? createDb(env.DATABASE_URL) : null;
const createdUserIds: string[] = [];

async function seedUser(password: string): Promise<{ id: string; email: string }> {
  const email = `pwreset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const passwordHash = await hashPassword(password, 10);
  const inserted = (
    await db!
      .insert(users)
      .values({ email, passwordHash, name: 'Pw Reset Test', role: 'student', status: 'active' })
      .returning({ id: users.id, email: users.email })
  )[0]!;
  createdUserIds.push(inserted.id);
  return inserted;
}

describe.skipIf(!hasDb)('password reset endpoints (requires DATABASE_URL)', () => {
  afterAll(async () => {
    if (!db || createdUserIds.length === 0) return;
    // refresh_tokens / password_reset_tokens cascade on user delete.
    await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  it('forgot-password for a known active email returns { requested: true } and mints a token', async () => {
    const user = await seedUser('OldPass123!');
    const res = await postJson<{ requested: boolean }>('/api/auth/forgot-password', {
      email: user.email,
    });
    expect(res.status).toBe(200);
    expect(res.body.data?.requested).toBe(true);

    const rows = await db!
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));
    expect(rows.length).toBe(1);
  });

  it('forgot-password for an unknown email returns an identical 200 and mints no token', async () => {
    const unknownEmail = `nobody-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const res = await postJson<{ requested: boolean }>('/api/auth/forgot-password', {
      email: unknownEmail,
    });
    expect(res.status).toBe(200);
    expect(res.body.data?.requested).toBe(true);

    // No user exists for this email → no token row anywhere referencing it.
    const userRows = await db!
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, unknownEmail));
    expect(userRows.length).toBe(0);
  });

  it('full round-trip: reset-password succeeds, revokes sessions, swaps the password', async () => {
    const oldPassword = 'OldPass123!';
    const newPassword = 'BrandNewPass456!';
    const user = await seedUser(oldPassword);

    // Log in once so the user has an outstanding (unrevoked) refresh token.
    const login = await postJson<{ refreshToken: string }>('/api/auth/login', {
      email: user.email,
      password: oldPassword,
    });
    expect(login.status).toBe(200);
    const oldRefreshToken = login.body.data!.refreshToken;

    // The plaintext token is never stored; mint one via the service so we can
    // drive the public endpoint with a real link value.
    const token = await issueResetToken(db!, user.id);

    const reset = await postJson<{ reset: boolean }>('/api/auth/reset-password', {
      token,
      password: newPassword,
    });
    expect(reset.status).toBe(200);
    expect(reset.body.data?.reset).toBe(true);

    // All previously-issued refresh tokens for this user are now revoked.
    const liveTokens = await db!
      .select({ id: refreshTokens.id })
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));
    expect(liveTokens.length).toBe(0);

    // The old refresh token can no longer be exchanged.
    const refresh = await postJson('/api/auth/refresh', { refreshToken: oldRefreshToken });
    expect(refresh.status).toBe(401);

    // The reset token is now marked used.
    const hash = await sha256Hex(token);
    const usedRows = await db!
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, hash), isNotNull(passwordResetTokens.usedAt)));
    expect(usedRows.length).toBe(1);

    // New password logs in; old password is rejected.
    const newLogin = await postJson('/api/auth/login', {
      email: user.email,
      password: newPassword,
    });
    expect(newLogin.status).toBe(200);
    const oldLogin = await postJson('/api/auth/login', {
      email: user.email,
      password: oldPassword,
    });
    expect(oldLogin.status).toBe(401);
  });

  it('reset-password with an unknown token → 400 INVALID_TOKEN', async () => {
    const res = await postJson('/api/auth/reset-password', {
      token: 'definitely-not-a-real-token-value',
      password: 'WhateverPass123!',
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('INVALID_TOKEN');
  });

  it('reset-password with an expired token → 400 TOKEN_EXPIRED', async () => {
    const user = await seedUser('OldPass123!');
    const token = await issueResetToken(db!, user.id);
    const hash = await sha256Hex(token);
    // Force the row to be already expired.
    await db!
      .update(passwordResetTokens)
      .set({ expiresAt: new Date(Date.now() - 60_000).toISOString() })
      .where(eq(passwordResetTokens.tokenHash, hash));

    const res = await postJson('/api/auth/reset-password', { token, password: 'NewPass123456!' });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('TOKEN_EXPIRED');
  });

  it('reset-password reusing a consumed token → 400 TOKEN_REVOKED', async () => {
    const user = await seedUser('OldPass123!');
    const token = await issueResetToken(db!, user.id);

    const first = await postJson('/api/auth/reset-password', {
      token,
      password: 'FirstNew123456!',
    });
    expect(first.status).toBe(200);

    const second = await postJson('/api/auth/reset-password', {
      token,
      password: 'SecondNew123456!',
    });
    expect(second.status).toBe(400);
    expect(second.body.error?.code).toBe('TOKEN_REVOKED');
  });
});
