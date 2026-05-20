import { describe, expect, it, vi } from 'vitest';
import { deleteR2Prefix } from './r2Cleanup';

function fakeBucket(initial: string[]) {
  let keys = [...initial];
  return {
    list: vi.fn(
      async ({ prefix, limit, cursor }: { prefix: string; limit: number; cursor?: string }) => {
        const all = keys.filter((k) => k.startsWith(prefix));
        const start = cursor ? Number(cursor) : 0;
        const page = all.slice(start, start + limit);
        return {
          objects: page.map((key) => ({ key })),
          truncated: start + limit < all.length,
          cursor: String(start + limit),
        };
      },
    ),
    delete: vi.fn(async (toDelete: string[]) => {
      keys = keys.filter((k) => !toDelete.includes(k));
    }),
    snapshot: () => [...keys],
  };
}

describe('deleteR2Prefix', () => {
  it('deletes every object under the prefix in batches', async () => {
    const bucket = fakeBucket([
      'courses/A/file1',
      'courses/A/file2',
      'courses/A/sub/file3',
      'courses/B/file1',
    ]);
    await deleteR2Prefix(bucket as unknown as R2Bucket, 'courses/A/');
    expect(bucket.snapshot()).toEqual(['courses/B/file1']);
  });

  it('handles paginated listing (cursor-driven)', async () => {
    const many = Array.from({ length: 2500 }, (_, i) => `courses/A/${i}.pdf`);
    const bucket = fakeBucket(many);
    await deleteR2Prefix(bucket as unknown as R2Bucket, 'courses/A/');
    expect(bucket.snapshot()).toEqual([]);
    expect(bucket.list).toHaveBeenCalledTimes(3);
    // Regression guard: list must always be called without a cursor — re-listing
    // from the prefix start is what makes pagination safe across deletes.
    for (const call of bucket.list.mock.calls) {
      expect(call[0].cursor).toBeUndefined();
    }
  });

  it('no-op when prefix is empty', async () => {
    const bucket = fakeBucket(['courses/B/file']);
    await deleteR2Prefix(bucket as unknown as R2Bucket, 'courses/A/');
    expect(bucket.delete).not.toHaveBeenCalled();
  });
});
