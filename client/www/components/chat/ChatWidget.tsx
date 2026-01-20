'use client';

import { Dialog } from '@instantdb/components';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import React, { Fragment, useEffect, useState } from 'react';
import { id } from '@instantdb/core';
import useLocalStorage from '@/lib/hooks/useLocalStorage';
import db from '@/lib/intern/docs-feedback/db';
import {
  PaperAirplaneIcon,
  XMarkIcon,
  PlusIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
} from '@heroicons/react/24/outline';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '../ai-elements/conversation';
import {
  BookIcon,
  CopyIcon,
  MessageSquareIcon,
  RefreshCcwIcon,
} from 'lucide-react';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '../ai-elements/message';
import clsx from 'clsx';
import { ChatHistory } from './ChatHistory';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui';
import { Loader } from '../ai-elements/loader';
import { type DocsUIMessage } from 'app/api/chat/route';
import Link from 'next/link';
import { useAuthToken } from '@/lib/auth';

interface ChatWidgetProps {
  onClose: () => void;
  isOpen: boolean;
  forceModal: boolean;
  setForceModal: (value: boolean) => void;
}

// Breakpoint for switching between sidebar and modal (matches Tailwind's md)
const MD_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < MD_BREAKPOINT);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  return isMobile;
}

const LoggedOutEmptyState: React.FC = () => (
  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
    <div className="text-gray-400">
      <MessageSquareIcon className="size-12" />
    </div>
    <div className="space-y-2">
      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
        Sign in to chat
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Sign in to ask questions about Instant and get AI-powered help with the
        docs.
      </p>
    </div>
    <Link
      href="/dash"
      className="inline-flex items-center rounded-md bg-[#F54A00] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#d94000]"
    >
      Sign in
    </Link>
  </div>
);

