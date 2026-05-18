import type { AiProviderKind } from '@coursewise/shared';
import type { AppBindings } from '../../types';

/**
 * Phase 1: URL composition + auth header helpers only. Actual LLM request
 * shapes (messages / completions / tool use) land with the generators in
 * Phase 2.
 *
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
 * Provider-specific request header builders. Phase 2's generators will call
 * these when issuing chat/messages requests via the gateway.
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
