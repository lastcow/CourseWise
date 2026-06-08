import { describe, expect, it, vi } from 'vitest';
import { runQuizScheduleOpenSweep } from './quizScheduleOpenSweep';
import type { AppBindings } from '../types';

interface Row {
  id: string;
  studentId: string;
  scheduleId: string;
  quizId: string;
  courseId: string;
  quizTitle: string;
  scheduleName: string | null;
  courseTitle: string;
  name: string;
  email: string;
  opensAt: string | null;
  closesAt: string | null;
}

function row(over: Partial<Row> = {}): Row {
  return {
    id: 'm1',
    studentId: 's1',
    scheduleId: 'w1',
    quizId: 'q1',
    courseId: 'c1',
    quizTitle: 'Midterm',
    scheduleName: 'Wave A',
    courseTitle: 'CS101',
    name: 'Ada',
    email: 'ada@example.com',
    opensAt: '2026-06-01T09:00:00.000Z',
    closesAt: null,
    ...over,
  };
}

// db.execute -> { rows }. db.insert(...).values(...) is awaitable (audit) AND
// has .onConflictDoNothing() (alerts). db.update(...).set(...).where(...) resolves.
function makeDb(rows: Row[]) {
  const whereMock = vi.fn().mockResolvedValue(undefined);
  const setMock = vi.fn(() => ({ where: whereMock }));
  const updateMock = vi.fn(() => ({ set: setMock }));
  const valuesMock = vi.fn(() =>
    Object.assign(Promise.resolve(undefined), {
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  );
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  const executeMock = vi.fn().mockResolvedValue({ rows });
  const db = {
    execute: executeMock,
    insert: insertMock,
    update: updateMock,
  } as never;
  return { db, insertMock, valuesMock, updateMock, whereMock, executeMock };
}

function makeEnv(withEmail: boolean) {
  const send = vi.fn().mockResolvedValue({ messageId: 'mid' });
  const env = {
    DATABASE_URL: 'x',
    ...(withEmail ? { SEND_EMAIL: { send } } : {}),
  } as unknown as AppBindings;
  return { env, send };
}

describe('runQuizScheduleOpenSweep', () => {
  it('notifies + emails each eligible member and stamps notified_at', async () => {
    const { db, updateMock } = makeDb([row({ id: 'm1', email: 'a@x.com' }), row({ id: 'm2', email: 'b@x.com' })]);
    const { env, send } = makeEnv(true);
    const summary = await runQuizScheduleOpenSweep(db, env);
    expect(summary).toEqual({ notified: 2, emailed: 2, failed: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenCalledTimes(2); // notified_at stamp per member
  });

  it('still notifies in-app when the email binding is absent', async () => {
    const { db } = makeDb([row()]);
    const { env, send } = makeEnv(false);
    const summary = await runQuizScheduleOpenSweep(db, env);
    expect(summary).toEqual({ notified: 1, emailed: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('is a no-op with no eligible rows (no audit row)', async () => {
    const { db, insertMock } = makeDb([]);
    const { env } = makeEnv(true);
    const summary = await runQuizScheduleOpenSweep(db, env);
    expect(summary).toEqual({ notified: 0, emailed: 0, failed: 0 });
    expect(insertMock).not.toHaveBeenCalled(); // no alert + no audit
  });

  it('counts a member as notified even if its email send throws', async () => {
    const { db } = makeDb([row()]);
    const send = vi.fn().mockRejectedValue(new Error('smtp down'));
    const env = { DATABASE_URL: 'x', SEND_EMAIL: { send } } as unknown as AppBindings;
    const summary = await runQuizScheduleOpenSweep(db, env);
    expect(summary).toEqual({ notified: 1, emailed: 0, failed: 0 });
  });
});
