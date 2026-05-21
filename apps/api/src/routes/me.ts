import { Hono } from 'hono';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import {
  createSelfApiTokenSchema,
  type ApiTokenScope,
  type ApiTokenSummary,
  type CreatedApiToken,
  type CreateSelfApiTokenInput,
  type DisclosureLogEntry,
  type DisclosureLogResponse,
  type UpdatePreferencesInput,
  updatePreferencesSchema,
} from '@coursewise/shared';
import { apiTokens, auditLogs, users } from '../db/schema';
import { defaultScopesForRole, generateApiToken } from '../services/apiTokens';
import { recordAudit } from '../services/audit';
import { buildMyRecordsExport } from '../services/recordsExport';
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

/**
 * FERPA §99.32(c) — the student has the right to inspect the disclosure log
 * of their own education records. Returns audit_logs rows where the calling
 * user is the `disclosed_student_id`, ordered most-recent-first, joined to
 * the actor's display name. Bulk exports show up as one row per student in
 * the recipient's slice — by design (see PR #92).
 *
 * JWT-only (via the parent `me.use('*', requireJwtAuth)`): an API token
 * shouldn't be able to pull its own user's disclosure log unless we add a
 * dedicated scope for it. Today no such scope exists.
 */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

me.get('/records/disclosures', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');

  const limitRaw = Number.parseInt(c.req.query('limit') ?? '', 10);
  const offsetRaw = Number.parseInt(c.req.query('offset') ?? '', 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      target: auditLogs.target,
      metadata: auditLogs.metadataJson,
      occurredAt: auditLogs.createdAt,
      actorType: auditLogs.actorType,
      actorName: users.name,
      actorRole: users.role,
      actorTokenName: apiTokens.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .leftJoin(apiTokens, eq(apiTokens.id, auditLogs.actorTokenId))
    .where(eq(auditLogs.disclosedStudentId, auth.user.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ value: count() })
    .from(auditLogs)
    .where(eq(auditLogs.disclosedStudentId, auth.user.id));
  const total = Number(totalRow?.value ?? 0);

  const items: DisclosureLogEntry[] = rows.map((r) => ({
    id: r.id,
    occurredAt: r.occurredAt,
    action: r.action,
    actor: {
      type: r.actorType,
      name: r.actorType === 'api_token' ? r.actorTokenName : r.actorName,
      role:
        r.actorType === 'user' && (r.actorRole === 'admin' || r.actorRole === 'teacher' || r.actorRole === 'student')
          ? r.actorRole
          : null,
    },
    target: r.target,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
  }));

  const body: DisclosureLogResponse = {
    items,
    total,
    nextOffset: offset + items.length < total ? offset + items.length : null,
  };
  return success(c, body);
});

/**
 * FERPA §99.10(a): on request, the school must let a student inspect/review
 * their education records. This endpoint returns a single JSON document with
 * everything the database holds where the calling user is the subject.
 *
 * Served as a download (Content-Disposition: attachment) so a browser save-
 * dialog pops up. The audit row records that the student inspected their own
 * records — not a §99.32 disclosure (a student is allowed to inspect their
 * own data), so `disclosedStudentIds` is left unset.
 *
 * File contents (uploads, generated .pptx) are NOT inlined — the JSON
 * references each `fileAssetId` and the student can pull them through the
 * existing presigned-URL flow. Keeps the export response bounded.
 */
me.get('/records/export', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');

  const data = await buildMyRecordsExport(db, auth.user.id);

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: auth.user.id,
    action: 'records.export.self',
    metadata: {
      submissions: data.submissions.length,
      quizAttempts: data.quizAttempts.length,
      attendance: data.attendance.length,
      discussionPosts: data.discussionPosts.length,
      finalGrades: data.finalGrades.length,
      disclosures: data.disclosures.length,
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const filename = `coursewise-records-${today}.json`;
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
});

export default me;
