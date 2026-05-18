import { jwtVerify, SignJWT } from 'jose';
import type { UserRole } from '@coursewise/shared';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  typ: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  fid: string;
  jti: string;
  typ: 'refresh';
}

export interface JwtConfig {
  accessSecret: string;
  refreshSecret: string;
  issuer: string;
  audience: string;
}

function secretBytes(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  payload: Omit<AccessTokenPayload, 'typ'>,
  config: JwtConfig,
): Promise<string> {
  return new SignJWT({ ...payload, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secretBytes(config.accessSecret));
}

export async function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'typ'>,
  config: JwtConfig,
): Promise<string> {
  return new SignJWT({ ...payload, typ: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TOKEN_TTL_SECONDS}s`)
    .sign(secretBytes(config.refreshSecret));
}

export async function verifyAccessToken(
  token: string,
  config: JwtConfig,
): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, secretBytes(config.accessSecret), {
    issuer: config.issuer,
    audience: config.audience,
  });
  if (payload.typ !== 'access') {
    throw new Error('Wrong token type');
  }
  return payload as unknown as AccessTokenPayload;
}

export async function verifyRefreshToken(
  token: string,
  config: JwtConfig,
): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, secretBytes(config.refreshSecret), {
    issuer: config.issuer,
    audience: config.audience,
  });
  if (payload.typ !== 'refresh') {
    throw new Error('Wrong token type');
  }
  return payload as unknown as RefreshTokenPayload;
}
