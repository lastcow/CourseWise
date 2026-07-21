import { ApiException, ERROR_CODES } from '../../../lib/errors';

// Hand-written Canvas REST client modeled on services/gamma/client.ts.
// Invariants (docs/plans/2026-07-04-canvas-sync-v2 §2, §4):
// - Requests are strictly serial (callers must not fan out) — this alone keeps
//   us under Canvas's per-token leaky bucket.
// - Mandatory User-Agent (Canvas rejects UA-less requests in production).
// - Bearer token in the Authorization header, never as a query param.
// - Pagination follows only the Link header's rel="next" URL (opaque).
// - Rate limiting arrives as 429 or 403 "Rate Limit Exceeded" — both retried
//   with backoff here; all other retries belong to Workflow step.do.
// - The token never appears in error messages or logs.

const USER_AGENT = 'CourseWise/1.0 (+https://fsuac.com)';
const PER_PAGE = 100;
const RATE_LIMIT_RETRIES = 3;

export type Canvas401Kind = 'invalid' | 'expired' | 'revoked';

export function classifyCanvas401(bodyText: string): Canvas401Kind {
  const lower = bodyText.toLowerCase();
  if (lower.includes('expired access token')) return 'expired';
  if (lower.includes('revoked access token')) return 'revoked';
  return 'invalid';
}

export class CanvasAuthError extends ApiException {
  constructor(
    readonly kind: Canvas401Kind,
    message: string,
  ) {
    super(401, ERROR_CODES.UNAUTHORIZED, message);
  }
}

export interface CanvasUser {
  id: number;
  name: string;
  sortable_name?: string;
  short_name?: string;
  avatar_url?: string;
  email?: string;
  login_id?: string;
  sis_user_id?: string | null;
  pronouns?: string | null;
}

export interface CanvasTerm {
  id: number;
  name?: string;
  start_at?: string | null;
  end_at?: string | null;
}

export interface CanvasCourse {
  id: number;
  name?: string;
  course_code?: string;
  workflow_state?: string;
  start_at?: string | null;
  end_at?: string | null;
  syllabus_body?: string | null;
  total_students?: number;
  term?: CanvasTerm;
}

export interface CanvasAssignmentGroup {
  id: number;
  name?: string;
  position?: number;
  group_weight?: number;
  rules?: Record<string, unknown>;
}

export interface CanvasAssignment {
  id: number;
  name?: string;
  description?: string | null;
  due_at?: string | null;
  unlock_at?: string | null;
  lock_at?: string | null;
  points_possible?: number | null;
  grading_type?: string;
  submission_types?: string[];
  workflow_state?: string;
  published?: boolean;
  position?: number;
  assignment_group_id?: number;
  is_quiz_assignment?: boolean;
  updated_at?: string;
}

export interface CanvasModuleItem {
  id: number;
  module_id?: number;
  position?: number;
  title?: string;
  type?: string;
  content_id?: number;
}

export interface CanvasModule {
  id: number;
  name?: string;
  position?: number;
  workflow_state?: string;
  published?: boolean;
}

export interface CanvasSection {
  id: number;
  name?: string;
  nonxlist_course_id?: number | null;
}

export interface CanvasEnrollmentUser {
  id: number;
  name: string;
  sortable_name?: string;
  email?: string | null;
  login_id?: string | null;
  sis_user_id?: string | null;
  enrollments?: Array<{
    enrollment_state?: string;
    course_section_id?: number;
    type?: string;
  }>;
}

export interface CanvasUserGeneratedToken {
  id: number;
  purpose?: string | null;
  expires_at?: string | null;
  last_used_at?: string | null;
  token_hint?: string | null;
}

