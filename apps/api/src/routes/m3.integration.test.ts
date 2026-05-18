import { describe, expect, it } from 'vitest';
import app from '../index';
import type { Env } from '../index';

const hasDb = !!process.env.DATABASE_URL;
const env: Env = {
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  JWT_SECRET: process.env.JWT_SECRET ?? 'integration-secret-integration-secret-12345',
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET ?? 'integration-refresh-integration-refresh-12345',
  JWT_ISSUER: 'coursewise',
  JWT_AUDIENCE: 'coursewise-web',
  CORS_ORIGIN: 'http://localhost:5173',
  BCRYPT_ROUNDS: '10',
  R2_BUCKET: 'coursewise-files',
  R2_ACCOUNT_ID: 'test-account',
  R2_ACCESS_KEY_ID: 'test-key',
  R2_SECRET_ACCESS_KEY: 'test-secret',
};

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function login(email: string, password: string): Promise<string> {
  const res = await app.request(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
    env,
  );
  const body = (await res.json()) as Envelope<{ accessToken: string }>;
  if (res.status !== 200) {
    throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(body.error)}`);
  }
  return body.data!.accessToken;
}

async function call<T = unknown>(
  path: string,
  init: RequestInit = {},
  auth?: string,
): Promise<{ status: number; body: Envelope<T> }> {
  const headers = new Headers(init.headers);
  if (auth) headers.set('authorization', `Bearer ${auth}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await app.request(path, { ...init, headers }, env);
  let body: Envelope<T>;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    body = { success: false, error: { code: 'NON_JSON', message: 'Non-JSON response' } };
  }
  return { status: res.status, body };
}

async function getUserId(email: string, password: string): Promise<string> {
  const token = await login(email, password);
  const res = await app.request('/api/auth/me', { headers: { authorization: `Bearer ${token}` } }, env);
  const body = (await res.json()) as { data: { user: { id: string } } };
  return body.data.user.id;
}

