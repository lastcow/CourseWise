import { describe, expect, it } from 'vitest';
import { API_TOKEN_SCOPES, SCOPE_GROUPS } from '@coursewise/shared';
import { ERROR_CODES } from './errors';
import { ROUTES, buildOpenApiSpec } from './openapi';

describe('openapi spec', () => {
  const spec = buildOpenApiSpec({ serverUrl: 'https://api.example.com' });

  it('declares OpenAPI 3.1 with title + servers', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect((spec.info as { title: string }).title).toBe('CourseWise API');
    expect(spec.servers).toEqual([{ url: 'https://api.example.com' }]);
  });

  it('defines bearerJwt and apiToken security schemes', () => {
    const schemes = (spec.components as { securitySchemes: Record<string, { type: string; scheme: string }> })
      .securitySchemes;
    expect(schemes.bearerJwt).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(schemes.apiToken).toMatchObject({ type: 'http', scheme: 'bearer' });
  });

  it('includes the unified ApiError envelope with every documented error code', () => {
    const schemas = (spec.components as { schemas: Record<string, unknown> }).schemas;
    expect(schemas.ApiError).toBeDefined();
    const codeEnum = ((schemas.ApiError as { properties: { error: { properties: { code: { enum: string[] } } } } })
      .properties.error.properties.code.enum);
    for (const code of Object.values(ERROR_CODES)) {
      expect(codeEnum).toContain(code);
    }
  });

  it('exposes every registered route under paths', () => {
    const paths = spec.paths as Record<string, Record<string, unknown> | undefined>;
    for (const route of ROUTES) {
      const item = paths[route.path];
      expect(item, `missing path ${route.path}`).toBeDefined();
      expect(item?.[route.method], `missing ${route.method} ${route.path}`).toBeDefined();
    }
  });

  it('marks public routes with empty security and authenticated routes with both schemes', () => {
    const paths = spec.paths as Record<string, Record<string, { security: unknown[]; tags: string[] } | undefined> | undefined>;
    const publicOp = paths['/api/auth/login']?.post;
    expect(publicOp?.security).toEqual([]);

    const eitherOp = paths['/api/courses']?.get;
    expect(eitherOp?.security).toEqual([
      { bearerJwt: [] },
      { apiToken: Array.from(SCOPE_GROUPS.coursesRead) },
    ]);

    const jwtOp = paths['/api/auth/me']?.get;
    expect(jwtOp?.security).toEqual([{ bearerJwt: [] }]);
  });

  it('every scope referenced in security is a known API_TOKEN_SCOPES value', () => {
    const paths = spec.paths as Record<string, Record<string, { security?: Array<Record<string, string[]>> }>>;
    for (const methodMap of Object.values(paths)) {
      for (const op of Object.values(methodMap)) {
        if (!op.security) continue;
        for (const entry of op.security) {
          if (entry.apiToken) {
            for (const scope of entry.apiToken) {
              expect(API_TOKEN_SCOPES, `unknown scope ${scope}`).toContain(scope);
            }
          }
        }
      }
    }
  });

  it('covers the major resource tags', () => {
    const tagNames = (spec.tags as { name: string }[]).map((t) => t.name);
    for (const required of [
      'auth',
      'courses',
      'materials',
      'files',
      'assignments',
      'quizzes',
      'attendance',
      'grading',
      'alerts',
      'dashboards',
    ]) {
      expect(tagNames).toContain(required);
    }
  });

  it('includes at least one example path per major resource', () => {
    const paths = Object.keys(spec.paths as Record<string, unknown>);
    expect(paths).toContain('/api/courses/{courseId}/grading-policy');
    expect(paths).toContain('/api/courses/{courseId}/final-grades/recalculate');
    expect(paths).toContain('/api/courses/{courseId}/alerts/generate');
    expect(paths).toContain('/api/courses/{courseId}/grades/export.csv');
    expect(paths).toContain('/api/dashboards/admin');
  });
});
