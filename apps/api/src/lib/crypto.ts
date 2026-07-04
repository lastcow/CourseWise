const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function randomBase62(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    const byte = bytes[i] ?? 0;
    out += BASE62_ALPHABET[byte % 62];
  }
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomUuid(): string {
  return crypto.randomUUID();
}

// AES-GCM helpers for secrets encrypted at rest (e.g. teacher Canvas tokens).
// Key: 32 bytes, base64-encoded (generate with `openssl rand -base64 32`).
// Output format: base64(iv(12 bytes) || ciphertext+tag).

function keyFromB64(keyB64: string, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  if (keyBytes.length !== 32) {
    throw new Error(`aesGcm: key must be 32 bytes, got ${keyBytes.length}`);
  }
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, [usage]);
}

export async function aesGcmEncrypt(keyB64: string, plaintext: string): Promise<string> {
  const key = await keyFromB64(keyB64, 'encrypt');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  let binary = '';
  for (const byte of out) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function aesGcmDecrypt(keyB64: string, payloadB64: string): Promise<string> {
  const key = await keyFromB64(keyB64, 'decrypt');
  const payload = Uint8Array.from(atob(payloadB64), (c) => c.charCodeAt(0));
  const iv = payload.slice(0, 12);
  const ct = payload.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plain);
}
