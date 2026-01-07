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

function formatTimeAgo(date: Date | string | undefined): string {
  if (!date) return '';
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins} min. ago`;
  if (diffHrs < 24) return `${diffHrs} hr. ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

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
          chats.map((chat) => {
            const firstMessage = chat.messages?.[0] as
              | { parts?: Array<{ type: string; text?: string }> }
              | undefined;
            const textPart = firstMessage?.parts?.find(
              (p) => p.type === 'text',
            );
            const preview = textPart?.text || 'New conversation';
            const createdAt = chat.createdAt
              ? new Date(chat.createdAt)
              : undefined;
            return (
              <DropdownMenuItem
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={cn(
                  'flex flex-col items-start gap-0.5',
                  chat.id === currentChatId &&
                    'bg-gray-100 dark:bg-neutral-700',
                )}
              >
                <span className="w-full truncate text-sm">{preview}</span>
                <span className="text-xs text-gray-400">
                  {formatTimeAgo(createdAt)}
                </span>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
