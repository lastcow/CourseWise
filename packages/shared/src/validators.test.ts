import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './validators';

describe('registerSchema', () => {
  it('accepts a valid payload', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'hunter2hunter2',
      name: 'Alice',
    });
    expect(result.success).toBe(true);
  });

  it('rejects short passwords', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'short',
      name: 'Alice',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('rejects invalid emails', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'whatever',
    });
    expect(result.success).toBe(false);
  });
});
