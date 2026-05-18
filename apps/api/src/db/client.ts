import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export type Db = NeonHttpDatabase<typeof schema>;

export function createDb(url: string): Db {
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }
  const sql = neon(url);
  return drizzle(sql, { schema });
}

export { schema };
