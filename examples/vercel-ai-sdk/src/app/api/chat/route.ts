import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { adminDb } from '@/lib/adminDb';
import systemPrompt from '@/prompts/system.txt';
import { id as createId, User } from '@instantdb/core';
import { createMockModel } from '@/lib/mockModel';
import { after } from 'next/server';
import { notFound } from 'next/navigation';

export const runtime = 'nodejs';
export const maxDuration = 60;

type ChatRequest = {
  messages?: UIMessage[];
  id?: string;
  ownerId?: string;
};

function getModel() {
  const hasApiKey = !!(
    process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY
  );

  if (!hasApiKey) {
    return createMockModel();
  }

  const modelId = process.env.AI_MODEL?.trim() || 'gpt-4o';
  if (modelId.startsWith('claude')) {
    return { model: anthropic(modelId), matchedPrompt: null };
  }
  return { model: openai(modelId), matchedPrompt: null };
}

async function saveChat(chatId: string, user: User, messages: UIMessage[]) {
  const data = await adminDb.query({
    chats: {
      $: {
        where: {
          id: chatId,
          // Ensures that only the user who created the chat can trigger
          // the message endpoint for it.
          owner: user.id,
        },
      },
      messages: {},
    },
  });

  const chat = data.chats[0];

  if (!chat) {
    notFound();
  }

  const txes = [];
  for (let i = 0; i < messages.length; i++) {
    if (chat.messages[i]) continue;
    const msg = messages[i];

    txes.push(
      adminDb.tx.messages[msg.id]
        .create({
          createdAt: Date.now(),
          role: msg.role,
          parts: msg.parts,
          order: i,
        })
        .link({ chat: chatId }),
    );
  }
  if (txes.length) {
    await adminDb.transact(txes);
  }
}

export async function POST(request: Request) {
  const user = await adminDb.auth.getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as ChatRequest;
  const { messages = [], id: chatId } = body;

  if (messages.length === 0 || !chatId) {
    return Response.json(
      { error: 'Missing messages or chatId.' },
      { status: 400 },
    );
  }

  await saveChat(chatId, user, messages);

  const { model, matchedPrompt } = getModel();

  await adminDb.transact(
    adminDb.tx.chats[chatId].update({ modelId: model.modelId }),
  );

  const result = streamText({
    model,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
  });

  // Write the matched prompt before returning the response so
  // the client has it immediately when loading the chat page.
  if (matchedPrompt) {
    const prompt = await matchedPrompt;
    await adminDb.transact(
      adminDb.tx.chats[chatId].update({ matchedPrompt: prompt }),
    );
  }

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: createId,
    onFinish: async ({ messages }) => {
      await saveChat(chatId, user, messages);
    },
    consumeSseStream: async ({ stream: sseStream }) => {
      const writeStream = adminDb.streams.createWriteStream({
        clientId: createId(),
        waitUntil: after,
      });
      sseStream.pipeTo(writeStream).catch((err) => {
        console.error('Failed to pipe SSE stream', err);
      });
      // Wait for the server to create the stream and assign it
      // a streamId, then link it to the chat
      const streamId = await writeStream.streamId();
      await adminDb.transact(
        adminDb.tx.$streams[streamId].link({ chat: chatId }),
      );
    },
  });
}
