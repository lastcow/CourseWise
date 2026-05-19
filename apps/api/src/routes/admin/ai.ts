import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import {
  createAiModelSchema,
  createAiProviderSchema,
  updateAiModelSchema,
  updateAiProviderSchema,
  updateAiPromptTemplateSchema,
  type AiModelSummary,
  type AiProviderKind,
  type AiProviderSummary,
  type AiPromptTemplate,
  type AiArtifactKind,
  AI_ARTIFACT_KINDS,
  type CreateAiModelInput,
  type CreateAiProviderInput,
  type UpdateAiModelInput,
  type UpdateAiProviderInput,
  type UpdateAiPromptTemplateInput,
} from '@coursewise/shared';
import { aiModels, aiProviders, aiPromptTemplates } from '../../db/schema';
import { recordAudit } from '../../services/audit';
import { hasProviderSecret } from '../../services/ai/gateway';
import { DEFAULT_PROMPT_BY_KIND } from '../../services/ai/promptDefaults';
import { ApiException, ERROR_CODES } from '../../lib/errors';
import { success } from '../../lib/response';
import { validateJson } from '../../middleware/validate';
import { requireAuth, requireTokenOwnerRole } from '../../middleware/auth';
import { requireScopeGroup } from '../../middleware/scope';
import type { AppEnv } from '../../types';

const ai = new Hono<AppEnv>();

ai.use('*', requireAuth, requireTokenOwnerRole('admin'));