export class CanvasClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly token: string,
  ) {
    if (!token) throw new Error('CanvasClient: token is required');
    if (!baseUrl) throw new Error('CanvasClient: baseUrl is required');
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async rawRequest(method: string, url: string, payload?: unknown): Promise<Response> {
    let attempt = 0;
    for (;;) {
      const res = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${this.token}`,
          accept: 'application/json',
          'user-agent': USER_AGENT,
          ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: payload !== undefined ? JSON.stringify(payload) : undefined,
      });
      const rateLimited =
        res.status === 429 ||
        (res.status === 403 && (await res.clone().text()).includes('Rate Limit Exceeded'));
      if (!rateLimited || attempt >= RATE_LIMIT_RETRIES) return res;
      const retryAfter = Number(res.headers.get('retry-after'));
      const delayMs =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delayMs));
      attempt += 1;
    }
  }

  private async request<T>(method: string, path: string, payload?: unknown): Promise<T> {
    const { body } = await this.requestWithLink<T>(method, path, payload);
    return body;
  }

  private async requestWithLink<T>(
    method: string,
    pathOrUrl: string,
    payload?: unknown,
  ): Promise<{ body: T; next: string | null }> {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${this.baseUrl}${pathOrUrl}`;
    const res = await this.rawRequest(method, url, payload);
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401) {
        const kind = classifyCanvas401(text);
        throw new CanvasAuthError(kind, `Canvas API ${method} → 401 (${kind} access token)`);
      }
      const status = res.status === 403 || res.status === 404 ? res.status : 502;
      const code =
        res.status === 403
          ? ERROR_CODES.FORBIDDEN
          : res.status === 404
            ? ERROR_CODES.NOT_FOUND
            : ERROR_CODES.INTERNAL_ERROR;
      // Propagate caller-actionable statuses; map everything else to 502 so
      // the caller can tell "Canvas broke" apart from "we broke".
      throw new ApiException(
        status,
        code,
        `Canvas API ${method} ${this.redact(url)} → ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    let body: T;
    if (!text) {
      body = {} as T;
    } else {
      try {
        body = JSON.parse(text) as T;
      } catch {
        throw new ApiException(
          502,
          ERROR_CODES.INTERNAL_ERROR,
          `Canvas API ${method} ${this.redact(url)} returned non-JSON body: ${text.slice(0, 200)}`,
        );
      }
    }
    return { body, next: parseNextLink(res.headers.get('link')) };
  }

  private redact(url: string): string {
    // Defensive: the token is only ever sent as a header, but never echo query
    // strings verbatim into errors either.
    return url.split('?')[0] ?? url;
  }

  // Serially walks Link rel="next" pages and concatenates array bodies.
  private async getPaginated<T>(path: string): Promise<T[]> {
    const joiner = path.includes('?') ? '&' : '?';
    let url: string | null = `${this.baseUrl}${path}${joiner}per_page=${PER_PAGE}`;
    const out: T[] = [];
    while (url) {
      const { body, next }: { body: T[]; next: string | null } = await this.requestWithLink<T[]>(
        'GET',
        url,
      );
      if (!Array.isArray(body)) {
        throw new ApiException(
          502,
          ERROR_CODES.INTERNAL_ERROR,
          `Canvas API GET ${this.redact(url)} returned a non-array page`,
        );
      }
      out.push(...body);
      url = next;
    }
    return out;
  }

  // --- P0: connection ---

  getSelf(): Promise<CanvasUser> {
    return this.request<CanvasUser>('GET', '/api/v1/users/self');
  }

  // Heuristic expires_at lookup for the connected token (matched by purpose /
  // token_hint downstream). Defensive: endpoint availability varies, callers
  // must treat failures as "unknown expiry".
  async listUserGeneratedTokens(): Promise<CanvasUserGeneratedToken[]> {
    const body = await this.request<unknown>('GET', '/api/v1/users/self/user_generated_tokens');
    return Array.isArray(body) ? (body as CanvasUserGeneratedToken[]) : [];
  }

  // Best-effort revocation on disconnect (works only while the token is valid).
  async deleteToken(tokenId: number): Promise<void> {
    await this.request<unknown>('DELETE', `/api/v1/users/self/tokens/${tokenId}`);
  }

  // --- P1: course discovery + structure import ---

  listTeacherCourses(): Promise<CanvasCourse[]> {
    return this.getPaginated<CanvasCourse>(
      '/api/v1/courses?enrollment_type=teacher&enrollment_state=active&include[]=term&include[]=total_students',
    );
  }

  getCourse(courseId: string): Promise<CanvasCourse> {
    return this.request<CanvasCourse>(
      'GET',
      `/api/v1/courses/${encodeURIComponent(courseId)}?include[]=term&include[]=syllabus_body`,
    );
  }

  listAssignmentGroups(courseId: string): Promise<CanvasAssignmentGroup[]> {
    return this.getPaginated<CanvasAssignmentGroup>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/assignment_groups`,
    );
  }

  listAssignments(courseId: string): Promise<CanvasAssignment[]> {
    return this.getPaginated<CanvasAssignment>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/assignments`,
    );
  }

  listModules(courseId: string): Promise<CanvasModule[]> {
    return this.getPaginated<CanvasModule>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/modules`,
    );
  }

  getModule(courseId: string, moduleId: string): Promise<CanvasModule> {
    return this.request<CanvasModule>(
      'GET',
      `/api/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}`,
    );
  }

  getAssignment(courseId: string, assignmentId: string): Promise<CanvasAssignment> {
    return this.request<CanvasAssignment>(
      'GET',
      `/api/v1/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}`,
    );
  }

  listSections(courseId: string): Promise<CanvasSection[]> {
    return this.getPaginated<CanvasSection>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/sections`,
    );
  }

  // --- CW→Canvas structure push (one-way; CW-native entities only) ---

  createModule(courseId: string, module: { name: string; position?: number; published?: boolean }): Promise<CanvasModule> {
    return this.request<CanvasModule>(
      'POST',
      `/api/v1/courses/${encodeURIComponent(courseId)}/modules`,
      { module: { name: module.name, position: module.position } },
    );
  }

  updateModule(
    courseId: string,
    moduleId: string,
    module: { name?: string; position?: number; published?: boolean },
  ): Promise<CanvasModule> {
    return this.request<CanvasModule>(
      'PUT',
      `/api/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}`,
      { module },
    );
  }

  createAssignment(
    courseId: string,
    assignment: Record<string, unknown>,
  ): Promise<CanvasAssignment> {
    return this.request<CanvasAssignment>(
      'POST',
      `/api/v1/courses/${encodeURIComponent(courseId)}/assignments`,
      { assignment },
    );
  }

  updateAssignment(
    courseId: string,
    assignmentId: string,
    assignment: Record<string, unknown>,
  ): Promise<CanvasAssignment> {
    return this.request<CanvasAssignment>(
      'PUT',
      `/api/v1/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(assignmentId)}`,
      { assignment },
    );
  }

  listModuleItems(courseId: string, moduleId: string): Promise<CanvasModuleItem[]> {
    return this.getPaginated<CanvasModuleItem>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/items`,
    );
  }

  // Ids are passed through as strings: Canvas accepts them, and Number() would
  // corrupt cross-shard "shard~id" forms and ids beyond 2^53.
  createModuleItem(
    courseId: string,
    moduleId: string,
    item: { title?: string; type: 'Assignment'; content_id: string; position?: number },
  ): Promise<{ id: number }> {
    return this.request<{ id: number }>(
      'POST',
      `/api/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/items`,
      { module_item: item },
    );
  }

  // moduleId is the item's CURRENT module (route position); module_item.module_id
  // (when set) moves the item to another module in the same call.
  updateModuleItem(
    courseId: string,
    moduleId: string,
    itemId: string,
    item: { position?: number; module_id?: string },
  ): Promise<CanvasModuleItem> {
    return this.request<CanvasModuleItem>(
      'PUT',
      `/api/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/items/${encodeURIComponent(itemId)}`,
      { module_item: item },
    );
  }

  // Read-only roster reference (never drives account creation). Field
  // visibility (email / sis_user_id / login_id) depends on the teacher
  // token's Canvas permissions — expect nulls.
  listStudents(courseId: string): Promise<CanvasEnrollmentUser[]> {
    return this.getPaginated<CanvasEnrollmentUser>(
      `/api/v1/courses/${encodeURIComponent(courseId)}/users?enrollment_type[]=student&enrollment_state[]=active&include[]=email&include[]=enrollments`,
    );
  }
}

// Parses RFC-5988 Link headers; the next URL is opaque (do not rebuild it).
export function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match?.[1]) return match[1];
  }
  return null;
}
