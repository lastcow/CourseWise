import type { MiddlewareHandler } from 'hono';
import { and, eq } from 'drizzle-orm';
import { ApiException, ERROR_CODES } from '../lib/errors';
import { requireApiTokenAuth } from './apiToken';
import { requireJwtAuth } from './jwt';
import { courseTeachers, enrollments } from '../db/schema';
import { isAdminScope } from '../services/apiTokens';
import type { ApiTokenScope, UserRole } from '@coursewise/shared';
import type { AppEnv } from '../types';

/**
 * Either JWT or API token. Inspects the Authorization header to decide.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (token.startsWith('cmpt_')) {
    return requireApiTokenAuth(c, next);
  }
  return requireJwtAuth(c, next);
};

export function requireScope(scope: ApiTokenScope): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get('auth');
    if (!auth) {
      throw new ApiException(401, ERROR_CODES.UNAUTHORIZED);
    }
    if (auth.method === 'jwt') {
      // JWT users implicitly hold the scopes their role allows; only token
      // callers are restricted by scopes. Continue.
      return next();
    }
    if (!auth.scopes.includes(scope)) {
      throw new ApiException(
        403,
        ERROR_CODES.MISSING_SCOPE,
        `Token missing required scope: ${scope}`,
      );
    }
    return next();
  };
}

export function requireRole(...roles: UserRole[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get('auth');
    if (!auth) {
      throw new ApiException(401, ERROR_CODES.UNAUTHORIZED);
    }
    if (!roles.includes(auth.user.role)) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, `Required role: ${roles.join(' or ')}`);
    }
    return next();
  };
}

export const requireAdmin = requireRole('admin');
export const requireTeacher = requireRole('teacher');
export const requireStudent = requireRole('student');

/**
 * For API-token-authenticated callers, enforce that the token's owner has the
 * required role. JWT callers fall through to `requireRole`.
 */
export function requireTokenOwnerRole(...roles: UserRole[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get('auth');
    if (!auth) {
      throw new ApiException(401, ERROR_CODES.UNAUTHORIZED);
    }
    if (!roles.includes(auth.user.role)) {
      throw new ApiException(
        403,
        ERROR_CODES.FORBIDDEN,
        `Token owner role ${auth.user.role} not allowed`,
      );
    }
    if (auth.method === 'api_token' && auth.user.role !== 'admin') {
      // Non-admin token must not carry any admin:* scope.
      const adminScopes = auth.scopes.filter(isAdminScope);
      if (adminScopes.length > 0) {
        throw new ApiException(
          403,
          ERROR_CODES.FORBIDDEN,
          'Non-admin token cannot hold admin scopes',
        );
      }
    }
    return next();
  };
}

export function requireCourseTeacher(paramName = 'courseId'): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get('auth');
    if (!auth) throw new ApiException(401, ERROR_CODES.UNAUTHORIZED);
    if (auth.user.role === 'admin') return next();
    const courseId = c.req.param(paramName);
    if (!courseId) throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Missing courseId');
    const db = c.get('db');
    const rows = await db
      .select()
      .from(courseTeachers)
      .where(and(eq(courseTeachers.courseId, courseId), eq(courseTeachers.teacherId, auth.user.id)))
      .limit(1);
    if (rows.length === 0) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not a teacher of this course');
    }
    return next();
  };
}

export function requireCourseEnrollment(paramName = 'courseId'): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get('auth');
    if (!auth) throw new ApiException(401, ERROR_CODES.UNAUTHORIZED);
    if (auth.user.role === 'admin') return next();
    const courseId = c.req.param(paramName);
    if (!courseId) throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Missing courseId');
    const db = c.get('db');
    const rows = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.courseId, courseId), eq(enrollments.studentId, auth.user.id)))
      .limit(1);
    if (rows.length === 0 || rows[0]?.status !== 'enrolled') {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Not enrolled in this course');
    }
    return next();
  };
}

/**
 * Allow admins, teachers of the course, and enrolled students.
 */
export function requireCourseAccess(paramName = 'courseId'): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get('auth');
    if (!auth) throw new ApiException(401, ERROR_CODES.UNAUTHORIZED);
    if (auth.user.role === 'admin') return next();
    const courseId = c.req.param(paramName);
    if (!courseId) throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Missing courseId');
    const db = c.get('db');
    if (auth.user.role === 'teacher') {
      const rows = await db
        .select()
        .from(courseTeachers)
        .where(
          and(eq(courseTeachers.courseId, courseId), eq(courseTeachers.teacherId, auth.user.id)),
        )
        .limit(1);
      if (rows.length > 0) return next();
    }
    if (auth.user.role === 'student') {
      const rows = await db
        .select()
        .from(enrollments)
        .where(and(eq(enrollments.courseId, courseId), eq(enrollments.studentId, auth.user.id)))
        .limit(1);
      if (rows.length > 0 && rows[0]?.status === 'enrolled') return next();
    }
    throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'No access to this course');
  };
}

/**
 * When a request is authenticated by an API token, restrict the request to a
 * single course ID that has been encoded in the token's scopes via
 * `course:<id>` entries. If no `course:*` scopes exist, the token is unrestricted.
 */
export function requireTokenCourseAccess(paramName = 'courseId'): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get('auth');
    if (!auth) throw new ApiException(401, ERROR_CODES.UNAUTHORIZED);
    if (auth.method !== 'api_token') return next();
    const courseScopes = auth.scopes.filter((s) => s.startsWith('course:'));
    if (courseScopes.length === 0) return next();
    const courseId = c.req.param(paramName);
    if (!courseId) throw new ApiException(400, ERROR_CODES.VALIDATION_ERROR, 'Missing courseId');
    const allowed = courseScopes.some((s) => s === `course:${courseId}`);
    if (!allowed) {
      throw new ApiException(403, ERROR_CODES.FORBIDDEN, 'Token not authorized for this course');
    }
    return next();
  };
}
