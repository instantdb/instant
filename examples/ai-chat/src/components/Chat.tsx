'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage, type UIMessageChunk } from 'ai';
import { db } from '@/lib/db';
import { id as generateId } from '@instantdb/react';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input';

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

class InstantChatTransport extends DefaultChatTransport<UIMessage> {
  async reconnectToStream(
    options: { chatId: string } & Record<string, unknown>,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    const { data } = await db.queryOnce({
      $streams: { $: { where: { chat: options.chatId } } },
    });
    const $stream = data.$streams?.[0];
    if (!$stream) return null;

    const readStream = db.streams.createReadStream({ streamId: $stream.id });
    const byteStream = readStream.pipeThrough(new TextEncoderStream());

    return this.processResponseStream(byteStream);
  }
}

function ChatInner({
  id,
  initialMessages,
}: {
  id: string;
  initialMessages: UIMessage[];
}) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const transport = useMemo(
    () =>
      new InstantChatTransport({
        api: '/api/chat',
        // Send the id of the chat and the last message
        prepareSendMessagesRequest: ({
          id,
          messages,
        }: {
          id: string;
          messages: UIMessage[];
        }) => {
          return {
            body: {
              id,
              message: messages[messages.length - 1],
            },
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, status } = useChat({
    id,
    generateId,
    messages: initialMessages,
    resume: true,
    transport,
    onError: (e) => setError(e.message || 'Something went wrong'),
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="Start a conversation"
              description="Type a message below to begin"
            />
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {message.role === 'assistant' ? (
                    <MessageResponse>{getMessageText(message)}</MessageResponse>
                  ) : (
                    getMessageText(message)
                  )}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
      </Conversation>
      {error && (
        <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-500">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="cursor-pointer font-bold hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="border-t p-4">
        <PromptInput
          onSubmit={(message) => {
            if (message.text) {
              sendMessage({
                role: 'user',
                parts: [{ type: 'text', text: message.text }],
              });
              setInput('');
            }
          }}
        >
          <PromptInputTextarea
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={isLoading} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

export function Chat({ id }: { id: string }) {
  const {
    isLoading: isLoadingData,
    error: queryError,
    data,
  } = db.useQuery({
    chats: { $: { where: { id } } },
    messages: {
      $: {
        where: { chat: id },
        order: { serverCreatedAt: 'asc' },
      },
    },
  });

  const { isLoading: isLoadingUser, error: authError, user } = db.useAuth();

  const [createError, setCreateError] = useState<string | null>(null);
  const error = queryError || authError;
  const isLoading = isLoadingUser || isLoadingData;
  const createdChatId = useRef<string | null>(null);

  // Insert the chat into the db if it doesn't already exist.
  useEffect(() => {
    if (
      !isLoading &&
      !error &&
      !data?.chats?.[0] &&
      user?.id &&
      createdChatId.current !== id
    ) {
      createdChatId.current = id;
      db.transact(db.tx.chats[id].update({}).link({ owner: user.id })).catch(
        (err) => setCreateError(err.message || 'Failed to create chat'),
      );
    }
  }, [isLoading, error, user?.id, data?.chats, id]);

  if (createError) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-red-500">
        {createError}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-red-500">
        {error.message}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
        Please log in to continue.
      </div>
    );
  }

  const messages = (data?.messages || []) as UIMessage[];

  return <ChatInner id={id} initialMessages={messages} />;
}
