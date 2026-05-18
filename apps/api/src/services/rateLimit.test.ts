import { describe, expect, it } from 'vitest';
import { InMemoryRateLimiter, KvRateLimiter } from './rateLimit';

describe('InMemoryRateLimiter', () => {
  it('allows up to limit then blocks', async () => {
    const rl = new InMemoryRateLimiter();
    const key = 'test:ip';
    for (let i = 0; i < 3; i++) {
      const r = await rl.consume(key, 3, 60);
      expect(r.allowed).toBe(true);
    }
    const blocked = await rl.consume(key, 3, 60);
    expect(blocked.allowed).toBe(false);
  });

  it('resets after the window elapses', async () => {
    const rl = new InMemoryRateLimiter();
    const key = 'test:reset';
    const r1 = await rl.consume(key, 1, 0);
    expect(r1.allowed).toBe(true);
    // window=0 -> immediately expired on next call
    await new Promise((r) => setTimeout(r, 5));
    const r2 = await rl.consume(key, 1, 0);
    expect(r2.allowed).toBe(true);
  });
});

describe('KvRateLimiter', () => {
  function makeKv() {
    const store = new Map<string, { value: string; ttl?: number }>();
    const puts: Array<{ key: string; ttl?: number }> = [];
    const kv = {
      async get(key: string) {
        const entry = store.get(key);
        return entry ? JSON.parse(entry.value) : null;
      },
      async put(key: string, value: string, opts?: { expirationTtl?: number }) {
        store.set(key, { value, ttl: opts?.expirationTtl });
        puts.push({ key, ttl: opts?.expirationTtl });
      },
    };
    return { kv, puts };
  }

  it('clamps expirationTtl to the 60-second KV minimum on refresh', async () => {
    const { kv, puts } = makeKv();
    const rl = new KvRateLimiter(kv);
    // Seed an entry whose resetAt is ~23s in the future (the scenario that
    // previously triggered "KV PUT failed: Expiration TTL must be at least 60").
    await kv.put(
      'login:a',
      JSON.stringify({ count: 1, resetAt: Date.now() + 23_000 }),
      { expirationTtl: 60 },
    );
    const r = await rl.consume('login:a', 10, 60);
    expect(r.allowed).toBe(true);
    const refresh = puts[puts.length - 1]!;
    expect(refresh.ttl).toBeGreaterThanOrEqual(60);
    // The user-visible resetSeconds still reflects the real window.
    expect(r.resetSeconds).toBeLessThanOrEqual(23);
  });

  it('uses windowSeconds for the initial put when it is >= 60', async () => {
    const { kv, puts } = makeKv();
    const rl = new KvRateLimiter(kv);
    await rl.consume('login:b', 10, 120);
    expect(puts[0]!.ttl).toBe(120);
  });
});
