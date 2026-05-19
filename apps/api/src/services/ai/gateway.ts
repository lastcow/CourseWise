import type { AiProviderKind } from '@coursewise/shared';
import type { AppBindings } from '../../types';

/**
 * AI Gateway URL shape:
 *   https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayId}/{provider}/...
 *
 * The account id + gateway id are non-secret bindings on the Worker; the
 * upstream provider's API key is a Worker secret looked up by `apiKeySecretRef`.
 */

export interface GatewayConfig {
  accountId: string;
  gatewayId: string;
}

export class GatewayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayConfigError';
  }
}

export function readGatewayConfig(env: AppBindings): GatewayConfig {
  const accountId = env.AI_GATEWAY_ACCOUNT_ID?.trim();
  const gatewayId = env.AI_GATEWAY_ID?.trim();
  if (!accountId || !gatewayId) {
    throw new GatewayConfigError(
      'AI Gateway is not configured: set AI_GATEWAY_ACCOUNT_ID and AI_GATEWAY_ID.',
    );
  }
  return { accountId, gatewayId };
}

export function gatewayBaseUrl(cfg: GatewayConfig, provider: AiProviderKind): string {
  return `https://gateway.ai.cloudflare.com/v1/${cfg.accountId}/${cfg.gatewayId}/${provider}`;
}

export function readProviderApiKey(env: AppBindings, apiKeySecretRef: string): string | null {
  // The Worker secret is exposed on the env object under the same name the
  // admin recorded as the secret ref. We treat the env type as a generic record
  // for this lookup since secrets are dynamic.
  const value = (env as unknown as Record<string, string | undefined>)[apiKeySecretRef];
  return value && value.length > 0 ? value : null;
}

export function hasProviderSecret(env: AppBindings, apiKeySecretRef: string): boolean {
  return readProviderApiKey(env, apiKeySecretRef) !== null;
}

/**
 * Provider-specific request header builders.
 */
export function buildAuthHeaders(provider: AiProviderKind, apiKey: string): HeadersInit {
  if (provider === 'anthropic') {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };
  }
  // openai
  return {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
  };
}

// ---------- Anthropic adapter ----------

export interface AnthropicUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface AnthropicCallParams {
  env: AppBindings;
  provider: { kind: 'anthropic'; apiKeySecretRef: string };
  model: string;
  /**
   * System prompt split into parts so the large, course-wide portion can be
   * marked cacheable while the per-artifact instructions are not. Caching is
   * a win whenever we make N>=2 calls with the same context.
   */
  system: { cacheable: string; instructions?: string };
  userMessage: string;
  maxTokens: number;
  /** Hard ceiling on the whole request. */
  timeoutMs?: number;
}

export interface AnthropicCallResult {
  text: string;
  usage: AnthropicUsage;
  stopReason: string | null;
}

export class GatewayCallError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'GatewayCallError';
  }
}

export async function callAnthropic(params: AnthropicCallParams): Promise<AnthropicCallResult> {
  const cfg = readGatewayConfig(params.env);
  const apiKey = readProviderApiKey(params.env, params.provider.apiKeySecretRef);
  if (!apiKey) {
    throw new GatewayConfigError(
      `Provider secret ${params.provider.apiKeySecretRef} is not bound to the Worker.`,
    );
  }

  const url = `${gatewayBaseUrl(cfg, 'anthropic')}/v1/messages`;
  const systemBlocks: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text: params.system.cacheable,
      cache_control: { type: 'ephemeral' },
    },
  ];
  if (params.system.instructions) {
    systemBlocks.push({ type: 'text', text: params.system.instructions });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 120_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: buildAuthHeaders('anthropic', apiKey),
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens,
        system: systemBlocks,
        messages: [{ role: 'user', content: params.userMessage }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GatewayCallError(`Anthropic call failed: ${res.status}`, res.status, body);
  }

  const json = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
    usage: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    stop_reason?: string | null;
  };

  const text = json.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');

  return {
    text,
    usage: {
      inputTokens: json.usage.input_tokens ?? 0,
      outputTokens: json.usage.output_tokens ?? 0,
      cacheReadTokens: json.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: json.usage.cache_creation_input_tokens ?? 0,
    },
    stopReason: json.stop_reason ?? null,
  };
}

/**
 * Rough cost estimator in integer cents, given $/1M token prices from the model
 * row. Returns 0 when either price is unset. Cached input tokens are billed
 * at ~10% of the full input rate.
 */
export function estimateCostCents(
  usage: AnthropicUsage,
  costInPer1m: number | null,
  costOutPer1m: number | null,
): number {
  if (costInPer1m == null || costOutPer1m == null) return 0;
  const inputDollars = ((usage.inputTokens + usage.cacheCreationTokens) / 1_000_000) * costInPer1m;
  const cacheReadDollars = (usage.cacheReadTokens / 1_000_000) * costInPer1m * 0.1;
  const outputDollars = (usage.outputTokens / 1_000_000) * costOutPer1m;
  return Math.round((inputDollars + cacheReadDollars + outputDollars) * 100);
}
