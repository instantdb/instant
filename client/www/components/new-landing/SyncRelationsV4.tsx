'use client';

import { useState, ReactNode } from 'react';

// -- Types -------------------------------------------------------------------

type Message = {
  id: number;
  text: string;
  time: string;
  user: string;
  userEmoji: string;
  channel: string;
  channelEmoji: string;
};

type Channel = {
  id: number;
  name: string;
  emoji: string;
};

type User = {
  id: number;
  name: string;
  emoji: string;
};

// -- Data --------------------------------------------------------------------

const allMessages: Message[] = [
  {
    id: 1,
    text: 'Hey team, ready to ship?',
    time: '2m',
    user: 'Alice',
    userEmoji: '👩',
    channel: '#general',
    channelEmoji: '💬',
  },
  {
    id: 2,
    text: 'One sec, pushing now',
    time: '1m',
    user: 'Bob',
    userEmoji: '👨',
    channel: '#general',
    channelEmoji: '💬',
  },
  {
    id: 3,
    text: "Let's gooo",
    time: '30s',
    user: 'Carol',
    userEmoji: '👧',
    channel: '#general',
    channelEmoji: '💬',
  },
  {
    id: 4,
    text: 'New palette looks great',
    time: '5m',
    user: 'Alice',
    userEmoji: '👩',
    channel: '#design',
    channelEmoji: '🎨',
  },
  {
    id: 5,
    text: 'Love the orange accent',
    time: '3m',
    user: 'Carol',
    userEmoji: '👧',
    channel: '#design',
    channelEmoji: '🎨',
  },
  {
    id: 6,
    text: 'v2.0 is live!',
    time: '10m',
    user: 'Bob',
    userEmoji: '👨',
    channel: '#shipped',
    channelEmoji: '🚀',
  },
  {
    id: 7,
    text: 'Nice work everyone!',
    time: '8m',
    user: 'Alice',
    userEmoji: '👩',
    channel: '#shipped',
    channelEmoji: '🚀',
  },
];

const channelList: Channel[] = [
  { id: 1, name: '#general', emoji: '💬' },
  { id: 2, name: '#design', emoji: '🎨' },
  { id: 3, name: '#shipped', emoji: '🚀' },
];

const userList: User[] = [
  { id: 1, name: 'Alice', emoji: '👩' },
  { id: 2, name: 'Bob', emoji: '👨' },
  { id: 3, name: 'Carol', emoji: '👧' },
];

function channelMessages(name: string) {
  return allMessages.filter((m) => m.channel === name);
}

function userMessages(name: string) {
  return allMessages.filter((m) => m.user === name);
}

// -- Query rendering ---------------------------------------------------------

function QLine({
  children,
  indent = 0,
  highlight,
  active,
}: {
  children: ReactNode;
  indent?: number;
  highlight?: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={`rounded px-2 py-0.5 transition-all duration-300 ${
        active
          ? 'border-l-2 border-orange-400 bg-orange-500/15'
          : highlight
            ? 'border-l-2 border-orange-400/30 bg-orange-500/5'
            : 'border-l-2 border-transparent'
      }`}
      style={{ paddingLeft: `${indent * 20 + 8}px` }}
    >
      {children}
    </div>
  );
}

function Kw({ children }: { children: ReactNode }) {
  return <span className="text-purple-400">{children}</span>;
}

function Ent({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span className={active ? 'text-orange-300' : 'text-gray-500'}>
      {children}
    </span>
  );
}

function Pn({ children }: { children: ReactNode }) {
  return <span className="text-gray-500">{children}</span>;
}

function QueryCodeBlock({
  entities,
  depth,
}: {
  entities: [string, string];
  depth: number;
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-800 bg-[#0D1117]">
      <div className="border-b border-gray-800 px-4 py-2.5 text-[11px] font-medium text-gray-500">
        InstaQL
      </div>
      <div className="flex-1 p-4 font-mono text-[13px] leading-relaxed">
        <QLine>
          <Kw>const</Kw> <span className="text-gray-300">query</span> <Pn>=</Pn>{' '}
          <Pn>{'{'}</Pn>
        </QLine>
        <QLine indent={1} highlight={depth >= 1} active={depth === 1}>
          <Ent active={depth >= 1}>{entities[0]}</Ent>
          <Pn>{': {'}</Pn>
        </QLine>
        <QLine indent={2} highlight={depth >= 2} active={depth === 2}>
          <Ent active={depth >= 2}>{entities[1]}</Ent>
          <Pn>{': {}'}</Pn>
        </QLine>
        <QLine indent={1}>
          <Pn>{'}'}</Pn>
        </QLine>
        <QLine>
          <Pn>{'}'}</Pn>
        </QLine>
      </div>
    </div>
  );
}

// -- Messaging app -----------------------------------------------------------

function CommentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z"
      />
    </svg>
  );
}

