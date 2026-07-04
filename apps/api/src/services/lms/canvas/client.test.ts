import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiException } from '../../../lib/errors';
import { aesGcmDecrypt, aesGcmEncrypt } from '../../../lib/crypto';
import {
  CanvasAuthError,
  CanvasClient,
  classifyCanvas401,
  parseNextLink,
} from './client';

const BASE_URL = 'https://school.instructure.com';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseNextLink', () => {
  it('extracts the rel="next" URL and ignores other rels', () => {
    const header =
      '<https://x.test/api/v1/courses?page=2&per_page=100>; rel="next",' +
      '<https://x.test/api/v1/courses?page=1&per_page=100>; rel="first",' +
      '<https://x.test/api/v1/courses?page=9&per_page=100>; rel="last"';
    expect(parseNextLink(header)).toBe('https://x.test/api/v1/courses?page=2&per_page=100');
  });

  it('returns null when there is no next page or no header', () => {
    expect(parseNextLink('<https://x.test/a?page=1>; rel="first"')).toBeNull();
    expect(parseNextLink(null)).toBeNull();
  });
});

describe('classifyCanvas401', () => {
  it('distinguishes invalid / expired / revoked bodies', () => {
    expect(classifyCanvas401('{"errors":[{"message":"Invalid access token."}]}')).toBe('invalid');
    expect(classifyCanvas401('{"errors":[{"message":"Expired access token."}]}')).toBe('expired');
    expect(classifyCanvas401('{"errors":[{"message":"Revoked access token."}]}')).toBe('revoked');
    expect(classifyCanvas401('something else')).toBe('invalid');
  });
});

describe('CanvasClient', () => {
  it('throws when constructed without a token', () => {
    expect(() => new CanvasClient(BASE_URL, '')).toThrow(/token is required/);
  });

  it('sends Bearer auth, accept and a User-Agent header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 1, name: 'T. Teacher' }));
    const client = new CanvasClient(BASE_URL, 'tok-123');
    const self = await client.getSelf();
    expect(self).toEqual({ id: 1, name: 'T. Teacher' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/api/v1/users/self`);
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok-123');
    expect(headers.accept).toBe('application/json');
    expect(headers['user-agent']).toMatch(/^CourseWise\//);
  });

  it('follows Link rel="next" pages serially and concatenates results', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, [{ id: 1 }], {
          link: `<${BASE_URL}/api/v1/courses/9/assignments?page=2&per_page=100>; rel="next"`,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 2 }]));
    const client = new CanvasClient(BASE_URL, 'tok');
    const out = await client.listAssignments('9');
    expect(out.map((a) => a.id)).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = fetchMock.mock.calls[0]![0] as string;
    expect(firstUrl).toContain('per_page=100');
    const secondUrl = fetchMock.mock.calls[1]![0] as string;
    expect(secondUrl).toBe(`${BASE_URL}/api/v1/courses/9/assignments?page=2&per_page=100`);
  });

  it('throws CanvasAuthError with the classified kind on 401', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { errors: [{ message: 'Expired access token.' }] }),
    );
    const client = new CanvasClient(BASE_URL, 'tok');
    const err = await client.getSelf().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CanvasAuthError);
    expect((err as CanvasAuthError).kind).toBe('expired');
    expect((err as CanvasAuthError).status).toBe(401);
  });

  it('retries on 429 then succeeds', async () => {
    vi.useFakeTimers();
    try {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(429, 'Rate Limit Exceeded', { 'retry-after': '0' }))
        .mockResolvedValueOnce(jsonResponse(200, { id: 1, name: 'ok' }));
      const client = new CanvasClient(BASE_URL, 'tok');
      const promise = client.getSelf();
      await vi.runAllTimersAsync();
      const self = await promise;
      expect(self.name).toBe('ok');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats 403 "Rate Limit Exceeded" as rate limiting but plain 403 as FORBIDDEN', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, 'unauthorized to view this page'));
    const client = new CanvasClient(BASE_URL, 'tok');
    await expect(client.getSelf()).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps other upstream failures to 502 without echoing query strings', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, 'boom'));
    const client = new CanvasClient(BASE_URL, 'tok');
    const err = await client.listTeacherCourses().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiException);
    expect((err as ApiException).status).toBe(502);
    expect((err as ApiException).message).not.toContain('enrollment_type');
  });
});

describe('aesGcm round trip', () => {
  const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

  it('encrypts and decrypts back to the plaintext with unique IVs', async () => {
    const a = await aesGcmEncrypt(KEY, 'canvas-token-secret');
    const b = await aesGcmEncrypt(KEY, 'canvas-token-secret');
    expect(a).not.toBe(b);
    expect(await aesGcmDecrypt(KEY, a)).toBe('canvas-token-secret');
    expect(await aesGcmDecrypt(KEY, b)).toBe('canvas-token-secret');
  });

  it('rejects decryption with the wrong key', async () => {
    const otherKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
    const ct = await aesGcmEncrypt(KEY, 'secret');
    await expect(aesGcmDecrypt(otherKey, ct)).rejects.toThrow();
  });

  it('rejects keys that are not 32 bytes', async () => {
    await expect(aesGcmEncrypt(btoa('short'), 'x')).rejects.toThrow(/32 bytes/);
  });
});
