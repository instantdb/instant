'use client';

import { use, useEffect, useMemo } from 'react';
import { DefaultChatTransport, UIMessageChunk, type UIMessage } from 'ai';
import { Preview } from '@/components/Preview';
import Link from 'next/link';
import { db } from '@/lib/db';
import { id as generateId } from '@instantdb/react';
import { useChat } from '@ai-sdk/react';
import { extractText, getLatestAssistantCode } from '@/lib/codeUtils';

function getUserPrompt(
  messages: UIMessage[],
  dbMessages: { role: string; parts?: { text?: string }[] }[],
): string {
  const userMsg = messages.find((m) => m.role === 'user');
  if (userMsg) {
    const text = extractText(userMsg);
    if (text) return text;
  }
  const dbMsg = dbMessages.find((m) => m.role === 'user');
  const dbText = dbMsg?.parts?.[0]?.text;
  if (dbText) return dbText;
  return 'Previewing App';
}

function chatQuery(chatId: string) {
  return {
    chats: {
      $: { where: { id: chatId } },
      messages: {},
      stream: {},
    },
  };
}

class ChatTransport extends DefaultChatTransport<UIMessage> {
  async reconnectToStream({
    chatId,
  }: {
    chatId: string;
  }): Promise<ReadableStream<UIMessageChunk> | null> {
    // Use the same query as the useSuspenseQuery so that we pull it from the cache
    const { data } = await db.queryOnce(chatQuery(chatId));
    const streamId = data?.chats[0]?.stream?.id;
    if (!streamId) {
      return null;
    }
    const stream = db.streams.createReadStream({ streamId });
    const byteStream = stream.pipeThrough(new TextEncoderStream());
    return this.processResponseStream(byteStream);
  }
}

export default function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: chatId } = use(params);

  const { data } = db.useSuspenseQuery(chatQuery(chatId));

  const chat = data.chats[0];

  const transport = useMemo(() => {
    return new ChatTransport({});
  }, []);

  const { messages, resumeStream, stop, status, error, clearError } = useChat({
    id: chatId,
    messages: chat?.messages as UIMessage[],
    transport,
    generateId,
  });

  const streamId = chat?.stream?.id;

  const hasAssistantMessage = !!messages.find((m) => m.role === 'assistant');

  useEffect(() => {
    if (streamId && !hasAssistantMessage) {
      resumeStream();
    }
  }, [resumeStream, streamId, hasAssistantMessage]);

  const code = useMemo(() => getLatestAssistantCode(messages), [messages]);

  if (!chat) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="panel paper-grid p-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Chat not found</h1>
          <p className="mt-2 text-[var(--muted)]">
            This chat may have been deleted or the link is incorrect.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-xl bg-[var(--accent-2)] px-6 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
          >
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen w-full flex-col p-4 md:p-8">
      <header className="panel paper-grid relative mx-auto w-full max-w-[1280px] overflow-hidden p-6 md:p-10">
        <div className="pointer-events-none absolute -top-12 -right-8 h-32 w-32 rounded-full bg-[color-mix(in_oklab,var(--accent)_40%,transparent)] blur-2xl" />
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] font-bold tracking-[0.3em] text-[var(--muted)]/70 uppercase">
              Instant Mini-App Builder
            </p>
            <h1
              className="mt-2 truncate text-3xl font-bold tracking-tight md:text-4xl"
              title={getUserPrompt(messages, chat.messages)}
            >
              {getUserPrompt(messages, chat.messages)}
            </h1>
          </div>
          <Link
            href="/"
            className="group flex items-center gap-2 rounded-2xl border-2 border-[var(--ink)] bg-white px-6 py-3 text-sm font-bold transition hover:bg-[var(--ink)] hover:text-white"
          >
            <span className="transition-transform group-hover:-translate-x-1">
              ←
            </span>
            New Prompt
          </Link>
        </div>
      </header>

      {error && (
        <div className="mx-auto mt-4 flex w-full max-w-[1280px] items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">
          <span className="flex-1">Something went wrong: {error.message}</span>
          <button
            onClick={clearError}
            className="rounded-lg px-3 py-1 font-medium text-red-600 transition hover:bg-red-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-4 pt-4">
        <div className="panel flex min-h-[600px] flex-1 flex-col overflow-hidden shadow-2xl">
          <Preview
            rawCode={code}
            isStreaming={status === 'streaming' || status === 'submitted'}
            isPreviewReady={hasAssistantMessage}
            onStop={() => stop()}
            chatId={chatId}
            modelId={chat.modelId}
            matchedPrompt={chat.matchedPrompt}
          />
        </div>
      </section>
    </main>
  );
}
