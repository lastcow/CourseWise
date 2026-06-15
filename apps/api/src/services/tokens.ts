import { sha256Hex } from '../lib/crypto';
import type { Db } from '../db/client';
import { refreshTokens } from '../db/schema';
import { refreshTokenTtlSeconds, signAccessToken, signRefreshToken, type JwtConfig } from './jwt';
import type { UserRole } from '@coursewise/shared';

export interface IssueTokensInput {
  db: Db;
  user: { id: string; email: string; role: UserRole };
  config: JwtConfig;
  meta: { ip: string | null; userAgent: string | null };
  familyId?: string;
  /** Extend the refresh-token lifetime (30 days) when the user opted into "remember me". */
  rememberMe?: boolean;
}

export async function issueTokens({
  db,
  user,
  config,
  meta,
  familyId,
  rememberMe = false,
}: IssueTokensInput): Promise<{ accessToken: string; refreshToken: string }> {
  const fid = familyId ?? crypto.randomUUID();
  const jti = crypto.randomUUID();
  const accessToken = await signAccessToken(
    { sub: user.id, email: user.email, role: user.role },
    config,
  );
  const refreshToken = await signRefreshToken({ sub: user.id, fid, jti, rmb: rememberMe }, config);
  const tokenHash = await sha256Hex(refreshToken);
  const expiresAt = new Date(
    Date.now() + refreshTokenTtlSeconds(rememberMe) * 1000,
  ).toISOString();

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash,
    familyId: fid,
    expiresAt,
    userAgent: meta.userAgent,
    ip: meta.ip,
  });

  return { accessToken, refreshToken };
}