function toProviderSummary(
  row: typeof aiProviders.$inferSelect,
  secretConfigured: boolean,
): AiProviderSummary {
  return {
    id: row.id,
    kind: row.kind as AiProviderKind,
    displayName: row.displayName,
    apiKeySecretRef: row.apiKeySecretRef,
    enabled: row.enabled,
    secretConfigured,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toModelSummary(
  row: typeof aiModels.$inferSelect,
  providerKind: AiProviderKind,
): AiModelSummary {
  return {
    id: row.id,
    providerId: row.providerId,
    providerKind,
    modelId: row.modelId,
    displayName: row.displayName,
    enabled: row.enabled,
    costInPer1m: row.costInPer1m === null ? null : Number(row.costInPer1m),
    costOutPer1m: row.costOutPer1m === null ? null : Number(row.costOutPer1m),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPromptTemplate(row: typeof aiPromptTemplates.$inferSelect): AiPromptTemplate {
  return {
    id: row.id,
    kind: row.kind as AiArtifactKind,
    systemPrompt: row.systemPrompt,
    userMessage: row.userMessage,
    depthConfig: row.depthConfig,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

// ---------- Providers ----------
ai.get('/providers', requireScopeGroup('aiAdminRead'), async (c) => {
  const db = c.get('db');
  const rows = await db.select().from(aiProviders).orderBy(asc(aiProviders.kind));
  const providers = rows.map((row) =>
    toProviderSummary(row, hasProviderSecret(c.env, row.apiKeySecretRef)),
  );
  return success(c, { providers });
});

ai.post(
  '/providers',
  requireScopeGroup('aiAdminWrite'),
  validateJson(createAiProviderSchema),
  async (c) => {
    const input = c.get('validated') as CreateAiProviderInput;
    const auth = c.get('auth');
    const db = c.get('db');

    const existing = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.kind, input.kind))
      .limit(1);
    if (existing.length > 0) {
      throw new ApiException(
        409,
        ERROR_CODES.CONFLICT,
        `Provider ${input.kind} is already configured.`,
      );
    }

    const inserted = await db
      .insert(aiProviders)
      .values({
        kind: input.kind,
        displayName: input.displayName,
        apiKeySecretRef: input.apiKeySecretRef,
        enabled: input.enabled ?? true,
      })
      .returning();
    const row = inserted[0];
    if (!row) {
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create provider');
    }

    await recordAudit(db, {
      actorType: auth.method === 'api_token' ? 'api_token' : 'user',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'admin.ai.provider.create',
      target: row.id,
      metadata: { kind: input.kind },
    });

    return success(c, toProviderSummary(row, hasProviderSecret(c.env, row.apiKeySecretRef)), 201);
  },
);

ai.patch(
  '/providers/:id',
  requireScopeGroup('aiAdminWrite'),
  validateJson(updateAiProviderSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.get('validated') as UpdateAiProviderInput;
    const auth = c.get('auth');
    const db = c.get('db');

    const patch: Partial<typeof aiProviders.$inferInsert> = {};
    if (input.displayName !== undefined) patch.displayName = input.displayName;
    if (input.apiKeySecretRef !== undefined) patch.apiKeySecretRef = input.apiKeySecretRef;
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    if (Object.keys(patch).length === 0) {
      throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'No fields to update');
    }
    patch.updatedAt = new Date().toISOString();

    const updated = await db
      .update(aiProviders)
      .set(patch)
      .where(eq(aiProviders.id, id))
      .returning();
    const row = updated[0];
    if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Provider not found');

    await recordAudit(db, {
      actorType: auth.method === 'api_token' ? 'api_token' : 'user',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'admin.ai.provider.update',
      target: row.id,
      metadata: patch,
    });

    return success(c, toProviderSummary(row, hasProviderSecret(c.env, row.apiKeySecretRef)));
  },
);

ai.delete('/providers/:id', requireScopeGroup('aiAdminWrite'), async (c) => {
  const id = c.req.param('id');
  const auth = c.get('auth');
  const db = c.get('db');
  const deleted = await db.delete(aiProviders).where(eq(aiProviders.id, id)).returning();
  const row = deleted[0];
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Provider not found');

  await recordAudit(db, {
    actorType: auth.method === 'api_token' ? 'api_token' : 'user',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'admin.ai.provider.delete',
    target: row.id,
  });

  return success(c, { id: row.id });
});

// ---------- Models ----------
ai.get('/models', requireScopeGroup('aiAdminRead'), async (c) => {
  const db = c.get('db');
  const rows = await db
    .select({
      model: aiModels,
      providerKind: aiProviders.kind,
    })
    .from(aiModels)
    .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
    .orderBy(asc(aiProviders.kind), asc(aiModels.modelId));
  const models = rows.map((r) => toModelSummary(r.model, r.providerKind as AiProviderKind));
  return success(c, { models });
});

ai.post(
  '/models',
  requireScopeGroup('aiAdminWrite'),
  validateJson(createAiModelSchema),
  async (c) => {
    const input = c.get('validated') as CreateAiModelInput;
    const auth = c.get('auth');
    const db = c.get('db');

    const provider = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, input.providerId))
      .limit(1);
    if (provider.length === 0) {
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Provider not found');
    }

    const inserted = await db
      .insert(aiModels)
      .values({
        providerId: input.providerId,
        modelId: input.modelId,
        displayName: input.displayName,
        enabled: input.enabled ?? true,
        costInPer1m: input.costInPer1m == null ? null : String(input.costInPer1m),
        costOutPer1m: input.costOutPer1m == null ? null : String(input.costOutPer1m),
      })
      .returning();
    const row = inserted[0];
    if (!row) {
      throw new ApiException(500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create model');
    }

    await recordAudit(db, {
      actorType: auth.method === 'api_token' ? 'api_token' : 'user',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'admin.ai.model.create',
      target: row.id,
      metadata: { providerId: input.providerId, modelId: input.modelId },
    });

    return success(c, toModelSummary(row, provider[0]!.kind as AiProviderKind), 201);
  },
);

ai.patch(
  '/models/:id',
  requireScopeGroup('aiAdminWrite'),
  validateJson(updateAiModelSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.get('validated') as UpdateAiModelInput;
    const auth = c.get('auth');
    const db = c.get('db');

    const patch: Partial<typeof aiModels.$inferInsert> = {};
    if (input.displayName !== undefined) patch.displayName = input.displayName;
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    if (input.costInPer1m !== undefined) {
      patch.costInPer1m = input.costInPer1m == null ? null : String(input.costInPer1m);
    }
    if (input.costOutPer1m !== undefined) {
      patch.costOutPer1m = input.costOutPer1m == null ? null : String(input.costOutPer1m);
    }
    if (Object.keys(patch).length === 0) {
      throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'No fields to update');
    }
    patch.updatedAt = new Date().toISOString();

    const updated = await db.update(aiModels).set(patch).where(eq(aiModels.id, id)).returning();
    const row = updated[0];
    if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Model not found');

    const provider = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, row.providerId))
      .limit(1);

    await recordAudit(db, {
      actorType: auth.method === 'api_token' ? 'api_token' : 'user',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'admin.ai.model.update',
      target: row.id,
      metadata: patch,
    });

    return success(c, toModelSummary(row, (provider[0]?.kind ?? 'anthropic') as AiProviderKind));
  },
);

