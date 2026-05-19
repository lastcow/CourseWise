import type {
  GammaExportFormat,
  GammaImageSource,
  GammaTextAmount,
  GammaTheme,
} from '@coursewise/shared';
import { ApiException, ERROR_CODES } from '../../lib/errors';

const BASE_URL = 'https://public-api.gamma.app/v1.0';

export interface GammaCreateGenerationInput {
  inputText: string;
  format: 'presentation';
  exportAs: GammaExportFormat;
  title?: string;
  themeId?: string | null;
  additionalInstructions?: string | null;
  textOptions?: { amount?: GammaTextAmount };
  imageOptions?: { source?: GammaImageSource; style?: string | null };
}

export interface GammaCreateGenerationResponse {
  generationId: string;
  warnings?: string | null;
}

export type GammaGetGenerationResponse =
  | {
      generationId: string;
      status: 'pending';
    }
  | {
      generationId: string;
      status: 'completed';
      gammaUrl: string;
      exportUrl: string;
      gammaId?: string;
      credits?: { deducted?: number; remaining?: number };
    }
  | {
      generationId: string;
      status: 'failed';
      error?: { message?: string; statusCode?: number };
    };

/**
 * Tiny wrapper around Gamma's public REST API (https://public-api.gamma.app/v1.0).
 * Uses the native `fetch` so it works in the Cloudflare Workers runtime; no SDK
 * is pulled in. Non-2xx responses become an `ApiException`; we map most upstream
 * failures to a 502 so callers can distinguish them from our own bugs, but
 * propagate 401/402/403 unchanged because the user (or the operator) can act on
 * those directly.
 */
export class GammaClient {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('GammaClient: apiKey is required');
  }

  async createGeneration(
    input: GammaCreateGenerationInput,
  ): Promise<GammaCreateGenerationResponse> {
    return this.request<GammaCreateGenerationResponse>('POST', '/generations', input);
  }

  async getGeneration(generationId: string): Promise<GammaGetGenerationResponse> {
    return this.request<GammaGetGenerationResponse>(
      'GET',
      `/generations/${generationId}`,
    );
  }

  async listThemes(): Promise<GammaTheme[]> {
    const raw = await this.request<{ themes?: unknown[] } | unknown[]>('GET', '/themes');
    const arr = Array.isArray(raw)
      ? raw
      : Array.isArray(raw.themes)
        ? raw.themes
        : [];
    const out: GammaTheme[] = [];
    for (const t of arr) {
      const o = t as Record<string, unknown>;
      const id = typeof o.id === 'string' ? o.id : null;
      const name = typeof o.name === 'string' ? o.name : id;
      if (!id || !name) continue;
      out.push({
        id,
        name,
        previewUrl: typeof o.previewUrl === 'string' ? o.previewUrl : null,
      });
    }
    return out;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'X-API-KEY': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      const code =
        res.status === 402
          ? ERROR_CODES.CONFLICT
          : res.status === 401 || res.status === 403
            ? ERROR_CODES.FORBIDDEN
            : ERROR_CODES.INTERNAL_ERROR;
      // Propagate caller-actionable statuses verbatim; map everything else to a
      // 502 so the caller can tell "Gamma broke" apart from "we broke".
      const status =
        res.status === 401 || res.status === 402 || res.status === 403
          ? res.status
          : 502;
      throw new ApiException(
        status,
        code,
        `Gamma API ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }
}
