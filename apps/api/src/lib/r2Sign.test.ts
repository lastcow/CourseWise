import { describe, expect, it } from 'vitest';
import { buildR2Key, presignR2Url } from './r2Sign';

describe('presignR2Url', () => {
  const cfg = {
    accountId: 'acct12345',
    accessKeyId: 'AKIA-test',
    secretAccessKey: 'secret-test',
    bucket: 'coursewise-files',
  };

  it('returns a signed URL with expected sigv4 query params', async () => {
    const { url, expiresAt, signedHeaders } = await presignR2Url(cfg, {
      method: 'PUT',
      key: 'courses/abc/uuid/file.pdf',
      expiresInSeconds: 300,
      signedHeaders: { 'content-type': 'application/pdf' },
    });
    expect(url).toContain('https://acct12345.r2.cloudflarestorage.com/coursewise-files/');
    expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(url).toContain('X-Amz-Expires=300');
    expect(url).toContain('X-Amz-Signature=');
    expect(url).toContain('X-Amz-SignedHeaders=content-type%3Bhost');
    expect(signedHeaders).toMatchObject({
      host: 'acct12345.r2.cloudflarestorage.com',
      'content-type': 'application/pdf',
    });
    // expiresAt should be roughly 5 minutes in the future
    const diff = new Date(expiresAt).getTime() - Date.now();
    expect(diff).toBeGreaterThan(280 * 1000);
    expect(diff).toBeLessThan(320 * 1000);
  });

  it('supports custom endpoints', async () => {
    const { url } = await presignR2Url(
      { ...cfg, endpoint: 'https://files.example.com' },
      {
        method: 'GET',
        key: 'foo.pdf',
        expiresInSeconds: 60,
      },
    );
    expect(url.startsWith('https://files.example.com/coursewise-files/foo.pdf?')).toBe(true);
  });

  it('throws when not configured', async () => {
    await expect(
      presignR2Url(
        { accountId: '', accessKeyId: '', secretAccessKey: '', bucket: '' },
        { method: 'GET', key: 'x', expiresInSeconds: 60 },
      ),
    ).rejects.toThrow();
  });
});

describe('buildR2Key', () => {
  it('embeds courseId, a uuid and a sanitized filename', () => {
    const key = buildR2Key('11111111-2222-3333-4444-555555555555', 'My File (1).pdf');
    expect(key.startsWith('courses/11111111-2222-3333-4444-555555555555/')).toBe(true);
    expect(key.endsWith('My_File__1_.pdf')).toBe(true);
  });
});
