import { describe, expect, it } from 'vitest';
import { readMigrationFiles } from 'drizzle-orm/migrator';

describe('database migrations', () => {
  it('splits the Apple mobile foundation DDL for Neon HTTP', () => {
    const migrations = readMigrationFiles({ migrationsFolder: 'drizzle' });
    const appleMobile = migrations.at(-1);

    expect(appleMobile?.sql).toHaveLength(11);
    expect(appleMobile?.sql.every((statement) => !/;\s*CREATE\s/iu.test(statement))).toBe(true);
  });
});
