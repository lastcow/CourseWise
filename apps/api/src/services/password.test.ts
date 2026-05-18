import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('hunter2hunter2', 6);
    expect(await verifyPassword('hunter2hunter2', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('hunter2hunter2', 6);
    expect(await verifyPassword('hunter3hunter3', hash)).toBe(false);
  });
});
