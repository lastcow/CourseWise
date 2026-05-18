import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import {
  createSelfApiTokenSchema,
  type ApiTokenScope,
  type ApiTokenSummary,
  type CreatedApiToken,
  type CreateSelfApiTokenInput,
  type UpdatePreferencesInput,
  updatePreferencesSchema,
} from '@coursewise/shared';
import { apiTokens, users } from '../db/schema';
import { defaultScopesForRole, generateApiToken } from '../services/apiTokens';
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

// List the caller's own API tokens, including revoked ones (so the UI can show status).
me.get('/api-tokens', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, auth.user.id))
    .orderBy(asc(apiTokens.createdAt));
  return success(c, { tokens: rows.map(summarizeToken) });
});

// Mint a new token for the caller. Scopes are auto-bound to the caller's role
// — clients never supply a `scopes` field, so they cannot escalate privileges.
me.post('/api-tokens', validateJson(createSelfApiTokenSchema), async (c) => {
  const input = c.get('validated') as CreateSelfApiTokenInput;
  const auth = c.get('auth');
  const db = c.get('db');

  const scopes = defaultScopesForRole(auth.user.role);
  if (scopes.length === 0) {
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Role cannot mint API tokens');
  }

  const expiresAt =
    input.expiresInDays != null
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const { plaintext, hash } = await generateApiToken();
  const inserted = await db
    .insert(apiTokens)
    .values({
      userId: auth.user.id,
      name: input.name,
      tokenHash: hash,
      scopes,
      expiresAt,
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
    metadata: { role: auth.user.role, scopeCount: scopes.length },
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
