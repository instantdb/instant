'use client';

import { ClockIcon } from '@heroicons/react/24/outline';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/DropdownMenu';
import { cn } from '@instantdb/components';
import db from '@/lib/intern/docs-feedback/db';
import { useEffect, useState } from 'react';
import formatDistanceToNowStrict from 'date-fns/formatDistanceToNowStrict';

const useTimeAgo = (date: Date): string => {
  const [timeAgo, setTimeAgo] = useState(formatDistanceToNowStrict(date));
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeAgo(formatDistanceToNowStrict(date));
    }, 1000);
    return () => clearInterval(interval);
  }, [date]);
  return timeAgo;
};

interface ChatHistoryProps {
  localId: string;
  currentChatId: string;
  onSelectChat: (chatId: string) => void;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  localId,
  currentChatId,
  onSelectChat,
}) => {
  const { data } = db.useQuery(
    localId
      ? {
          chats: {
            $: {
              where: { localId },
              order: { createdAt: 'desc' },
              limit: 8,
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
    { ruleParams: { localId } },
  );

  const chats = data?.chats || [];

  const ChatItem: React.FC<{
    chat: (typeof chats)[0];
    currentChatId: string;
    onSelectChat: (chatId: string) => void;
  }> = ({ chat, currentChatId, onSelectChat }) => {
    const firstMessage = chat.messages?.[0] as
      | { parts?: Array<{ type: string; text?: string }> }
      | undefined;
    const textPart = firstMessage?.parts?.find((p) => p.type === 'text');
    const preview = textPart?.text || 'New conversation';
    const createdAt = new Date(chat.createdAt);
    const timeAgo = useTimeAgo(createdAt);

    return (
      <DropdownMenuItem
        onClick={() => onSelectChat(chat.id)}
        className={cn(
          'flex flex-col items-start gap-0.5',
          chat.id === currentChatId && 'bg-gray-100 dark:bg-neutral-700',
        )}
      >
        <span className="w-full truncate text-sm">{preview}</span>
        <span className="text-xs text-gray-400">{timeAgo} ago</span>
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
          aria-label="Chat history"
        >
          <ClockIcon className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-64 w-64 overflow-y-auto"
      >
        {chats.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-gray-500">
            No chat history
          </div>
        ) : (
          chats.map((chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              currentChatId={currentChatId}
              onSelectChat={onSelectChat}
            />
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
