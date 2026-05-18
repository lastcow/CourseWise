import { describe, expect, it } from 'vitest';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from './jwt';

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
