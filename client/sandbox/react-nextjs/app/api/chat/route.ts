import { streamText, simulateReadableStream } from 'ai';
import { createResumableStreamContext } from 'resumable-stream/generic';
import { after } from 'next/server';
import { getFilePubSub } from '../../../lib/file-pubsub';

const thinkingPhrases = [
  'Hmm, let me think about that...',
  'Interesting point!',
  'You know what, that reminds me...',
  'Actually, wait...',
  'Oh, I see what you mean!',
  'Let me elaborate on that...',
  "Here's another way to look at it:",
  'But have you considered...',
  'To put it another way...',
  'In conclusion...',
];

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generateResponse(userMessage: string): string[] {
  const responses: string[] = [];
  const phrases = shuffle(thinkingPhrases);

  responses.push(`You said: "${userMessage}"\n\n`);

  responses.push(`${phrases[0]} `);
  responses.push(`${userMessage.split('').reverse().join('')}\n\n`);

  responses.push(`${phrases[1]} `);
  responses.push(`That's ${userMessage.length} characters long.\n\n`);

  responses.push(`${phrases[2]} `);
  const words = userMessage.split(/\s+/);
  responses.push(
    `You used ${words.length} word${words.length !== 1 ? 's' : ''}.\n\n`
  );

  responses.push(`${phrases[3]} `);
  responses.push(`In uppercase: ${userMessage.toUpperCase()}\n\n`);

  responses.push(`${phrases[4]} `);
  responses.push(`In lowercase: ${userMessage.toLowerCase()}\n\n`);

  responses.push(`${phrases[5]} `);
  const vowels = (userMessage.match(/[aeiou]/gi) || []).length;
  responses.push(
    `I count ${vowels} vowel${vowels !== 1 ? 's' : ''} in there.\n\n`
  );

  responses.push(`${phrases[6]} `);
  responses.push(`"${words.reverse().join(' ')}"\n\n`);

  responses.push(`${phrases[9]} `);
  responses.push(`I've successfully echoed your message in 7 different ways! 🎉`);

  return responses;
}

// Create resumable stream context with file-based pubsub
function getStreamContext() {
  const { publisher, subscriber } = getFilePubSub();

  return createResumableStreamContext({
    waitUntil: after,
    publisher,
    subscriber,
  });
}

export async function POST(req: Request) {
  const { messages, id: chatId } = await req.json();

  const lastMessage = messages[messages.length - 1];
  const userMessage = lastMessage?.content || '';
  const responseChunks = generateResponse(userMessage);

  // Generate a unique stream ID based on chat ID and message count
  const streamId = `${chatId}-${messages.length}`;

  const result = streamText({
    model: {
      specificationVersion: 'v1',
      provider: 'echo',
      modelId: 'echo-1',
      defaultObjectGenerationMode: undefined,
      doGenerate: async () => {
        throw new Error('Not implemented');
      },
      doStream: async () => {
        const chunks: Array<{ type: 'text-delta'; textDelta: string }> = [];

        for (const response of responseChunks) {
          for (const char of response) {
            chunks.push({ type: 'text-delta' as const, textDelta: char });
          }
          for (let i = 0; i < 30; i++) {
            chunks.push({ type: 'text-delta' as const, textDelta: '' });
          }
        }

        return {
          stream: simulateReadableStream({
            chunks,
            chunkDelayInMs: 25,
          }),
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      },
    },
    messages,
  });

  const streamContext = getStreamContext();
  const { publisher } = getFilePubSub();

  // Initialize stream content storage
  // We store both raw stream data and parsed text content
  await publisher.set(`stream-raw:${streamId}`, '');
  await publisher.set(`stream-text:${streamId}`, '');
  await publisher.set(`stream-complete:${streamId}`, 'false');

  // Create a resumable stream that wraps the AI response
  const resumableStream = await streamContext.createNewResumableStream(
    streamId,
    () => {
      const dataStream = result.toDataStream();

      // Create a transform stream to capture content as it flows through
      let accumulatedRaw = '';
      let accumulatedText = '';
      const captureTransform = new TransformStream({
        async transform(chunk, controller) {
          const raw =
            typeof chunk === 'string'
              ? chunk
              : new TextDecoder().decode(chunk);
          accumulatedRaw += raw;

          // Parse text content from AI SDK format (lines starting with 0:)
          const lines = raw.split('\n');
          for (const line of lines) {
            if (line.startsWith('0:')) {
              try {
                const text = JSON.parse(line.slice(2));
                if (typeof text === 'string') {
                  accumulatedText += text;
                }
              } catch {
                // Ignore parse errors
              }
            }
          }

          await publisher.set(`stream-raw:${streamId}`, accumulatedRaw);
          await publisher.set(`stream-text:${streamId}`, accumulatedText);
          controller.enqueue(chunk);
        },
        async flush() {
          await publisher.set(`stream-complete:${streamId}`, 'true');
        },
      });

      return dataStream.pipeThrough(captureTransform);
    }
  );

  return new Response(resumableStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Stream-Id': streamId,
    },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const streamId = url.searchParams.get('streamId');
  const position = parseInt(url.searchParams.get('position') || '0', 10);

  if (!streamId) {
    return new Response('Missing streamId', { status: 400 });
  }

  try {
    const { subscriber } = getFilePubSub();

    // Get stored text content (parsed, not raw stream format)
    const storedText = (await subscriber.get(`stream-text:${streamId}`)) as string | null;
    const isComplete = (await subscriber.get(`stream-complete:${streamId}`)) === 'true';

    if (storedText === null) {
      return new Response('Stream not found', { status: 404 });
    }

    // Get text content from the client's position
    const remainingText = storedText.slice(position);

    if (isComplete) {
      // Stream is done, return remaining text as plain text
      return new Response(JSON.stringify({ text: remainingText, complete: true }), {
        headers: {
          'Content-Type': 'application/json',
          'X-Stream-Id': streamId,
        },
      });
    }

    // Stream is still active - return what we have and set up polling
    // Return current remaining text, client will poll again
    return new Response(JSON.stringify({ text: remainingText, complete: false }), {
      headers: {
        'Content-Type': 'application/json',
        'X-Stream-Id': streamId,
      },
    });
  } catch (error) {
    console.error('[GET] Error resuming stream:', error);
    return new Response('Error resuming stream', { status: 500 });
  }
}
