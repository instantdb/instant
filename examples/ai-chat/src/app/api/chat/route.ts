import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  streamText,
  type LanguageModel,
  type UIMessage,
} from 'ai';
import { mockModel } from '@/lib/mockModel';

function getModel(): LanguageModel {
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic('claude-sonnet-4-6');
  }
  if (process.env.OPENAI_API_KEY) {
    return openai('gpt-4o');
  }
  return mockModel;
}
import { after, NextResponse } from 'next/server';
import { id as generateId } from '@instantdb/admin';
import { adminDb } from '@/lib/adminDb';

async function saveChat({
  id,
  messages,
  activeStreamId,
  inactiveStreamId,
}: {
  id: string;
  messages?: UIMessage[];
  activeStreamId?: string | null;
  inactiveStreamId?: string | null;
}): Promise<void> {
  const txs: Parameters<typeof adminDb.transact>[0] = [];
  if (activeStreamId) {
    txs.push(adminDb.tx.chats[id].link({ stream: activeStreamId }));
  }
  if (inactiveStreamId) {
    txs.push(adminDb.tx.chats[id].unlink({ stream: inactiveStreamId }));
  }

  if (messages) {
    for (const message of messages) {
      txs.push(
        adminDb.tx.messages[message.id]
          .update({
            role: message.role,
            parts: message.parts,
            metadata: message.metadata,
          })
          .link({ chat: id }),
      );
    }
  }

  if (txs.length) {
    await adminDb.transact(txs);
  }
}

export async function POST(req: Request) {
  const {
    message,
    id,
  }: {
    message: UIMessage | undefined;
    id: string;
  } = await req.json();

  const user = await adminDb.auth.getUserFromRequest(req);
  if (!user) return new NextResponse(null, { status: 401 });

  const { chats, messages: existingMessages } = await adminDb.query({
    chats: {
      $: { where: { id, owner: user.id } },
      stream: {},
    },
    messages: {
      $: {
        where: { chat: id },
        order: { serverCreatedAt: 'asc' },
      },
    },
  });

  const chat = chats?.[0];
  if (!chat) return new NextResponse(null, { status: 404 });
  if (!message) return new NextResponse(null, { status: 400 });

  const history = (existingMessages || []) as UIMessage[];
  const messages = [...history, message];

  // Set the chat title from the first user message
  if (!chat.title && message.role === 'user') {
    const text = message.parts
      ?.filter((p: { type: string }) => p.type === 'text')
      .map((p: { type: string; text?: string }) => p.text)
      .join('');
    if (text) {
      await adminDb.transact(
        adminDb.tx.chats[id].update({ title: text.slice(0, 60) }),
      );
    }
  }

  // Save the new user message and clear any stale active stream
  await saveChat({
    id,
    messages: [message],
    inactiveStreamId: chat.stream?.id,
  });

  const result = streamText({
    model: getModel(),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: generateId,
    onFinish: ({ messages: finalMessages }) => {
      // Save completion
      saveChat({ id, messages: finalMessages });
    },
    async consumeSseStream({ stream }) {
      const writeStream = adminDb.streams.createWriteStream({
        clientId: generateId(),
        waitUntil: after,
      });

      stream.pipeTo(writeStream).catch((err) => {
        console.error('Failed to pipe SSE stream', err);
      });

      // Link the stream to the chat so the client can find it
      const streamId = await writeStream.streamId();
      await saveChat({ id, activeStreamId: streamId });
    },
  });
}
