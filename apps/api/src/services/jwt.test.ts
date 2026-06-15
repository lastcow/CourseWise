import { describe, expect, it } from 'vitest';
import {
  REFRESH_TOKEN_TTL_SECONDS,
  REMEMBER_ME_REFRESH_TOKEN_TTL_SECONDS,
  refreshTokenTtlSeconds,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from './jwt';

// Decode a JWT payload without verifying — base64url-safe, works in Node and
// the Workers runtime. Used to read the `exp`/`iat` claims for TTL assertions.
function decodeJwtPayload(token: string): Record<string, unknown> {
  const b64url = token.split('.')[1]!;
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
  return JSON.parse(atob(padded)) as Record<string, unknown>;
}

function tokenLifetimeSeconds(token: string): number {
  const payload = decodeJwtPayload(token);
  return (payload.exp as number) - (payload.iat as number);
}

const config = {
  accessSecret: 'a'.repeat(48),
  refreshSecret: 'b'.repeat(48),
  issuer: 'coursewise',
  audience: 'coursewise-web',
};

describe('jwt access token', () => {
  it('round-trips payload', async () => {
    const token = await signAccessToken(
      { sub: 'user-1', email: 'a@example.com', role: 'student' },
      config,
    );
    const decoded = await verifyAccessToken(token, config);
    expect(decoded.sub).toBe('user-1');
    expect(decoded.role).toBe('student');
    expect(decoded.typ).toBe('access');
  });

  it('rejects token signed with the refresh secret', async () => {
    const refresh = await signRefreshToken({ sub: 'user-1', fid: 'fam', jti: 'jti' }, config);
    await expect(verifyAccessToken(refresh, config)).rejects.toBeDefined();
  });
});

describe('jwt refresh token', () => {
  it('round-trips refresh payload', async () => {
    const token = await signRefreshToken({ sub: 'user-1', fid: 'fam-1', jti: 'jti-1' }, config);
    const decoded = await verifyRefreshToken(token, config);
    expect(decoded.fid).toBe('fam-1');
    expect(decoded.jti).toBe('jti-1');
    expect(decoded.typ).toBe('refresh');
  });
});

describe('refresh token "remember me" lifetime', () => {
  it('uses the default 7-day TTL when remember-me is off', () => {
    expect(refreshTokenTtlSeconds(false)).toBe(REFRESH_TOKEN_TTL_SECONDS);
    expect(REFRESH_TOKEN_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
  });

  it('extends to 30 days when remember-me is on', () => {
    expect(refreshTokenTtlSeconds(true)).toBe(REMEMBER_ME_REFRESH_TOKEN_TTL_SECONDS);
    expect(REMEMBER_ME_REFRESH_TOKEN_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  it('signs a longer-lived token and round-trips the rmb claim', async () => {
    const standard = await signRefreshToken({ sub: 'u', fid: 'f', jti: 'a' }, config);
    const remembered = await signRefreshToken({ sub: 'u', fid: 'f', jti: 'b', rmb: true }, config);
    expect(tokenLifetimeSeconds(standard)).toBe(REFRESH_TOKEN_TTL_SECONDS);
    expect(tokenLifetimeSeconds(remembered)).toBe(REMEMBER_ME_REFRESH_TOKEN_TTL_SECONDS);

    const decoded = await verifyRefreshToken(remembered, config);
    expect(decoded.rmb).toBe(true);
  });
});
