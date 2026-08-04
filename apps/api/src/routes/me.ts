import { Hono } from 'hono';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import {
  type AccountDeletionRequestSummary,
  createSelfApiTokenSchema,
  type AiUsagePoint,
  type AiUsageResponse,
  type ApiTokenScope,
  type ApiTokenSummary,
  type CreatedApiToken,
  type CreateSelfApiTokenInput,
  type DisclosureLogEntry,
  type DisclosureLogResponse,
  type MobileDeviceSummary,
  type NotificationPreferences,
  type RegisterMobileDeviceInput,
  registerMobileDeviceSchema,
  type UpdateNotificationPreferencesInput,
  updateNotificationPreferencesSchema,
  type UpdatePreferencesInput,
  updatePreferencesSchema,
} from '@coursewise/shared';
import {
  accountDeletionRequests,
  aiUsageEvents,
  apiTokens,
  auditLogs,
  ferpaAcknowledgments,
  mobileDevices,
  notificationPreferences,
  users,
} from '../db/schema';
import { defaultScopesForRole, generateApiToken } from '../services/apiTokens';
import { recordAudit } from '../services/audit';
import { currentAcademicYear } from '../services/ferpaAcknowledgment';
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

function summarizeMobileDevice(row: typeof mobileDevices.$inferSelect): MobileDeviceSummary {
  return {
    id: row.id,
    installationId: row.installationId,
    platform: row.platform,
    environment: row.environment,
    appVersion: row.appVersion,
    osVersion: row.osVersion,
    locale: row.locale === 'zh-CN' ? 'zh-CN' : 'en',
    timezone: row.timezone,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
  };
}

me.get('/devices', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const rows = await db
    .select()
    .from(mobileDevices)
    .where(eq(mobileDevices.userId, auth.user.id))
    .orderBy(desc(mobileDevices.lastSeenAt));
  return success(c, { devices: rows.map(summarizeMobileDevice) });
});

me.post('/devices', validateJson(registerMobileDeviceSchema), async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const input = c.get('validated') as RegisterMobileDeviceInput;
  const now = new Date().toISOString();

  // APNs may rotate a token or the same physical installation may switch
  // CourseWise accounts. A token belongs to exactly one current user.
  await db
    .delete(mobileDevices)
    .where(
      and(
        eq(mobileDevices.apnsToken, input.apnsToken),
        eq(mobileDevices.environment, input.environment),
      ),
    );

  const [row] = await db
    .insert(mobileDevices)
    .values({
      userId: auth.user.id,
      installationId: input.installationId,
      platform: input.platform,
      environment: input.environment,
      apnsToken: input.apnsToken.toLowerCase(),
      appVersion: input.appVersion,
      osVersion: input.osVersion,
      locale: input.locale,
      timezone: input.timezone,
      lastSeenAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: mobileDevices.installationId,
      set: {
        userId: auth.user.id,
        platform: input.platform,
        environment: input.environment,
        apnsToken: input.apnsToken.toLowerCase(),
        appVersion: input.appVersion,
        osVersion: input.osVersion,
        locale: input.locale,
        timezone: input.timezone,
        lastSeenAt: now,
        updatedAt: now,
      },
    })
    .returning();

  if (!row) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to register device');
  await recordAudit(db, {
    actorType: 'user',
    actorUserId: auth.user.id,
    action: 'me.device.register',
    target: row.id,
    metadata: { platform: row.platform, environment: row.environment, appVersion: row.appVersion },
  });
  return success(c, summarizeMobileDevice(row), 201);
});

me.delete('/devices/:installationId', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const installationId = c.req.param('installationId');
  const removed = await db
    .delete(mobileDevices)
    .where(
      and(eq(mobileDevices.userId, auth.user.id), eq(mobileDevices.installationId, installationId)),
    )
    .returning({ id: mobileDevices.id });
  if (removed.length > 0) {
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: auth.user.id,
      action: 'me.device.unregister',
      target: removed[0]?.id,
    });
  }
  return success(c, { ok: true });
});

function defaultNotificationPreferences(timezone = 'UTC'): NotificationPreferences {
  return {
    announcements: true,
    messages: true,
    assignments: true,
    quizzes: true,
    grades: true,
    attendance: true,
    riskAlerts: true,
    sensitivePreviews: false,
    quietHoursStart: null,
    quietHoursEnd: null,
    timezone,
  };
}

