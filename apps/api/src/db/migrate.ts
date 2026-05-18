import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const sql = neon(url);
  const db = drizzle(sql);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const folder = path.resolve(here, '../../drizzle');
  console.log('Running migrations from', folder);
  await migrate(db, { migrationsFolder: folder });
  console.log('Migrations applied');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