describe.skipIf(!hasDb)('M3 — teaching content (integration)', () => {
  it('presentation publish gate + speakerNotes redacted for student', async () => {
    const teacherToken = await login('teacher@example.com', 'Teacher123!');
    const studentToken = await login('student1@example.com', 'Student123!');
    const courses = await call<Array<{ id: string; code: string }>>('/api/courses', {}, teacherToken);
    const courseId = (courses.body.data ?? []).find((c) => c.code === 'MGMT101')!.id;

    const create = await call<{ id: string }>(
      `/api/courses/${courseId}/presentations`,
      { method: 'POST', body: JSON.stringify({ title: 'M3 deck' }) },
      teacherToken,
    );
    expect(create.status).toBe(201);
    const presentationId = create.body.data!.id;

    const slide1 = await call<{ id: string }>(
      `/api/presentations/${presentationId}/slides`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Intro',
          content: '# Hello',
          speakerNotes: 'Welcome the audience',
        }),
      },
      teacherToken,
    );
    expect(slide1.status).toBe(201);

    // Student cannot fetch slides while DRAFT.
    const draftSlides = await call(
      `/api/presentations/${presentationId}/slides`,
      {},
      studentToken,
    );
    expect(draftSlides.status).toBe(403);

    // Publish.
    const publish = await call(
      `/api/presentations/${presentationId}/publish`,
      { method: 'POST' },
      teacherToken,
    );
    expect(publish.status).toBe(200);

    // Student can now fetch — speakerNotes must be redacted.
    const studentSlides = await call<Array<{ speakerNotes: string | null; content: string | null }>>(
      `/api/presentations/${presentationId}/slides`,
      {},
      studentToken,
    );
    expect(studentSlides.status).toBe(200);
    expect(studentSlides.body.data?.[0]?.speakerNotes).toBeNull();
    expect(studentSlides.body.data?.[0]?.content).toBe('# Hello');

    // Cleanup.
    await call(`/api/presentations/${presentationId}`, { method: 'DELETE' }, teacherToken);
  });

  it('assignment lifecycle: cannot publish without maxScore; clamps grade to maxScore', async () => {
    const teacherToken = await login('teacher@example.com', 'Teacher123!');
    const studentToken = await login('student1@example.com', 'Student123!');
    const courses = await call<Array<{ id: string; code: string }>>('/api/courses', {}, teacherToken);
    const courseId = (courses.body.data ?? []).find((c) => c.code === 'MGMT101')!.id;

    const create = await call<{ id: string }>(
      `/api/courses/${courseId}/assignments`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Homework 1',
          description: 'Do the thing',
        }),
      },
      teacherToken,
    );
    expect(create.status).toBe(201);
    const assignmentId = create.body.data!.id;

    // Publish without maxScore → 409.
    const publishNoMax = await call(
      `/api/assignments/${assignmentId}/publish`,
      { method: 'POST' },
      teacherToken,
    );
    expect(publishNoMax.status).toBe(409);

    await call(
      `/api/assignments/${assignmentId}`,
      { method: 'PATCH', body: JSON.stringify({ maxScore: 10 }) },
      teacherToken,
    );
    const publishOk = await call(
      `/api/assignments/${assignmentId}/publish`,
      { method: 'POST' },
      teacherToken,
    );
    expect(publishOk.status).toBe(200);

    // Student creates submission, submits, teacher grades over max.
    const createSub = await call<{ id: string }>(
      `/api/assignments/${assignmentId}/submissions`,
      { method: 'POST' },
      studentToken,
    );
    expect([200, 201]).toContain(createSub.status);
    const submissionId = createSub.body.data!.id;

    await call(
      `/api/submissions/${submissionId}`,
      { method: 'PATCH', body: JSON.stringify({ textAnswer: 'My answer' }) },
      studentToken,
    );
    await call(
      `/api/submissions/${submissionId}/submit`,
      { method: 'POST' },
      studentToken,
    );

    const grade = await call<{ score: number; status: string }>(
      `/api/submissions/${submissionId}/grade`,
      { method: 'PATCH', body: JSON.stringify({ score: 999, feedback: 'Great work' }) },
      teacherToken,
    );
    expect(grade.status).toBe(200);
    expect(grade.body.data?.score).toBe(10);
    expect(grade.body.data?.status).toBe('graded');

    // Cleanup.
    await call(`/api/assignments/${assignmentId}`, { method: 'DELETE' }, teacherToken);
  });

  it('discussion: student cannot post on DRAFT; reply threading; grade upsert clamp', async () => {
    const teacherToken = await login('teacher@example.com', 'Teacher123!');
    const studentToken = await login('student1@example.com', 'Student123!');
    const studentUserId = await getUserId('student1@example.com', 'Student123!');
    const courses = await call<Array<{ id: string; code: string }>>('/api/courses', {}, teacherToken);
    const courseId = (courses.body.data ?? []).find((c) => c.code === 'MGMT101')!.id;

    const topic = await call<{ id: string }>(
      `/api/courses/${courseId}/discussion-topics`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Week 1 discussion',
          description: 'Discuss',
          isGraded: true,
          maxScore: 5,
        }),
      },
      teacherToken,
    );
    expect(topic.status).toBe(201);
    const topicId = topic.body.data!.id;

    // Student cannot post on draft.
    const draftPost = await call(
      `/api/discussion-topics/${topicId}/posts`,
      { method: 'POST', body: JSON.stringify({ content: 'Hello' }) },
      studentToken,
    );
    expect(draftPost.status).toBe(403);

    await call(
      `/api/discussion-topics/${topicId}/publish`,
      { method: 'POST' },
      teacherToken,
    );

    const post = await call<{ id: string }>(
      `/api/discussion-topics/${topicId}/posts`,
      { method: 'POST', body: JSON.stringify({ content: 'My first post' }) },
      studentToken,
    );
    expect(post.status).toBe(201);
    const postId = post.body.data!.id;

    const reply = await call<{ parentId: string }>(
      `/api/discussion-posts/${postId}/replies`,
      { method: 'POST', body: JSON.stringify({ content: 'Reply from teacher' }) },
      teacherToken,
    );
    expect(reply.status).toBe(201);
    expect(reply.body.data?.parentId).toBe(postId);

    // Grade — clamp over max.
    const grade = await call<{ score: number }>(
      `/api/discussion-topics/${topicId}/grades/${studentUserId}`,
      { method: 'PATCH', body: JSON.stringify({ score: 99, feedback: 'Good' }) },
      teacherToken,
    );
    expect(grade.status).toBe(200);
    expect(grade.body.data?.score).toBe(5);

    // Cleanup.
    await call(`/api/discussion-topics/${topicId}`, { method: 'DELETE' }, teacherToken);
  });

  it('submission ownership: student B cannot read student A submission', async () => {
    const teacherToken = await login('teacher@example.com', 'Teacher123!');
    const studentAToken = await login('student1@example.com', 'Student123!');
    const studentBToken = await login('student2@example.com', 'Student123!');
    const courses = await call<Array<{ id: string; code: string }>>('/api/courses', {}, teacherToken);
    const courseId = (courses.body.data ?? []).find((c) => c.code === 'MGMT101')!.id;

    const create = await call<{ id: string }>(
      `/api/courses/${courseId}/assignments`,
      { method: 'POST', body: JSON.stringify({ title: 'Ownership probe', maxScore: 10 }) },
      teacherToken,
    );
    expect(create.status).toBe(201);
    const assignmentId = create.body.data!.id;
    await call(`/api/assignments/${assignmentId}/publish`, { method: 'POST' }, teacherToken);

    const aSub = await call<{ id: string }>(
      `/api/assignments/${assignmentId}/submissions`,
      { method: 'POST' },
      studentAToken,
    );
    expect([200, 201]).toContain(aSub.status);
    const aSubmissionId = aSub.body.data!.id;

    const peek = await call(`/api/submissions/${aSubmissionId}`, {}, studentBToken);
    expect(peek.status).toBe(403);

    const peekPatch = await call(
      `/api/submissions/${aSubmissionId}`,
      { method: 'PATCH', body: JSON.stringify({ textAnswer: 'evil' }) },
      studentBToken,
    );
    expect(peekPatch.status).toBe(403);

    // Cleanup.
    await call(`/api/assignments/${assignmentId}`, { method: 'DELETE' }, teacherToken);
  });
});
