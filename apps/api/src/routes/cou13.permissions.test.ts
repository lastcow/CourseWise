/**
 * COU-13 — DB-less coverage for the PATCH /api/materials/:id surface.
 * Verifies that:
 *  - unauthenticated calls return 401 (routing wired)
 *  - the new updateMaterialSchema accepts sourceType + description fields
 *  - the schema rejects a sourceType that is not in the enum
 */
import { describe, expect, it } from 'vitest';
import { updateMaterialSchema } from '@coursewise/shared';
import app from '../index';
import type { Env } from '../index';

const env: Env = {
  DATABASE_URL: 'postgresql://user:pw@host.tld/db?sslmode=require',
  JWT_SECRET: 'test-secret-test-secret-test-secret-12',
  JWT_REFRESH_SECRET: 'test-refresh-test-refresh-test-refresh-12',
  JWT_ISSUER: 'coursewise',
  JWT_AUDIENCE: 'coursewise-web',
  CORS_ORIGIN: 'http://localhost:5173',
  R2_BUCKET: 'coursewise-files',
  R2_ACCOUNT_ID: 'test',
  R2_ACCESS_KEY_ID: 'test',
  R2_SECRET_ACCESS_KEY: 'test',
};

describe('COU-13 — PATCH /api/materials/:id wiring', () => {
  it('PATCH without auth → 401', async () => {
    const res = await app.request(
      '/api/materials/00000000-0000-0000-0000-000000000000',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      },
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe('COU-13 — updateMaterialSchema accepts new editable fields', () => {
  it('accepts description, sourceType, and a content swap', () => {
    const parsed = updateMaterialSchema.parse({
      title: 'New',
      description: 'meta',
      sourceType: 'external_link',
      externalUrl: 'https://example.com/x',
      content: null,
    });
    expect(parsed.description).toBe('meta');
    expect(parsed.sourceType).toBe('external_link');
  });

  it('rejects an unknown sourceType', () => {
    expect(() =>
      updateMaterialSchema.parse({
        sourceType: 'nonsense' as unknown as 'upload',
      }),
    ).toThrow();
  });

  it('rejects switching to upload while clearing fileAssetId', () => {
    expect(() =>
      updateMaterialSchema.parse({
        sourceType: 'upload',
        fileAssetId: null,
      }),
    ).toThrow();
  });

  it('rejects switching to external_link while clearing externalUrl', () => {
    expect(() =>
      updateMaterialSchema.parse({
        sourceType: 'external_link',
        externalUrl: null,
      }),
    ).toThrow();
  });

  it('rejects switching to manual_text while clearing content', () => {
    expect(() =>
      updateMaterialSchema.parse({
        sourceType: 'manual_text',
        content: null,
      }),
    ).toThrow();
  });
});
