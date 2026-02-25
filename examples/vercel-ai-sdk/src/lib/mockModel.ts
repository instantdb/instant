import { LanguageModelV3, LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { simulateReadableStream } from 'ai';

/**
 * Creates a mock language model instance that fetches code from a stored
 * example server. Returns the model and a promise that resolves to the
 * matched prompt once the model has been called.
 */
export function createMockModel(): {
  model: LanguageModelV3;
  matchedPrompt: Promise<string>;
} {
  let resolvePrompt: (prompt: string | null) => void;
  const matchedPrompt = new Promise<string | null>((resolve) => {
    resolvePrompt = resolve;
  });

  async function fetchCode(
    prompt: Parameters<LanguageModelV3['doGenerate']>[0]['prompt'],
  ) {
    const lastMessage = prompt.at(-1);
    const userText =
      lastMessage?.role === 'user' &&
      typeof lastMessage.content[0] === 'object' &&
      'text' in lastMessage.content[0]
        ? lastMessage.content[0].text
        : 'Default prompt';

    try {
      const resp = await fetch('https://api.instantdb.com/examples/mma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userText }),
      });

      if (!resp.ok) {
        throw new Error(`Failed to fetch code: ${resp.statusText}`);
      }

      const { code, prompt: actualPrompt } = await resp.json();
      resolvePrompt(actualPrompt ?? null);
      return '```tsx\n' + code + '\n```';
    } catch (error) {
      resolvePrompt(null);
      throw error;
    }
  }

  const mockUsage = {
    inputTokens: {
      total: 0,
      noCache: 0,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 0, text: 0, reasoning: undefined },
    totalTokens: 0,
  };

  const model: LanguageModelV3 = {
    specificationVersion: 'v3',
    provider: 'mock-provider',
    modelId: 'mock-model',
    supportedUrls: {},

    doGenerate: async (
      options: Parameters<LanguageModelV3['doGenerate']>[0],
    ) => {
      const text = await fetchCode(options.prompt);

      return {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: mockUsage,
        rawCall: { rawPrompt: options.prompt, rawSettings: {} },
        warnings: [],
      };
    },

    doStream: async (options: Parameters<LanguageModelV3['doStream']>[0]) => {
      const fullText = await fetchCode(options.prompt);

      const chunks: LanguageModelV3StreamPart[] = [{ type: 'text-start', id: 'mock-text-id' }];
      const chunkSize = 20;
      for (let i = 0; i < fullText.length; i += chunkSize) {
        chunks.push({
          type: 'text-delta',
          id: 'mock-text-id',
          delta: fullText.slice(i, i + chunkSize),
        });
      }
      chunks.push({ type: 'text-end', id: 'mock-text-id' });
      chunks.push({
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: mockUsage,
      });

      return {
        stream: simulateReadableStream({
          chunks,
          chunkDelayInMs: 20,
        }),
        rawCall: { rawPrompt: options.prompt, rawSettings: {} },
      };
    },
  };

  return { model, matchedPrompt };
}
