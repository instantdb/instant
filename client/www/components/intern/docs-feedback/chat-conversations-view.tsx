'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShareIcon, CheckIcon } from '@heroicons/react/24/outline';
import db from '@/lib/intern/docs-feedback/db';

const PAGE_SIZE = 20;

type Chat = {
  id: string;
  createdAt: number;
  createdByUserId: string;
  messages: Message[];
};

type Message = {
  id: string;
  index: number;
  role: string;
  parts: Array<{ type: string; text?: string }>;
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatShortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function getFirstMessagePreview(messages: Message[]): string {
  if (!messages || messages.length === 0) return 'No messages';

  const firstUserMessage = messages.find((m) => m.role === 'user');
  if (!firstUserMessage) return 'No user message';

  const textPart = firstUserMessage.parts?.find((p) => p.type === 'text');
  if (!textPart?.text) return 'No text content';

  const text = textPart.text;
  if (text.length > 60) {
    return text.substring(0, 60) + '...';
  }
  return text;
}

function getMessageText(message: Message): string {
  const textParts = message.parts?.filter((p) => p.type === 'text') || [];
  return textParts.map((p) => p.text || '').join('\n');
}

function ChatListItem({
  chat,
  isSelected,
  onClick,
}: {
  chat: Chat;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full border-b border-gray-100 p-3 text-left hover:bg-gray-50 ${isSelected ? 'border-l-2 border-l-blue-500 bg-blue-50' : ''}`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="max-w-[150px] truncate text-xs text-gray-500">
          {chat.createdByUserId || 'Anonymous'}
        </span>
        <span className="text-xs text-gray-400">
          {formatShortDate(chat.createdAt)}
        </span>
      </div>
      <p className="line-clamp-2 text-sm text-gray-700">
        {getFirstMessagePreview(chat.messages)}
      </p>
      <div className="mt-1 text-xs text-gray-400">
        {chat.messages?.length || 0} messages
      </div>
    </button>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const text = getMessageText(message);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${isUser ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'
          }`}
      >
        <div className="mb-1 text-xs opacity-70">
          {isUser ? 'User' : 'Assistant'}
        </div>
        <div className="text-sm whitespace-pre-wrap">{text}</div>
      </div>
    </div>
  );
}

function ConversationDetail({
  chat,
  onBack,
}: {
  chat: Chat | null;
  onBack?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!chat) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        Select a conversation to view
      </div>
    );
  }

  const sortedMessages = [...(chat.messages || [])].sort(
    (a, b) => a.index - b.index,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="text-gray-500 hover:text-gray-700 md:hidden"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}
            <div>
              <div className="font-medium text-gray-900">
                {chat.createdByUserId || 'Anonymous'}
              </div>
              <div className="text-sm text-gray-500">
                {formatDate(chat.createdAt)}
              </div>
            </div>
          </div>
          <button
            onClick={copyUrl}
            className="flex items-center gap-1 rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-800"
          >
            {copied ? (
              <>
                <CheckIcon className="h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <ShareIcon className="h-4 w-4" />
                Share
              </>
            )}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {sortedMessages.length === 0 ? (
          <div className="text-center text-gray-500">No messages</div>
        ) : (
          sortedMessages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
      </div>
    </div>
  );
}

export function ChatConversationsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const chatIdFromUrl = searchParams?.get('chat') || null;
  const pageFromUrl = parseInt(searchParams?.get('page') || '1', 10);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    chatIdFromUrl,
  );
  const [page, setPage] = useState(pageFromUrl);

  useEffect(() => {
    setSelectedChatId(chatIdFromUrl);
    setPage(pageFromUrl);
  }, [chatIdFromUrl, pageFromUrl]);

  const updateUrl = (chatId: string | null, newPage: number) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    if (chatId) {
      params.set('chat', chatId);
    } else {
      params.delete('chat');
    }
    if (newPage > 1) {
      params.set('page', newPage.toString());
    } else {
      params.delete('page');
    }
    const query = params.toString();
    router.replace(query ? `?${query}` : '?', { scroll: false });
  };

  const selectChat = (chatId: string | null) => {
    setSelectedChatId(chatId);
    updateUrl(chatId, page);
  };

  const changePage = (newPage: number) => {
    setPage(newPage);
    updateUrl(selectedChatId, newPage);
  };

  const { data, isLoading, error } = db.useQuery({
    chats: {
      $: {
        order: { createdAt: 'desc' },
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      },
      messages: {
        $: {
          order: { index: 'asc' },
        },
      },
    },
  });

  const { data: linkedChatData } = db.useQuery(
    chatIdFromUrl
      ? {
        chats: {
          $: { where: { id: chatIdFromUrl } },
          messages: { $: { order: { index: 'asc' } } },
        },
      }
      : null,
  );

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="animate-pulse text-gray-500">
          Loading conversations...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600">
        Error loading chats: {error.message}
      </div>
    );
  }

  const chats = (data?.chats || []) as Chat[];
  const linkedChat = (linkedChatData?.chats?.[0] as Chat) || null;
  const selectedChat = chats.find((c) => c.id === selectedChatId) || linkedChat;
  const hasMore = chats.length === PAGE_SIZE;
  const hasPrev = page > 1;

  const showMobileDetail = selectedChatId !== null;

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow">
      <div className="flex h-[600px]">
        <div
          className={`flex w-full flex-col border-r border-gray-200 md:w-80 ${showMobileDetail ? 'hidden md:flex' : 'flex'
            }`}
        >
          <div className="flex-1 overflow-y-auto">
            {chats.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No conversations found
              </div>
            ) : (
              chats.map((chat) => (
                <ChatListItem
                  key={chat.id}
                  chat={chat}
                  isSelected={chat.id === selectedChatId}
                  onClick={() => selectChat(chat.id)}
                />
              ))
            )}
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 p-3">
            <button
              onClick={() => changePage(page - 1)}
              disabled={!hasPrev}
              className={`rounded px-3 py-1 text-sm ${hasPrev
                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                : 'cursor-not-allowed bg-gray-100 text-gray-400'
                }`}
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">Page {page}</span>
            <button
              onClick={() => changePage(page + 1)}
              disabled={!hasMore}
              className={`rounded px-3 py-1 text-sm ${hasMore
                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                : 'cursor-not-allowed bg-gray-100 text-gray-400'
                }`}
            >
              Next
            </button>
          </div>
        </div>
        <div
          className={`flex-1 flex-col ${showMobileDetail ? 'flex' : 'hidden md:flex'}`}
        >
          <ConversationDetail
            chat={selectedChat}
            onBack={() => selectChat(null)}
          />
        </div>
      </div>
    </div>
  );
}
