import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiException } from '../../lib/errors';
import { GammaClient } from './client';

const BASE_URL = 'https://public-api.gamma.app/v1.0';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
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

describe('GammaClient', () => {
  it('throws when constructed without an apiKey', () => {
    expect(() => new GammaClient('')).toThrow(/apiKey is required/);
  });

  describe('createGeneration', () => {
    it('POSTs to /generations with X-API-KEY + JSON content-type and returns parsed body', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { generationId: 'gen_123' }),
      );
      const client = new GammaClient('sk-test');
      const out = await client.createGeneration({
        inputText: 'hello',
        format: 'presentation',
        exportAs: 'pptx',
        title: 'Test deck',
      });

      expect(out).toEqual({ generationId: 'gen_123' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${BASE_URL}/generations`);
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['X-API-KEY']).toBe('sk-test');
      expect(headers['content-type']).toBe('application/json');
      expect(headers.accept).toBe('application/json');
      const parsed = JSON.parse(init.body as string);
      expect(parsed).toMatchObject({
        inputText: 'hello',
        format: 'presentation',
        exportAs: 'pptx',
        title: 'Test deck',
      });
    });
  });

  describe('listThemes', () => {
    it('normalises both `{themes:[]}` and bare-array responses and drops malformed entries', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          themes: [
            { id: 't1', name: 'Theme One', previewUrl: 'https://img/1.png' },
            { id: 't2', name: 'Theme Two' },
            { id: 42 }, // malformed: dropped
            { name: 'no-id' }, // malformed: dropped
          ],
        }),
      );
      const client = new GammaClient('sk-test');
      const themes = await client.listThemes();
      expect(themes).toEqual([
        { id: 't1', name: 'Theme One', previewUrl: 'https://img/1.png' },
        { id: 't2', name: 'Theme Two', previewUrl: null },
      ]);
    });

    it('handles a bare-array response shape', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, [{ id: 't1', name: 'Theme One' }]),
      );
      const client = new GammaClient('sk-test');
      const themes = await client.listThemes();
      expect(themes).toEqual([
        { id: 't1', name: 'Theme One', previewUrl: null },
      ]);
    });
  });

  describe('error handling', () => {
    it('propagates 401 with status 401 as an ApiException carrying upstream text', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'bad key' }));
      const client = new GammaClient('sk-bad');
      const err = await client.listThemes().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiException);
      const apiErr = err as ApiException;
      expect(apiErr.status).toBe(401);
      expect(apiErr.message).toContain('Gamma API');
      expect(apiErr.message).toContain('401');
      expect(apiErr.message).toContain('bad key');
    });

    it('maps an upstream 500 to a 502', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('upstream boom', { status: 500 }),
      );
      const client = new GammaClient('sk-test');
      const err = await client
        .getGeneration('gen_x')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiException);
      const apiErr = err as ApiException;
      expect(apiErr.status).toBe(502);
      expect(apiErr.message).toContain('Gamma API');
      expect(apiErr.message).toContain('500');
      expect(apiErr.message).toContain('upstream boom');
    });

    it('propagates 403 unchanged', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(403, { message: 'forbidden' }),
      );
      const client = new GammaClient('sk-test');
      const err = await client.listThemes().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).status).toBe(403);
    });

    it('maps a 2xx with a non-JSON body to a 502 ApiException', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('<!doctype html><html>oops misrouted</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      );
      const client = new GammaClient('sk-test');
      const err = await client.listThemes().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).status).toBe(502);
      expect((err as ApiException).message).toContain('non-JSON');
    });

    it('returns {} for a 2xx with empty body', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
      const client = new GammaClient('sk-test');
      const themes = await client.listThemes();
      expect(themes).toEqual([]);
    });
  });

  describe('baseUrl override', () => {
    it('uses the configured baseUrl', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, []));
      const client = new GammaClient('sk-test', { baseUrl: 'https://gamma.local/v1.0/' });
      await client.listThemes();
      const [url] = fetchMock.mock.calls[0]!;
      // Trailing slash should be stripped from the option.
      expect(url).toBe('https://gamma.local/v1.0/themes');
    });
  });
});
