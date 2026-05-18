import type { Db } from '../db/client';
import { auditLogs } from '../db/schema';

export type AuditActorType = 'user' | 'api_token' | 'system';

export interface AuditEntry {
  actorType: AuditActorType;
  actorUserId?: string | null;
  actorTokenId?: string | null;
  action: string;
  target?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorType: entry.actorType,
      actorUserId: entry.actorUserId ?? null,
      actorTokenId: entry.actorTokenId ?? null,
      action: entry.action,
      target: entry.target ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      metadataJson: entry.metadata ?? null,
    });
  } catch (err) {
    console.error('audit log failed', { action: entry.action, err });
  }
}