ai.delete('/models/:id', requireScopeGroup('aiAdminWrite'), async (c) => {
  const id = c.req.param('id');
  const auth = c.get('auth');
  const db = c.get('db');
  const deleted = await db.delete(aiModels).where(eq(aiModels.id, id)).returning();
  const row = deleted[0];
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Model not found');

  await recordAudit(db, {
    actorType: auth.method === 'api_token' ? 'api_token' : 'user',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'admin.ai.model.delete',
    target: row.id,
  });

  return success(c, { id: row.id });
});

// ---------- Prompt templates ----------
ai.get('/prompts', requireScopeGroup('aiAdminRead'), async (c) => {
  const db = c.get('db');
  const rows = await db.select().from(aiPromptTemplates).orderBy(asc(aiPromptTemplates.kind));
  const templates = rows.map(toPromptTemplate);
  return success(c, { templates });
});

ai.put(
  '/prompts/:kind',
  requireScopeGroup('aiAdminWrite'),
  validateJson(updateAiPromptTemplateSchema),
  async (c) => {
    const kind = c.req.param('kind') as AiArtifactKind;
    if (!AI_ARTIFACT_KINDS.includes(kind)) {
      throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Unknown artifact kind.');
    }
    const input = c.get('validated') as UpdateAiPromptTemplateInput;
    const auth = c.get('auth');
    const db = c.get('db');
    const [row] = await db
      .update(aiPromptTemplates)
      .set({
        systemPrompt: input.systemPrompt,
        userMessage: input.userMessage,
        depthConfig: input.depthConfig,
        updatedBy: auth.user.id,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(aiPromptTemplates.kind, kind))
      .returning();
    if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Prompt template not found.');
    await recordAudit(db, {
      actorType: auth.method === 'api_token' ? 'api_token' : 'user',
      actorUserId: auth.user.id,
      actorTokenId: auth.tokenId ?? null,
      action: 'admin.ai.prompts.update',
      target: row.id,
      metadata: { kind },
    });
    return success(c, toPromptTemplate(row));
  },
);

ai.post('/prompts/:kind/reset', requireScopeGroup('aiAdminWrite'), async (c) => {
  const kind = c.req.param('kind') as AiArtifactKind;
  if (!AI_ARTIFACT_KINDS.includes(kind)) {
    throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Unknown artifact kind.');
  }
  const defaults = DEFAULT_PROMPT_BY_KIND[kind];
  const auth = c.get('auth');
  const db = c.get('db');
  const [row] = await db
    .update(aiPromptTemplates)
    .set({
      systemPrompt: defaults.systemPrompt,
      userMessage: defaults.userMessage,
      depthConfig: defaults.depthConfig,
      updatedBy: auth.user.id,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(aiPromptTemplates.kind, kind))
    .returning();
  if (!row) throw new ApiException(404, ERROR_CODES.NOT_FOUND, 'Prompt template not found.');
  await recordAudit(db, {
    actorType: auth.method === 'api_token' ? 'api_token' : 'user',
    actorUserId: auth.user.id,
    actorTokenId: auth.tokenId ?? null,
    action: 'admin.ai.prompts.reset',
    target: row.id,
    metadata: { kind },
  });
  return success(c, toPromptTemplate(row));
});

export default ai;
