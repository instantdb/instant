import { LanguageModelV3, LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { simulateReadableStream } from 'ai';
import { NodeHtmlMarkdown } from 'node-html-markdown';

const wikiHeaders = {
  'User-Agent': 'InstantDB-ChatExample/1.0 (https://instantdb.com)',
};

async function fetchJson(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { cache: 'no-store', headers: wikiHeaders });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Wikipedia API error ${res.status}`);
    return res.json();
  }
  throw new Error('Wikipedia API rate limited after retries');
}

async function getRandomWikipediaArticle(): Promise<{
  title: string;
  text: string;
}> {
  // Pick a random Good Article by jumping to a random alphabetical position
  const randomPrefix = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const data = (await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=Category:Good_articles&gcmnamespace=0&gcmlimit=1&gcmstartsortkeyprefix=${randomPrefix}&prop=extracts&origin=*`,
  )) as {
    query: { pages: Record<string, { title?: string; extract?: string }> };
  };
  const page = Object.values(data.query.pages)[0];
  const title = page.title || 'Unknown';
  let text = page.extract ? NodeHtmlMarkdown.translate(page.extract) : title;

  // Strip empty sections (heading followed immediately by another heading or end of text)
  text = text.replace(/\n#{1,3} .+\n(?=\n#{1,3} |\s*$)/g, '');

  // Strip References/See also/External links and everything after
  text = text
    .replace(
      /\n#{1,3} (References|See also|External links|Notes|Further reading)\b[\s\S]*$/i,
      '',
    )
    .trimEnd();

  return { title, text };
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

export const mockModel: LanguageModelV3 = {
  specificationVersion: 'v3',
  provider: 'mock-wikipedia',
  modelId: 'random-article',
  supportedUrls: {},

  doGenerate: async () => {
    const { title, text } = await getRandomWikipediaArticle();
    const fullText = `Add an \`OPENAI_API_KEY\` or \`ANTHROPIC_API_KEY\` environment variable to use a real model.\n\nIn the meantime, enjoy this Wikipedia article about **${title}**:\n\n${text}`;
    return {
      content: [{ type: 'text', text: fullText }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: mockUsage,
      warnings: [],
    };
  },

  doStream: async () => {
    const { title, text } = await getRandomWikipediaArticle();
    const fullText = `Add an \`OPENAI_API_KEY\` or \`ANTHROPIC_API_KEY\` environment variable to use a real model.\n\nIn the meantime, enjoy this Wikipedia article about **${title}**:\n\n${text}`;

    const chunks: LanguageModelV3StreamPart[] = [
      { type: 'text-start', id: 'mock-text-id' },
    ];
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
        chunkDelayInMs: 30,
      }),
    };
  },
};
