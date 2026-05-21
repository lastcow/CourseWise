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
  /**
   * FERPA §99.32(a). When this entry records a disclosure of student
   * education records, set this to the affected student(s). One row is
   * written per ID; remaining fields are shared. Leave undefined / empty
   * for non-disclosure events (login, course CRUD, etc.).
   *
   * Accepts a single string for the common "one student touched" case.
   */
  disclosedStudentIds?: string | readonly string[] | null;
}

export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
  const ids = normaliseIds(entry.disclosedStudentIds);
  // No disclosure → single row with NULL disclosed_student_id (existing
  // behaviour). One disclosure → single row. Many → one row per student so
  // the disclosure log is straight-up indexable.
  const baseValues = {
    actorType: entry.actorType,
    actorUserId: entry.actorUserId ?? null,
    actorTokenId: entry.actorTokenId ?? null,
    action: entry.action,
    target: entry.target ?? null,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
    metadataJson: entry.metadata ?? null,
  } as const;

  try {
    if (ids.length === 0) {
      await db.insert(auditLogs).values({ ...baseValues, disclosedStudentId: null });
    } else {
      // Single INSERT with N rows — neon-http handles arrays natively.
      await db
        .insert(auditLogs)
        .values(ids.map((id) => ({ ...baseValues, disclosedStudentId: id })));
    }
  } catch (err) {
    console.error('audit log failed', { action: entry.action, err });
  }
}

function normaliseIds(value: AuditEntry['disclosedStudentIds']): string[] {
  if (value == null) return [];
  if (typeof value === 'string') return value ? [value] : [];
  // Dedupe to avoid one access generating two identical rows.
  return Array.from(new Set(value.filter((id) => id && id.length > 0)));
}
