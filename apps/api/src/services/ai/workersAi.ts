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

/**
 * Run one chat turn against Workers AI. Throws 503 UPSTREAM_UNAVAILABLE when
 * the binding is missing (dev env without `[ai]`, or an unauthenticated
 * `wrangler dev` proxy) or the model call fails — callers surface the
 * existing `errors.upstreamUnavailable` i18n message.
 */
export async function runWorkersAiChat(
  env: AppBindings,
  args: WorkersAiChatArgs,
): Promise<string> {
  if (!env.AI) {
    throw new ApiException(503, ERROR_CODES.UPSTREAM_UNAVAILABLE, 'Workers AI is not configured');
  }
  const model = (env.AI_CHAT_MODEL ?? DEFAULT_AI_CHAT_MODEL) as keyof AiModels;
  const messages = [
    { role: 'system', content: args.system },
    ...clampHistory(args.history).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: args.message },
  ];
  let out: unknown;
  try {
    out = await env.AI.run(model, {
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
  return clean;
}
