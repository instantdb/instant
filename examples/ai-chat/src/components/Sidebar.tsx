'use client';

import { db } from '@/lib/db';
import { id as generateId } from '@instantdb/react';
import { useRouter, useParams } from 'next/navigation';

export function Sidebar() {
  const router = useRouter();
  const params = useParams();
  const currentChatId = params.id as string | undefined;

  const { user } = db.useAuth();
  const { data } = db.useQuery(
    user
      ? {
          chats: {
            $: {
              where: { owner: user.id },
              order: { serverCreatedAt: 'desc' },
            },
          },
        }
      : null,
  );

  const chats = data?.chats || [];

  function handleNewChat() {
    router.push(`/chat/${generateId()}`);
  }

  function handleLogout() {
    db.auth.signOut().then(() => router.push('/'));
  }

  return (
    <div className="flex h-full w-[200px] flex-col border-r border-gray-200">
      <div className="flex items-end justify-between border-b border-gray-200 px-3 py-3">
        <h1 className="text-[32px] leading-none font-bold text-gray-200">
          CHAT
        </h1>
        <button
          onClick={handleLogout}
          className="cursor-pointer pb-0.5 text-[10px] font-bold tracking-wider text-gray-300 uppercase hover:text-gray-500"
        >
          Sign Out
        </button>
      </div>

      <button
        onClick={handleNewChat}
        className="cursor-pointer border-b border-gray-200 px-3 py-2 text-left text-[10px] font-bold tracking-wider text-gray-500 uppercase hover:bg-gray-50"
      >
        + New Chat
      </button>

      <div className="flex-1 overflow-y-auto">
        {chats.map((chat) => {
          const isActive = chat.id === currentChatId;
          return (
            <button
              key={chat.id}
              onClick={() => router.push(`/chat/${chat.id}`)}
              className={`block w-full cursor-pointer border-b border-gray-100 px-3 py-2 text-left ${
                isActive ? 'bg-gray-50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="truncate text-xs text-gray-600">
                {chat.title || 'Untitled'}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
