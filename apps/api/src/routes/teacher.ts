import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import {
  createApiTokenSchema,
  type ApiTokenScope,
  type ApiTokenSummary,
  type CreatedApiToken,
  type CreateApiTokenInput,
} from '@coursewise/shared';
import { apiTokens } from '../db/schema';
import { generateApiToken, rejectScopesForRole } from '../services/apiTokens';
import { recordAudit } from '../services/audit';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { success } from '../lib/response';
import { validateJson } from '../middleware/validate';
import { requireAuth, requireTokenOwnerRole } from '../middleware/auth';
import type { AppEnv } from '../types';

const teacher = new Hono<AppEnv>();

teacher.use('*', requireAuth, requireTokenOwnerRole('teacher'));

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

teacher.get('/api-tokens', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const rows = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, auth.user.id), isNull(apiTokens.revokedAt)));
  return success(c, { tokens: rows.map(summarizeToken) });
});

teacher.post('/api-tokens', validateJson(createApiTokenSchema), async (c) => {
  const input = c.get('validated') as CreateApiTokenInput;
  const auth = c.get('auth');
  const db = c.get('db');

  const scopeCheck = rejectScopesForRole('teacher', input.scopes);
  if (!scopeCheck.ok) {
    throw new ApiException(
      403,
      ERROR_CODES.FORBIDDEN,
      `Teacher tokens cannot include scopes: ${scopeCheck.bad.join(', ')}`,
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
    actorType: auth.method === 'api_token' ? 'api_token' : 'user',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'teacher.api-token.create',
    target: row.id,
    metadata: { scopes: input.scopes },
  });

  const body: CreatedApiToken = { ...summarizeToken(row), token: plaintext };
  return success(c, body, 201);
});

teacher.post('/api-tokens/:id/revoke', async (c) => {
  const id = c.req.param('id');
  const auth = c.get('auth');
  const db = c.get('db');
  const rows = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, auth.user.id)))
    .limit(1);
  const token = rows[0];
  if (!token) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Token not found');
  if (!token.revokedAt) {
    await db
      .update(apiTokens)
      .set({ revokedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(eq(apiTokens.id, id));
  }
  await recordAudit(db, {
    actorType: auth.method === 'api_token' ? 'api_token' : 'user',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'teacher.api-token.revoke',
    target: id,
  });
  return success(c, { ok: true });
});

export default teacher;
