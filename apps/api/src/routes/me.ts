import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import {
  createApiTokenSchema,
  type ApiTokenScope,
  type ApiTokenSummary,
  type CreatedApiToken,
  type CreateApiTokenInput,
  type UpdatePreferencesInput,
  updatePreferencesSchema,
} from '@coursewise/shared';
import { apiTokens, users } from '../db/schema';
import { generateApiToken, rejectScopesForRole } from '../services/apiTokens';
import { recordAudit } from '../services/audit';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { validateJson } from '../middleware/validate';
import { requireJwtAuth } from '../middleware/jwt';
import type { AppEnv } from '../types';

const me = new Hono<AppEnv>();

me.use('*', requireJwtAuth);

me.get('/preferences', (c) => {
  const auth = c.get('auth');
  return success(c, { preferredLanguage: auth.user.preferredLanguage });
});

me.patch('/preferences', validateJson(updatePreferencesSchema), async (c) => {
  const input = c.get('validated') as UpdatePreferencesInput;
  const auth = c.get('auth');
  const db = c.get('db');
  if (!input.preferredLanguage) {
    return success(c, { preferredLanguage: auth.user.preferredLanguage });
  }
  await db
    .update(users)
    .set({
      preferredLanguage: input.preferredLanguage,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, auth.user.id));

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: auth.user.id,
    action: 'me.preferences.update',
    metadata: { preferredLanguage: input.preferredLanguage },
  });

  return success(c, { preferredLanguage: input.preferredLanguage });
});

function summarizeToken(row: typeof apiTokens.$inferSelect): ApiTokenSummary {
  return {
    id: row.id,
    name: row.name,
    scopes: (row.scopes ?? []) as ApiTokenScope[],
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

me.get('/api-tokens', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const rows = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, auth.user.id), isNull(apiTokens.revokedAt)));
  return success(c, { tokens: rows.map(summarizeToken) });
});

me.post('/api-tokens', validateJson(createApiTokenSchema), async (c) => {
  const input = c.get('validated') as CreateApiTokenInput;
  const auth = c.get('auth');
  const db = c.get('db');

  if (auth.user.role === 'student') {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Students cannot create API tokens');
  }
  const scopeCheck = rejectScopesForRole(auth.user.role, input.scopes);
  if (!scopeCheck.ok) {
    throw new ApiException(
      403,
      ERROR_CODES.FORBIDDEN,
      `Role ${auth.user.role} cannot mint scopes: ${scopeCheck.bad.join(', ')}`,
    );
  }

  const { plaintext, hash } = await generateApiToken();
  const inserted = await db
    .insert(apiTokens)
    .values({
      userId: auth.user.id,
      name: input.name,
      tokenHash: hash,
      scopes: input.scopes,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  const row = inserted[0];
  if (!row) {
    throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create token');
  }

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: auth.user.id,
    action: 'me.api-token.create',
    target: row.id,
    metadata: { scopes: input.scopes },
  });

  const body: CreatedApiToken = {
    ...summarizeToken(row),
    token: plaintext,
  };
  return success(c, body, 201);
});

me.post('/api-tokens/:id/revoke', async (c) => {
  const id = c.req.param('id');
  const auth = c.get('auth');
  const db = c.get('db');
  const rows = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, auth.user.id)))
    .limit(1);
  const token = rows[0];
  if (!token) {
    throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Token not found');
  }
  if (!token.revokedAt) {
    await db
      .update(apiTokens)
      .set({ revokedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(eq(apiTokens.id, id));
  }
  await recordAudit(db, {
    actorType: 'user',
    actorUserId: auth.user.id,
    action: 'me.api-token.revoke',
    target: id,
  });
  return success(c, { ok: true });
});

export default me;
