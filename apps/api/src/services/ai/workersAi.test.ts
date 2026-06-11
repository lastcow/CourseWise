import { describe, expect, it } from 'vitest';
import type { AiChatMessage } from '@coursewise/shared';
import { ApiException } from '../../lib/errors';
import type { AppBindings } from '../../types';
import {
  clampHistory,
  runWorkersAiChat,
  sanitizeReply,
} from './workersAi';

const baseEnv = {} as AppBindings;

function msg(role: 'user' | 'assistant', content: string): AiChatMessage {
  return { role, content };
}

describe('clampHistory', () => {
  it('keeps everything under budget', () => {
    const h = [msg('user', 'a'), msg('assistant', 'b')];
    expect(clampHistory(h, 100)).toEqual(h);
  });

  it('drops oldest messages first', () => {
    const h = [msg('user', 'x'.repeat(60)), msg('assistant', 'y'.repeat(30)), msg('user', 'z'.repeat(30))];
    const out = clampHistory(h, 70);
    expect(out).toEqual([h[1], h[2]]);
  });

  it('always keeps the most recent message even when it alone exceeds budget', () => {
    const h = [msg('user', 'old'), msg('assistant', 'w'.repeat(500))];
    const out = clampHistory(h, 10);
    expect(out).toEqual([h[1]]);
  });
});

describe('sanitizeReply', () => {
  it('strips <think> blocks and trims', () => {
    expect(sanitizeReply('<think>internal\nreasoning</think>\n  Hello!  ')).toBe('Hello!');
  });

  it('passes plain replies through', () => {
    expect(sanitizeReply('Plain answer')).toBe('Plain answer');
  });
});

describe('runWorkersAiChat', () => {
  it('throws 503 when the AI binding is missing', async () => {
    await expect(
      runWorkersAiChat(baseEnv, { system: 's', history: [], message: 'hi' }),
    ).rejects.toMatchObject({ status: 503, code: 'UPSTREAM_UNAVAILABLE' });
  });

  it('returns the sanitized response text and passes messages through', async () => {
    let captured: unknown;
    const env = {
      AI: {
        run: async (_model: unknown, opts: unknown) => {
          captured = opts;
          return { response: '<think>x</think>The answer.' };
        },
      },
    } as unknown as AppBindings;
    const reply = await runWorkersAiChat(env, {
      system: 'SYS',
      history: [msg('user', 'q1'), msg('assistant', 'a1')],
      message: 'q2',
    });
    expect(reply).toBe('The answer.');
    const o = captured as { messages: Array<{ role: string; content: string }> };
    expect(o.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(o.messages[0]?.content).toBe('SYS');
    expect(o.messages[3]?.content).toBe('q2');
  });

  it('maps a model failure to 503', async () => {
    const env = {
      AI: {
        run: async () => {
          throw new Error('capacity');
        },
      },
    } as unknown as AppBindings;
    await expect(
      runWorkersAiChat(env, { system: 's', history: [], message: 'hi' }),
    ).rejects.toBeInstanceOf(ApiException);
  });

  it('treats an empty response as 503', async () => {
    const env = {
      AI: { run: async () => ({ response: '' }) },
    } as unknown as AppBindings;
    await expect(
      runWorkersAiChat(env, { system: 's', history: [], message: 'hi' }),
    ).rejects.toMatchObject({ status: 503 });
  });
});