// -- Main export -------------------------------------------------------------

type ViewMode = 'channels' | 'users';

export function SyncRelationsV4() {
  const [viewMode, setViewMode] = useState<ViewMode>('channels');
  const [activeChannelId, setActiveChannelId] = useState(1);
  const [activeUserId, setActiveUserId] = useState(1);

  const activeChannel = channelList.find((c) => c.id === activeChannelId)!;
  const activeUser = userList.find((u) => u.id === activeUserId)!;

  const messages =
    viewMode === 'channels'
      ? channelMessages(activeChannel.name)
      : userMessages(activeUser.name);

  const sidebarItems =
    viewMode === 'channels'
      ? channelList.map((c) => ({
          id: c.id,
          name: c.name,
          emoji: c.emoji,
          count: channelMessages(c.name).length,
        }))
      : userList.map((u) => ({
          id: u.id,
          name: u.name,
          emoji: u.emoji,
          count: userMessages(u.name).length,
        }));

  const activeId = viewMode === 'channels' ? activeChannelId : activeUserId;
  const onSelect = (id: number) => {
    if (viewMode === 'channels') setActiveChannelId(id);
    else setActiveUserId(id);
  };

  const queryEntities: [string, string] =
    viewMode === 'channels' ? ['channels', 'messages'] : ['users', 'messages'];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* App */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Top bar with view toggle */}
        <div className="flex items-center gap-1 border-b border-gray-100 bg-gray-50 px-4 py-2">
          <button
            onClick={() => setViewMode('channels')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === 'channels'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Channels
          </button>
          <button
            onClick={() => setViewMode('users')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === 'users'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Users
          </button>
          <div className="flex-1" />
          <span className="flex items-center gap-1 text-xs font-medium text-green-600">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Live
          </span>
        </div>

        <div className="flex min-h-[280px]">
          {/* Sidebar */}
          <div className="w-28 border-r border-gray-100 bg-gray-50/50 p-1.5 sm:w-[160px] sm:p-2">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors sm:gap-2 ${
                  activeId === item.id
                    ? 'border border-gray-200 bg-white shadow-sm'
                    : 'text-gray-600 hover:bg-white/60'
                }`}
              >
                <span className="text-xs sm:text-sm">{item.emoji}</span>
                <span className="flex-1 truncate text-[11px] font-medium sm:text-xs">
                  {item.name}
                </span>
                <span className="text-[10px] text-gray-400">
                  <CommentIcon className="inline h-3 w-3" /> {item.count}
                </span>
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 p-3">
            <div className="mb-3 flex items-center gap-1.5">
              <span className="text-sm">
                {viewMode === 'channels'
                  ? activeChannel.emoji
                  : activeUser.emoji}
              </span>
              <span className="text-sm font-semibold">
                {viewMode === 'channels' ? activeChannel.name : activeUser.name}
              </span>
            </div>
            <div className="space-y-3">
              {messages.map((msg) => (
                <div key={msg.id}>
                  <div className="flex items-center gap-1.5">
                    {viewMode === 'channels' ? (
                      <>
                        <span className="text-xs">{msg.userEmoji}</span>
                        <span className="text-[11px] font-semibold text-gray-700">
                          {msg.user}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-xs">{msg.channelEmoji}</span>
                        <span className="text-[11px] font-semibold text-gray-700">
                          {msg.channel}
                        </span>
                      </>
                    )}
                    <span className="text-[10px] text-gray-400">
                      {msg.time}
                    </span>
                  </div>
                  <p className="mt-0.5 pl-5 text-xs text-gray-600">
                    {msg.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Query */}
      <QueryCodeBlock entities={queryEntities} depth={2} />
    </div>
  );
}
