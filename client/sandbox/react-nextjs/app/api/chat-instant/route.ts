import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  UIMessage,
} from 'ai';
import { init, i } from '@instantdb/admin';
import { getFilePubSub } from '../../../lib/file-pubsub';

const schema = i.schema({ entities: {} });

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
    `You used ${words.length} word${words.length !== 1 ? 's' : ''}.\n\n`,
  );
  responses.push(`${phrases[3]} `);
  responses.push(`In uppercase: ${userMessage.toUpperCase()}\n\n`);
  responses.push(`${phrases[4]} `);
  responses.push(`In lowercase: ${userMessage.toLowerCase()}\n\n`);
  responses.push(`${phrases[5]} `);
  const vowels = (userMessage.match(/[aeiou]/gi) || []).length;
  responses.push(
    `I count ${vowels} vowel${vowels !== 1 ? 's' : ''} in there.\n\n`,
  );
  responses.push(`${phrases[6]} `);
  responses.push(`"${words.reverse().join(' ')}"\n\n`);
  responses.push(`${phrases[9]} `);
  responses.push(
    `I've successfully echoed your message in 7 different ways! 🎉`,
  );

  return responses;
}

function getMessageText(message: UIMessage): string {
  if (!message.parts) return '';
  return message.parts
    .filter(
      (part): part is { type: 'text'; text: string } => part.type === 'text',
    )
    .map((part) => part.text)
    .join('');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  const {
    messages,
    id: chatId,
    appId,
    adminToken,
    apiURI,
  }: {
    messages: UIMessage[];
    id: string;
    appId: string;
    adminToken: string;
    apiURI: string;
  } = await req.json();

  const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
  const userMessage = lastUserMessage ? getMessageText(lastUserMessage) : '';
  const responseChunks = generateResponse(userMessage);
  const textId = generateId();

  const db = init({ appId, adminToken, apiURI, schema, verbose: true });
  const { publisher } = getFilePubSub();

  const stream = createUIMessageStream({
    generateId,
    async execute({ writer }) {
      writer.write({ type: 'text-start', id: textId });

      for (const response of responseChunks) {
        for (const char of response) {
          writer.write({ type: 'text-delta', id: textId, delta: char });
          await delay(25);
        }
        await delay(100);
      }

      writer.write({ type: 'text-end', id: textId });
    },
    onFinish: async () => {
      await publisher.set(`instant-chat:${chatId}:activeStreamId`, '');
    },
  });

  return createUIMessageStreamResponse({
    stream,
    async consumeSseStream({ stream: sseStream }) {
      // Store credentials so the reconnect endpoint can use them
      await publisher.set(
        `instant-chat:${chatId}:config`,
        JSON.stringify({ appId, adminToken, apiURI }),
      );

      const streamId = generateId();

      await publisher.set(`instant-chat:${chatId}:activeStreamId`, streamId);

      const writeStream = db.streams.createWriteStream({ clientId: streamId });

      await sseStream.pipeTo(writeStream);
    },
  });
}
