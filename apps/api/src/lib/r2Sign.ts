// Cloudflare R2 supports the S3 SigV4 query-string presigned URL scheme. This
// is a minimal hand-rolled signer so we don't pull in the AWS SDK (the SDK adds
// ~1MB to the Worker bundle and trips Workers compatibility constraints).
//
// Specification: AWS Signature Version 4 — Authenticating Requests by Using
// Query Parameters.

const REGION = 'auto'; // R2 uses "auto"
const SERVICE = 's3';
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
const ALGO = 'AWS4-HMAC-SHA256';

export interface R2SignerConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Custom endpoint, e.g. https://files.example.com . Defaults to R2 default. */
  endpoint?: string;
}

export interface PresignOptions {
  method: 'PUT' | 'GET' | 'DELETE' | 'HEAD';
  key: string;
  expiresInSeconds: number;
  /**
   * Headers that the client will send as part of the request. Their values are
   * NOT included in the query string but their names are part of the
   * `X-Amz-SignedHeaders` set, and the client MUST send them at request time
   * with the same values.
   */
  signedHeaders?: Record<string, string>;
  /**
   * Extra query parameters that should be added before signing (e.g. response
   * content-disposition for GET URLs).
   */
  extraQuery?: Record<string, string>;
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeKey(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeRfc3986(segment))
    .join('/');
}

async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signingKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secret}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  return kSigning;
}

export function r2DefaultEndpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export interface PresignResult {
  url: string;
  expiresAt: string;
  signedHeaders: Record<string, string>;
}

export async function presignR2Url(
  config: R2SignerConfig,
  opts: PresignOptions,
): Promise<PresignResult> {
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucket) {
    throw new Error('R2 signer is not configured');
  }
  const endpoint = (config.endpoint ?? r2DefaultEndpoint(config.accountId)).replace(/\/$/, '');
  const host = new URL(endpoint).host;
  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, '')
    .replace(/(\d{8})(T\d{6})Z?/, '$1$2Z');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;

  const headerEntries = Object.entries({ host, ...(opts.signedHeaders ?? {}) }).map(
    ([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')] as const,
  );
  headerEntries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const signedHeaderNames = headerEntries.map(([k]) => k).join(';');
  const canonicalHeaders = headerEntries.map(([k, v]) => `${k}:${v}\n`).join('');

  const query: Record<string, string> = {
    'X-Amz-Algorithm': ALGO,
    'X-Amz-Credential': `${config.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(opts.expiresInSeconds),
    'X-Amz-SignedHeaders': signedHeaderNames,
    ...(opts.extraQuery ?? {}),
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(query[k] ?? '')}`)
    .join('&');

  const canonicalUri = `/${config.bucket}/${encodeKey(opts.key)}`;
  const canonicalRequest = [
    opts.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaderNames,
    UNSIGNED_PAYLOAD,
  ].join('\n');

  const stringToSign = [ALGO, amzDate, credentialScope, await sha256Hex(canonicalRequest)].join(
    '\n',
  );

  const sk = await signingKey(config.secretAccessKey, dateStamp, REGION, SERVICE);
  const signature = bufToHex(await hmac(sk, stringToSign));

  const finalQuery = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  const url = `${endpoint}${canonicalUri}?${finalQuery}`;
  const expiresAt = new Date(now.getTime() + opts.expiresInSeconds * 1000).toISOString();
  return {
    url,
    expiresAt,
    signedHeaders: Object.fromEntries(headerEntries),
  };
}

export interface R2ClientLike {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Helper to build a per-course R2 key.
 */
export function buildR2Key(courseId: string, fileName: string): string {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
  return `courses/${courseId}/${crypto.randomUUID()}/${safeName}`;
}