export const ChatWidget: React.FC<ChatWidgetProps> = ({
  isOpen,
  onClose = () => {},
  forceModal,
  setForceModal,
}) => {
  const isMobile = useIsMobile();
  const localId = db.useLocalId('feedback');

  const authToken = useAuthToken();

  const [defaultChatId] = useState(() => id());
  const [chatId, setChatId] = useLocalStorage(
    'docs_chat_id',
    defaultChatId,
    true,
  );

  const newChat = () => {
    setChatId(id());
  };

  const { data } = db.useQuery(
    chatId && localId && authToken
      ? {
          chats: {
            $: {
              where: {
                id: chatId,
              },
            },
            messages: {
              $: {
                order: {
                  index: 'asc',
                },
              },
            },
          },
        }
      : null,
    {
      ruleParams: {
        localId: localId,
      },
    },
  );

  if (!localId) {
    return null;
  }

  const chat = data?.chats[0];

  const showModal = isMobile || forceModal;

  const chatHeader = (
    <div className="flex items-center justify-between border-b px-4 py-3">
      <h2 className="font-semibold text-gray-900">Chat with AI</h2>
      <div className="flex items-center gap-1">
        {authToken && (
          <>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={newChat}
                    className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
                    aria-label="New chat"
                  >
                    <PlusIcon className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>New chat</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <ChatHistory
              localId={localId}
              currentChatId={chatId}
              onSelectChat={setChatId}
            />
          </>
        )}
        {!isMobile && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setForceModal(!forceModal)}
                  className="cursor-pointer rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
                  aria-label={forceModal ? 'Dock to sidebar' : 'Pop out'}
                >
                  {forceModal ? (
                    <ArrowsPointingInIcon className="h-5 w-5" />
                  ) : (
                    <ArrowsPointingOutIcon className="h-5 w-5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{forceModal ? 'Dock to sidebar' : 'Pop out'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <button
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
          aria-label="Close chat"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  const chatContent = authToken ? (
    <InnerChat
      authToken={authToken}
      key={chat?.id || chatId}
      localId={localId}
      chatId={chat?.id || chatId}
      initialMessages={
        chat?.messages.length && chat.id === chatId
          ? chat.messages
          : ([] as any)
      }
      isOpen={isOpen}
    />
  ) : (
    <LoggedOutEmptyState />
  );

  // Mobile or forced modal: use modal dialog
  if (showModal) {
    return (
      <Dialog
        title="Chat with AI"
        onClose={onClose}
        open={isOpen}
        hideCloseButton
        className={clsx(
          '!grid-rows-[auto_1fr] !gap-0 !overflow-hidden !p-0',
          isMobile
            ? '!h-[80vh] !w-[calc(100%-2rem)]'
            : '!h-[80vh] !w-[calc(100%-4rem)] !max-w-4xl',
        )}
      >
        {chatHeader}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {chatContent}
        </div>
      </Dialog>
    );
  }

  // Desktop: use sidebar
  return (
    <aside
      className={clsx(
        'fixed top-14 right-0 bottom-0 z-20 w-96 border-l bg-white 2xl:w-[500px] dark:border-neutral-700 dark:bg-neutral-800',
        'flex flex-col',
        'transform transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      {chatHeader}
      <div className="flex min-h-0 flex-1 flex-col">{chatContent}</div>
    </aside>
  );
};

const customAiFetch = async (
  url: RequestInfo | URL,
  opts: RequestInit | undefined,
) => {
  const response = await fetch(url, opts);
  if (response.status === 429) {
    throw new Error('Rate limit exceeded.');
  }
  if (response.status === 401) {
    throw new Error('You must be logged in to chat.');
  }
  if (!response.ok) {
    throw new Error('Something went wrong.');
  }
  return response;
};

const ReadFileMessage: React.FC<{ file: string }> = (props) => {
  const url = window.location.origin + '/docs/' + props.file.replace('.md', '');

  return (
    <Link href={url} className="w-fit">
      <div className="flex w-fit items-center gap-1 rounded border bg-gray-50 p-1 px-2 text-sm text-gray-700 opacity-70 dark:border-neutral-500 dark:bg-neutral-600 dark:text-white/70">
        <BookIcon width={12} />
        <span>
          <span className="font-bold">{props.file}</span>
        </span>
      </div>
    </Link>
  );
};

const InnerChat: React.FC<{
  chatId: string;
  initialMessages: DocsUIMessage[];
  isOpen: boolean;
  localId: string;
  authToken: string;
}> = ({ chatId, initialMessages, isOpen, localId, authToken }) => {
  const [input, setInput] = React.useState('');
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Focus the input when sidebar opens
  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const { messages, sendMessage, status, regenerate, error } =
    useChat<DocsUIMessage>({
      messages: initialMessages,
      id: chatId,
      generateId: id,
      transport: new DefaultChatTransport({
        api: '/api/chat',
        fetch: customAiFetch,
        prepareSendMessagesRequest({ messages, id }) {
          return {
            body: {
              message: messages[messages.length - 1],
              id,
              localId: localId,
            },
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          };
        },
      }),
    });

  const completeMessages = [
    ...initialMessages.filter(
      (initial) => !messages.find((m) => m.id === initial.id),
    ),
    ...messages,
  ];

  const submitMessage = () => {
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="relative min-h-0 flex-1 p-2">
        <ConversationContent>
          {completeMessages.length === 0 ? (
            <ConversationEmptyState
              description="Messages will appear here as the conversation progresses."
              icon={<MessageSquareIcon className="size-6" />}
              title="Ask a Question"
            />
          ) : (
            completeMessages.map((message, messageIndex) => (
              <Fragment key={message.id}>
                {message.parts.map((part, i) => {
                  switch (part.type) {
                    case 'data-source':
                      return (
                        <ReadFileMessage key={part.id} file={part.data.file} />
                      );
                    case 'text':
                      const isLastMessage =
                        messageIndex === messages.length - 1;
                      return (
                        <Fragment key={`${message.id}-${i}`}>
                          <Message from={message.role}>
                            <MessageContent>
                              <MessageResponse>{part.text}</MessageResponse>
                            </MessageContent>
                            {message.role === 'assistant' && isLastMessage && (
                              <MessageActions>
                                <MessageAction
                                  onClick={() => regenerate()}
                                  label="Retry"
                                >
                                  <RefreshCcwIcon className="size-3" />
                                </MessageAction>
                                <MessageAction
                                  onClick={() =>
                                    navigator.clipboard.writeText(part.text)
                                  }
                                  label="Copy"
                                >
                                  <CopyIcon className="size-3" />
                                </MessageAction>
                              </MessageActions>
                            )}
                          </Message>
                        </Fragment>
                      );
                    default:
                      return null;
                  }
                })}
              </Fragment>
            ))
          )}
          {(status === 'submitted' || status === 'streaming') &&
            (completeMessages.length === 0 ||
              completeMessages[completeMessages.length - 1].role !==
                'assistant' ||
              !completeMessages[completeMessages.length - 1].parts?.some(
                (p) => p.type === 'text' && p.text,
              )) && (
              <Message from="assistant">
                <MessageContent>
                  <div className="flex items-center gap-2">
                    <Loader />{' '}
                    <span className="opacity-60">Generating Response...</span>
                  </div>
                </MessageContent>
              </Message>
            )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <form
        className="px-2 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          console.log(status);
          if (status !== 'ready') return;
          submitMessage();
        }}
      >
        {error && (
          <div className="z-20 translate-y-1 rounded-t bg-red-200 px-2 py-2 text-sm">
            {error.message}
          </div>
        )}
        <div className="z-30 flex items-center rounded-md border focus-within:border-[#F54A00]">
          <textarea
            ref={inputRef}
            rows={input.split('\n').length}
            className="z-40 grow border-none bg-transparent ring-0 outline-none focus:outline-none"
            value={input}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (status === 'ready') {
                  submitMessage();
                }
              }
            }}
            onChange={(e) => {
              setInput(e.target.value);
            }}
            placeholder={
              completeMessages.length === 0
                ? 'Ask a question...'
                : 'Ask a follow-up question...'
            }
          />
          <button
            type="submit"
            className="cursor-pointer px-2"
            disabled={status !== 'ready'}
          >
            <PaperAirplaneIcon width={20} />
          </button>
        </div>
      </form>
    </div>
  );
};
