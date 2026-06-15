import { jwtVerify, SignJWT } from 'jose';
import type { UserRole } from '@coursewise/shared';

export const ACCESS_TOKEN_TTL_SECONDS = 12 * 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
// "Remember me" extends the refresh-token lifetime so the session survives for
// longer across browser restarts.
export const REMEMBER_ME_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Refresh-token lifetime in seconds, longer when the user opted into "remember me". */
export function refreshTokenTtlSeconds(rememberMe: boolean): number {
  return rememberMe ? REMEMBER_ME_REFRESH_TOKEN_TTL_SECONDS : REFRESH_TOKEN_TTL_SECONDS;
}

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
  // "Remember me" flag, carried in the token so it survives rotation. Optional
  // for backwards-compatibility with tokens issued before this existed.
  rmb?: boolean;
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
    .setExpirationTime(`${refreshTokenTtlSeconds(payload.rmb === true)}s`)
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
