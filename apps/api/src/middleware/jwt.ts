import type { MiddlewareHandler } from 'hono';
import { eq } from 'drizzle-orm';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { verifyAccessToken } from '../services/jwt';
import { users } from '../db/schema';
import type { AppEnv } from '../types';

export const requireJwtAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    throw new ApiException(401, ERROR_CODES.UNAUTHORIZED, 'Missing bearer token');
  }
  const token = header.slice(7).trim();
  if (!token) {
    throw new ApiException(401, ERROR_CODES.UNAUTHORIZED, 'Missing bearer token');
  }

  let payload;
  try {
    payload = await verifyAccessToken(token, {
      accessSecret: c.env.JWT_SECRET,
      refreshSecret: c.env.JWT_REFRESH_SECRET,
      issuer: c.env.JWT_ISSUER,
      audience: c.env.JWT_AUDIENCE,
    });
  } catch {
    throw new ApiException(401, ERROR_CODES.INVALID_TOKEN, 'Invalid or expired token');
  }

  const db = c.get('db');
  const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!user) {
    throw new ApiException(401, ERROR_CODES.INVALID_TOKEN, 'User not found');
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
    method: 'jwt',
    scopes: [],
  });

  await next();
};
