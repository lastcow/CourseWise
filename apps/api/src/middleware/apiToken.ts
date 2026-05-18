import type { MiddlewareHandler } from 'hono';
import { eq } from 'drizzle-orm';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { apiTokens, users } from '../db/schema';
import { hashApiToken } from '../services/apiTokens';
import { API_TOKEN_PREFIX } from '@coursewise/shared';
import type { AppEnv } from '../types';

export const requireApiTokenAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    throw new ApiException(401, ERROR_CODES.UNAUTHORIZED, 'Missing bearer token');
  }
  const token = header.slice(7).trim();
  if (!token.startsWith(API_TOKEN_PREFIX)) {
    throw new ApiException(401, ERROR_CODES.INVALID_TOKEN, 'Not an API token');
  }

  const hash = await hashApiToken(token);
  const db = c.get('db');

  const rows = await db
    .select({ token: apiTokens, user: users })
    .from(apiTokens)
    .leftJoin(users, eq(apiTokens.userId, users.id))
    .where(eq(apiTokens.tokenHash, hash))
    .limit(1);
  const row = rows[0];
  if (!row || !row.user) {
    throw new ApiException(401, ERROR_CODES.INVALID_TOKEN, 'API token not recognized');
  }
  const { token: stored, user } = row;
  if (stored.revokedAt) {
    throw new ApiException(401, ERROR_CODES.TOKEN_REVOKED, 'API token revoked');
  }
  if (stored.expiresAt && new Date(stored.expiresAt) <= new Date()) {
    throw new ApiException(401, ERROR_CODES.TOKEN_EXPIRED, 'API token expired');
  }
  if (user.status !== 'active') {
    throw new ApiException(403, ERROR_CODES.ACCOUNT_INACTIVE, 'Account is not active');
  }

  c.set('auth', {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      preferredLanguage: user.preferredLanguage,
    },
    method: 'api_token',
    scopes: stored.scopes ?? [],
    tokenId: stored.id,
  });

  // Fire-and-forget last-used touch
  c.executionCtx.waitUntil(
    (async () => {
      try {
        await db
          .update(apiTokens)
          .set({ lastUsedAt: new Date().toISOString() })
          .where(eq(apiTokens.id, stored.id));
      } catch (err) {
        console.error('failed to update lastUsedAt', err);
      }
    })(),
  );

  await next();
};
