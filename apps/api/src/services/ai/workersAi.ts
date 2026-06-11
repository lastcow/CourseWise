import type { AiChatMessage } from '@coursewise/shared';
import { ApiException, ERROR_CODES } from '../../lib/errors';
import type { AppBindings } from '../../types';

/**
 * Generic Workers AI chat engine. Business features (the material tutor
 * today, future assistants tomorrow) build their own system prompt and call
 * `runWorkersAiChat` — nothing in this file knows about materials, courses,
 * or any other domain concept, so every AI chat surface shares one engine.
 */

export const DEFAULT_AI_CHAT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const AI_CHAT_HISTORY_BUDGET_CHARS = 6_000;
export const AI_CHAT_MAX_OUTPUT_TOKENS = 800;

/**
 * Drop oldest history messages until the total content length fits the
 * budget. The most recent message always survives, even when it alone
 * exceeds the budget.
 */
export function clampHistory(
  history: AiChatMessage[],
  budgetChars: number = AI_CHAT_HISTORY_BUDGET_CHARS,
): AiChatMessage[] {
  let start = 0;
  let total = history.reduce((sum, m) => sum + m.content.length, 0);
  while (start < history.length - 1 && total > budgetChars) {
    total -= history[start]!.content.length;
    start += 1;
  }
  return history.slice(start);
}

/**
 * Defensive cleanup of model output: reasoning models (e.g. Qwen) may emit
 * `<think>…</think>` blocks that must never reach the UI.
 */
export function sanitizeReply(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export interface WorkersAiChatArgs {
  system: string;
  history: AiChatMessage[];
  message: string;
  maxTokens?: number;
  temperature?: number;
}

export interface WorkersAiUsage {
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface WorkersAiChatResult {
  reply: string;
  model: string;
  usage: WorkersAiUsage;
}

/**
 * Neurons are Cloudflare's Workers AI billing unit ($0.011 per 1,000).
 * Per-model token rates from the published USD pricing: llama-3.3-70b-fast is
 * $0.293/M input and $2.253/M output → 26,636 / 204,818 neurons per M tokens.
 * Unknown models fall back to those same rates (rough but honest for a beta
 * usage display).
 */
const NEURON_RATES: Record<string, { inPerM: number; outPerM: number }> = {
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { inPerM: 26_636, outPerM: 204_818 },
};
const FALLBACK_RATE = { inPerM: 26_636, outPerM: 204_818 };

export function estimateNeurons(
  model: string,
  promptTokens: number | null,
  completionTokens: number | null,
): number | null {
  if (promptTokens === null && completionTokens === null) return null;
  const rate = NEURON_RATES[model] ?? FALLBACK_RATE;
  const neurons =
    ((promptTokens ?? 0) / 1_000_000) * rate.inPerM +
    ((completionTokens ?? 0) / 1_000_000) * rate.outPerM;
  return Math.round(neurons * 100) / 100;
}

function readUsage(out: unknown): WorkersAiUsage {
  if (out !== null && typeof out === 'object' && 'usage' in out) {
    const u = (out as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } }).usage;
    return {
      promptTokens: typeof u?.prompt_tokens === 'number' ? u.prompt_tokens : null,
      completionTokens: typeof u?.completion_tokens === 'number' ? u.completion_tokens : null,
    };
  }
  return { promptTokens: null, completionTokens: null };
}

/**
 * Run one chat turn against Workers AI. Throws 503 UPSTREAM_UNAVAILABLE when
 * the binding is missing (dev env without `[ai]`, or an unauthenticated
 * `wrangler dev` proxy) or the model call fails — callers surface the
 * existing `errors.upstreamUnavailable` i18n message.
 */
export async function runWorkersAiChat(
  env: AppBindings,
  args: WorkersAiChatArgs,
): Promise<WorkersAiChatResult> {
  if (!env.AI) {
    throw new ApiException(503, ERROR_CODES.UPSTREAM_UNAVAILABLE, 'Workers AI is not configured');
  }
  const model = env.AI_CHAT_MODEL ?? DEFAULT_AI_CHAT_MODEL;
  const messages = [
    { role: 'system', content: args.system },
    ...clampHistory(args.history).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: args.message },
  ];
  let out: unknown;
  try {
    out = await env.AI.run(model as keyof AiModels, {
      messages,
      max_tokens: args.maxTokens ?? AI_CHAT_MAX_OUTPUT_TOKENS,
      temperature: args.temperature ?? 0.3,
    });
  } catch (err) {
    console.error('workersAi: run failed', { model, err: String(err) });
    throw new ApiException(503, ERROR_CODES.UPSTREAM_UNAVAILABLE, 'AI model call failed');
  }
  const reply =
    typeof out === 'string'
      ? out
      : out !== null && typeof out === 'object' && 'response' in out
        ? String((out as { response?: unknown }).response ?? '')
        : '';
  const clean = sanitizeReply(reply);
  if (!clean) {
    throw new ApiException(503, ERROR_CODES.UPSTREAM_UNAVAILABLE, 'AI model returned no text');
  }
  return { reply: clean, model, usage: readUsage(out) };
}
