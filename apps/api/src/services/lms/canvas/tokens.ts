import { aesGcmDecrypt, aesGcmEncrypt } from '../../../lib/crypto';
import { ApiException, ERROR_CODES } from '../../../lib/errors';
import type { AppBindings } from '../../../types';

function encKeyOr500(env: AppBindings): string {
  if (!env.CANVAS_TOKEN_ENC_KEY) {
    throw new ApiException(
      500,
      ERROR_CODES.INTERNAL_ERROR,
      'CANVAS_TOKEN_ENC_KEY is not configured on this Worker',
    );
  }
  return env.CANVAS_TOKEN_ENC_KEY;
}

// The plaintext token exists only in-memory at validate/call time; it is never
// persisted, logged, or included in API responses (the UI sees tokenLast4).
export async function encryptCanvasToken(
  env: AppBindings,
  plaintext: string,
): Promise<{ tokenEnc: string; tokenLast4: string }> {
  const tokenEnc = await aesGcmEncrypt(encKeyOr500(env), plaintext);
  return { tokenEnc, tokenLast4: plaintext.slice(-4) };
}

export async function decryptCanvasToken(env: AppBindings, tokenEnc: string): Promise<string> {
  return aesGcmDecrypt(encKeyOr500(env), tokenEnc);
}