function summarizeNotificationPreferences(
  row: typeof notificationPreferences.$inferSelect,
): NotificationPreferences {
  return {
    announcements: row.announcements,
    messages: row.messages,
    assignments: row.assignments,
    quizzes: row.quizzes,
    grades: row.grades,
    attendance: row.attendance,
    riskAlerts: row.riskAlerts,
    sensitivePreviews: row.sensitivePreviews,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    timezone: row.timezone,
  };
}

me.get('/notification-preferences', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const [row] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, auth.user.id))
    .limit(1);
  return success(c, row ? summarizeNotificationPreferences(row) : defaultNotificationPreferences());
});

me.patch(
  '/notification-preferences',
  validateJson(updateNotificationPreferencesSchema),
  async (c) => {
    const auth = c.get('auth');
    const db = c.get('db');
    const input = c.get('validated') as UpdateNotificationPreferencesInput;
    const now = new Date().toISOString();
    const [row] = await db
      .insert(notificationPreferences)
      .values({ userId: auth.user.id, ...defaultNotificationPreferences(input.timezone), ...input })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: { ...input, updatedAt: now },
      })
      .returning();
    if (!row) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to save preferences');
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: auth.user.id,
      action: 'me.notification-preferences.update',
      metadata: { fields: Object.keys(input) },
    });
    return success(c, summarizeNotificationPreferences(row));
  },
);

function summarizeDeletionRequest(
  row: typeof accountDeletionRequests.$inferSelect,
): AccountDeletionRequestSummary {
  return {
    id: row.id,
    status: row.status,
    requestedAt: row.requestedAt,
    resolvedAt: row.resolvedAt,
    resolutionNote: row.resolutionNote,
  };
}

me.get('/account-deletion-request', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const [row] = await db
    .select()
    .from(accountDeletionRequests)
    .where(eq(accountDeletionRequests.userId, auth.user.id))
    .orderBy(desc(accountDeletionRequests.createdAt))
    .limit(1);
  return success(c, { request: row ? summarizeDeletionRequest(row) : null });
});

me.post('/account-deletion-request', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const [existing] = await db
    .select()
    .from(accountDeletionRequests)
    .where(
      and(
        eq(accountDeletionRequests.userId, auth.user.id),
        eq(accountDeletionRequests.status, 'open'),
      ),
    )
    .limit(1);
  if (existing) return success(c, summarizeDeletionRequest(existing));

  const [row] = await db
    .insert(accountDeletionRequests)
    .values({ userId: auth.user.id })
    .returning();
  if (!row) throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create request');
  await recordAudit(db, {
    actorType: 'user',
    actorUserId: auth.user.id,
    action: 'me.account-deletion.request',
    target: row.id,
  });
  return success(c, summarizeDeletionRequest(row), 201);
});

me.delete('/account-deletion-request', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const now = new Date().toISOString();
  const [row] = await db
    .update(accountDeletionRequests)
    .set({ status: 'cancelled', resolvedAt: now, updatedAt: now })
    .where(
      and(
        eq(accountDeletionRequests.userId, auth.user.id),
        eq(accountDeletionRequests.status, 'open'),
      ),
    )
    .returning();
  if (row) {
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: auth.user.id,
      action: 'me.account-deletion.cancel',
      target: row.id,
    });
  }
  return success(c, { request: row ? summarizeDeletionRequest(row) : null });
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
        r.actorType === 'user' &&
        (r.actorRole === 'admin' || r.actorRole === 'teacher' || r.actorRole === 'student')
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

/**
 * FERPA §99.7(a): the school must annually notify students of their FERPA
 * rights. The frontend renders a first-login modal that calls this pair —
 * GET to decide whether to show, POST to dismiss for the academic year.
 */
me.get('/ferpa-acknowledgment', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const academicYear = currentAcademicYear(new Date());
  const [row] = await db
    .select({ id: ferpaAcknowledgments.id })
    .from(ferpaAcknowledgments)
    .where(
      and(
        eq(ferpaAcknowledgments.userId, auth.user.id),
        eq(ferpaAcknowledgments.academicYear, academicYear),
      ),
    )
    .limit(1);
  return success(c, { acknowledged: !!row, academicYear });
});

