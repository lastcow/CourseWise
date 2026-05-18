import { describe, expect, it } from 'vitest';
import { Hono, type MiddlewareHandler } from 'hono';
import { requireRole, requireScope, requireTokenCourseAccess, requireTokenOwnerRole } from './auth';
import { ApiException } from '../lib/errors';
import { success } from '../lib/response';
import type { AppEnv } from '../types';
import type { AuthContext } from './types';

function setAuth(auth: AuthContext): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('auth', auth);
    await next();
  };
}

function buildApp(auth: AuthContext) {
  const app = new Hono<AppEnv>();
  app.use('*', setAuth(auth));
  app.get('/scope', requireScope('admin:write'), (c) => success(c, { ok: true }));
  app.get('/role-admin', requireRole('admin'), (c) => success(c, { ok: true }));
  app.get('/role-teacher', requireTokenOwnerRole('teacher'), (c) => success(c, { ok: true }));
  app.get('/course/:courseId/data', requireTokenCourseAccess('courseId'), (c) =>
    success(c, { ok: true, courseId: c.req.param('courseId') }),
  );
  app.onError((err, c) => {
    if (err instanceof ApiException) {
      return c.json(
        { code: err.code, status: err.status, message: err.message },
        err.status as 400 | 401 | 403 | 404 | 500,
      );
    }
    return c.json({ code: 'INTERNAL_ERROR' }, 500);
  });
  return app;
}

const studentTokenAuth: AuthContext = {
  user: {
    id: 'u-1',
    email: 'student@example.com',
    name: 'S',
    role: 'student',
    status: 'active',
    preferredLanguage: 'en',
  },
  method: 'api_token',
  scopes: ['student:read'],
  tokenId: 't-1',
};

const teacherWithAdminScopeAuth: AuthContext = {
  user: {
    id: 'u-2',
    email: 'teacher@example.com',
    name: 'T',
    role: 'teacher',
    status: 'active',
    preferredLanguage: 'en',
  },
  method: 'api_token',
  scopes: ['admin:write'],
  tokenId: 't-2',
};

const teacherJwtAuth: AuthContext = {
  user: {
    id: 'u-3',
    email: 'teacher@example.com',
    name: 'T',
    role: 'teacher',
    status: 'active',
    preferredLanguage: 'en',
  },
  method: 'jwt',
  scopes: [],
};

const tokenScopedToCourseA: AuthContext = {
  user: {
    id: 'u-4',
    email: 'x@example.com',
    name: 'X',
    role: 'teacher',
    status: 'active',
    preferredLanguage: 'en',
  },
  method: 'api_token',
  scopes: ['teacher:read', 'course:course-a'],
  tokenId: 't-4',
};

describe('requireScope', () => {
  it('rejects token missing the required scope', async () => {
    const app = buildApp(studentTokenAuth);
    const res = await app.request('/scope');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('MISSING_SCOPE');
  });

  it('passes through for JWT auth (scopes not enforced on JWT)', async () => {
    const app = buildApp(teacherJwtAuth);
    const res = await app.request('/scope');
    expect(res.status).toBe(200);
  });
});

describe('requireTokenOwnerRole', () => {
  it('rejects a teacher whose token carries admin scopes', async () => {
    const app = buildApp(teacherWithAdminScopeAuth);
    const res = await app.request('/role-teacher');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('FORBIDDEN');
  });

  it('accepts a teacher whose token has only teacher scopes', async () => {
    const app = buildApp(tokenScopedToCourseA);
    const res = await app.request('/role-teacher');
    expect(res.status).toBe(200);
  });
});

describe('requireTokenCourseAccess', () => {
  it('rejects a token scoped to a different course', async () => {
    const app = buildApp(tokenScopedToCourseA);
    const res = await app.request('/course/course-b/data');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('FORBIDDEN');
  });

  it('accepts a token whose course scope matches the path param', async () => {
    const app = buildApp(tokenScopedToCourseA);
    const res = await app.request('/course/course-a/data');
    expect(res.status).toBe(200);
  });

  it('accepts a JWT-authenticated request regardless of course scopes', async () => {
    const app = buildApp(teacherJwtAuth);
    const res = await app.request('/course/anything/data');
    expect(res.status).toBe(200);
  });
});
