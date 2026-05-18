import { describe, expect, it } from 'vitest';
import { InMemoryRateLimiter } from './rateLimit';

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
