export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

interface MemoryEntry {
  count: number;
  resetAt: number;
}

// DEV-ONLY in-memory limiter. Workers isolates may not share state across
// requests, so do NOT rely on this for production rate limiting — bind a KV
// namespace (RATE_LIMIT_KV) and the KV limiter below is used instead.
export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, MemoryEntry>();

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowSeconds * 1000;
      this.buckets.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: limit - 1, resetSeconds: windowSeconds };
    }
    existing.count += 1;
    const resetSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    if (existing.count > limit) {
      return { allowed: false, remaining: 0, resetSeconds };
    }
    return {
      allowed: true,
      remaining: Math.max(0, limit - existing.count),
      resetSeconds,
    };
  }
}

interface KVLike {
  get(key: string, options?: { type: 'json' }): Promise<{ count: number; resetAt: number } | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export class KvRateLimiter implements RateLimiter {
  constructor(private readonly kv: KVLike) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = await this.kv.get(key, { type: 'json' });
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowSeconds * 1000;
      await this.kv.put(key, JSON.stringify({ count: 1, resetAt }), {
        expirationTtl: windowSeconds,
      });
      return { allowed: true, remaining: limit - 1, resetSeconds: windowSeconds };
    }
    const count = existing.count + 1;
    const resetSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    await this.kv.put(key, JSON.stringify({ count, resetAt: existing.resetAt }), {
      expirationTtl: resetSeconds,
    });
    if (count > limit) {
      return { allowed: false, remaining: 0, resetSeconds };
    }
    return { allowed: true, remaining: Math.max(0, limit - count), resetSeconds };
  }
}

// Module-scope singleton for the in-memory fallback so it persists across
// requests within the same isolate during local dev.
let memoryLimiter: InMemoryRateLimiter | undefined;

export function getRateLimiter(kv: KVLike | undefined): RateLimiter {
  if (kv) return new KvRateLimiter(kv);
  if (!memoryLimiter) memoryLimiter = new InMemoryRateLimiter();
  return memoryLimiter;
}