me.post('/ferpa-acknowledgment', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const academicYear = currentAcademicYear(new Date());

  // Inline IP/UA capture rather than depending on attendance.ts's local
  // helper. CF-Connecting-IP is the trusted client IP behind Cloudflare;
  // X-Forwarded-For is a fallback for non-CF deployments.
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null;
  const userAgent = c.req.header('user-agent') ?? null;

  // Idempotent: ON CONFLICT DO NOTHING lets the same user POST twice in a
  // year without 409s. Drizzle exposes the option via onConflictDoNothing.
  await db
    .insert(ferpaAcknowledgments)
    .values({
      userId: auth.user.id,
      academicYear,
      ip,
      userAgent,
    })
    .onConflictDoNothing({
      target: [ferpaAcknowledgments.userId, ferpaAcknowledgments.academicYear],
    });

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: auth.user.id,
    action: 'me.ferpa.acknowledge',
    metadata: { academicYear },
    ip,
    userAgent,
  });

  return success(c, { acknowledged: true, academicYear });
});

// AI usage for the profile page: per-day neurons/requests (zero-filled for
// the chart), period totals, and the latest 10 events. Self-scoped.
me.get('/ai-usage', async (c) => {
  const auth = c.get('auth');
  const db = c.get('db');
  const raw = Number.parseInt(c.req.query('days') ?? '30', 10);
  const days = Number.isNaN(raw) ? 30 : Math.min(90, Math.max(7, raw));
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const [dayRows, [totals], recentRows] = await Promise.all([
    db
      .select({
        day: sql<string>`(date_trunc('day', ${aiUsageEvents.createdAt} AT TIME ZONE 'UTC'))::date`,
        neurons: sql<number>`coalesce(sum(${aiUsageEvents.neurons}), 0)::float`,
        requests: sql<number>`count(*)::int`,
      })
      .from(aiUsageEvents)
      .where(
        and(eq(aiUsageEvents.userId, auth.user.id), sql`${aiUsageEvents.createdAt} >= ${sinceIso}`),
      )
      .groupBy(sql`1`),
    db
      .select({
        neurons: sql<number>`coalesce(sum(${aiUsageEvents.neurons}), 0)::float`,
        requests: sql<number>`count(*)::int`,
        promptTokens: sql<number>`coalesce(sum(${aiUsageEvents.promptTokens}), 0)::int`,
        completionTokens: sql<number>`coalesce(sum(${aiUsageEvents.completionTokens}), 0)::int`,
      })
      .from(aiUsageEvents)
      .where(
        and(eq(aiUsageEvents.userId, auth.user.id), sql`${aiUsageEvents.createdAt} >= ${sinceIso}`),
      ),
    db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.userId, auth.user.id))
      .orderBy(desc(aiUsageEvents.createdAt))
      .limit(10),
  ]);

  const byDate = new Map<string, AiUsagePoint>();
  const points: AiUsagePoint[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const point: AiUsagePoint = { date, neurons: 0, requests: 0 };
    points.push(point);
    byDate.set(date, point);
  }
  for (const row of dayRows) {
    const point = byDate.get(String(row.day).slice(0, 10));
    if (point) {
      point.neurons = Math.round(row.neurons * 100) / 100;
      point.requests = row.requests;
    }
  }

  const body: AiUsageResponse = {
    days,
    totals: {
      neurons: Math.round((totals?.neurons ?? 0) * 100) / 100,
      requests: totals?.requests ?? 0,
      promptTokens: totals?.promptTokens ?? 0,
      completionTokens: totals?.completionTokens ?? 0,
    },
    points,
    recent: recentRows.map((r) => ({
      id: r.id,
      feature: r.feature,
      model: r.model,
      promptTokens: r.promptTokens ?? null,
      completionTokens: r.completionTokens ?? null,
      neurons: r.neurons !== null ? Number(r.neurons) : null,
      contextTitle: r.contextTitle ?? null,
      createdAt: r.createdAt,
    })),
  };
  return success(c, body);
});

export default me;
