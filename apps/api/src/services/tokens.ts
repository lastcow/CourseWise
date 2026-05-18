import { sha256Hex } from '../lib/crypto';
import type { Db } from '../db/client';
import { refreshTokens } from '../db/schema';
import {
  REFRESH_TOKEN_TTL_SECONDS,
  signAccessToken,
  signRefreshToken,
  type JwtConfig,
} from './jwt';
import type { UserRole } from '@coursewise/shared';

export interface IssueTokensInput {
  db: Db;
  user: { id: string; email: string; role: UserRole };
  config: JwtConfig;
  meta: { ip: string | null; userAgent: string | null };
  familyId?: string;
}

export async function issueTokens({
  db,
  user,
  config,
  meta,
  familyId,
}: IssueTokensInput): Promise<{ accessToken: string; refreshToken: string }> {
  const fid = familyId ?? crypto.randomUUID();
  const jti = crypto.randomUUID();
  const accessToken = await signAccessToken(
    { sub: user.id, email: user.email, role: user.role },
    config,
  );
  const refreshToken = await signRefreshToken({ sub: user.id, fid, jti }, config);
  const tokenHash = await sha256Hex(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();

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
