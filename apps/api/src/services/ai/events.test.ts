import { describe, expect, it } from 'vitest';
import { recordEvent } from './events';

describe('recordEvent', () => {
  it('inserts one row with default level=info and undefined metadata as null', async () => {
    const inserts: unknown[] = [];
    const db = {
      insert: () => ({
        values: (v: unknown) => {
          inserts.push(v);
          return Promise.resolve();
        },
      }),
    } as unknown as Parameters<typeof recordEvent>[0];

    await recordEvent(db, 'job-1', null, 'job.started', 'hi');

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      jobId: 'job-1',
      artifactId: null,
      level: 'info',
      type: 'job.started',
      message: 'hi',
      metadata: null,
    });
  });

  it('swallows errors so a failed event write never breaks the caller', async () => {
    const db = {
      insert: () => ({
        values: () => Promise.reject(new Error('db down')),
      }),
    } as unknown as Parameters<typeof recordEvent>[0];

    await expect(
      recordEvent(db, 'job-1', null, 'job.started', 'hi'),
    ).resolves.toBeUndefined();
  });

  it('writes warn level + metadata when provided', async () => {
    const inserts: unknown[] = [];
    const db = {
      insert: () => ({
        values: (v: unknown) => {
          inserts.push(v);
          return Promise.resolve();
        },
      }),
    } as unknown as Parameters<typeof recordEvent>[0];

    await recordEvent(db, 'j', 'a', 'artifact.failed', 'boom', { code: 401 }, 'warn');

    expect(inserts[0]).toMatchObject({
      jobId: 'j',
      artifactId: 'a',
      level: 'warn',
      metadata: { code: 401 },
    });
  });
});
