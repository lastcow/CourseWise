import bcrypt from 'bcryptjs';

export async function hashPassword(password: string, rounds = 10): Promise<string> {
  return bcrypt.hash(password, rounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
