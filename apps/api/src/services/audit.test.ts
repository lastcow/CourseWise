import { describe, expect, it, vi } from 'vitest';
import { recordAudit } from './audit';

// recordAudit just writes through Drizzle, so we mock the chain and assert on
// what gets passed to `values()`. This catches:
//   - non-disclosure entries → one row, disclosed_student_id null
//   - single disclosed student → one row with the id set
//   - many disclosed students → one row per id
//   - duplicate ids are deduped (the disclosure log should not double-count)
function makeDb() {
  const valuesMock = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  return { db: { insert: insertMock } as never, insertMock, valuesMock };
}

describe('recordAudit', () => {
  it('writes a single row with NULL disclosed_student_id for non-disclosure events', async () => {
    const { db, valuesMock } = makeDb();
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: 'actor-1',
      action: 'auth.login',
    });
    expect(valuesMock).toHaveBeenCalledTimes(1);
    const arg = valuesMock.mock.calls[0]![0];
    expect(arg).toMatchObject({ action: 'auth.login', disclosedStudentId: null });
  });

  it('writes a single row with the id when disclosedStudentIds is a string', async () => {
    const { db, valuesMock } = makeDb();
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: 'teacher-1',
      action: 'submission.view',
      disclosedStudentIds: 'student-1',
    });
    // The bulk path handles single-element arrays too, so values() receives a
    // 1-row array. Either shape is fine for Drizzle; what matters is that the
    // student id was carried through.
    const arg = valuesMock.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(Array.isArray(arg)).toBe(true);
    expect(arg).toHaveLength(1);
    expect(arg[0]!.disclosedStudentId).toBe('student-1');
  });

  it('writes one row per student id for bulk disclosures', async () => {
    const { db, valuesMock } = makeDb();
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: 'teacher-1',
      action: 'grades.export.csv',
      disclosedStudentIds: ['s1', 's2', 's3'],
    });
    const arg = valuesMock.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(Array.isArray(arg)).toBe(true);
    expect(arg).toHaveLength(3);
    expect(arg.map((r) => r.disclosedStudentId)).toEqual(['s1', 's2', 's3']);
    // The shared fields are copied across all rows.
    for (const row of arg) {
      expect(row.action).toBe('grades.export.csv');
      expect(row.actorUserId).toBe('teacher-1');
    }
  });

  it('dedupes duplicate ids so one access never logs twice for the same student', async () => {
    const { db, valuesMock } = makeDb();
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: 'teacher-1',
      action: 'grades.export.csv',
      disclosedStudentIds: ['s1', 's2', 's1'],
    });
    const arg = valuesMock.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(arg).toHaveLength(2);
    expect(arg.map((r) => r.disclosedStudentId).sort()).toEqual(['s1', 's2']);
  });

  it('treats an empty array the same as no disclosure', async () => {
    const { db, valuesMock } = makeDb();
    await recordAudit(db, {
      actorType: 'user',
      actorUserId: 'teacher-1',
      action: 'course.update',
      disclosedStudentIds: [],
    });
    const arg = valuesMock.mock.calls[0]![0];
    expect(arg).toMatchObject({ disclosedStudentId: null });
    expect(Array.isArray(arg)).toBe(false);
  });
});
