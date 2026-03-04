'use client';

import { useState, ReactNode } from 'react';

// -- Types & data ------------------------------------------------------------

type Message = {
  id: number;
  text: string;
  time: string;
  user: string;
  userEmoji: string;
  channel: string;
  channelEmoji: string;
};

const allMessages: Message[] = [
  { id: 1, text: 'Hey team, ready to ship?', time: '2m', user: 'Alice', userEmoji: '👩', channel: '#general', channelEmoji: '💬' },
  { id: 2, text: 'One sec, pushing now', time: '1m', user: 'Bob', userEmoji: '👨', channel: '#general', channelEmoji: '💬' },
  { id: 3, text: 'Let\'s gooo', time: '30s', user: 'Carol', userEmoji: '👧', channel: '#general', channelEmoji: '💬' },
  { id: 4, text: 'New palette looks great', time: '5m', user: 'Alice', userEmoji: '👩', channel: '#design', channelEmoji: '🎨' },
  { id: 5, text: 'Love the orange accent', time: '3m', user: 'Carol', userEmoji: '👧', channel: '#design', channelEmoji: '🎨' },
  { id: 6, text: 'v2.0 is live!', time: '10m', user: 'Bob', userEmoji: '👨', channel: '#shipped', channelEmoji: '🚀' },
  { id: 7, text: 'Nice work everyone!', time: '8m', user: 'Alice', userEmoji: '👩', channel: '#shipped', channelEmoji: '🚀' },
];

const channelList = [
  { id: 1, name: '#general', emoji: '💬' },
  { id: 2, name: '#design', emoji: '🎨' },
  { id: 3, name: '#shipped', emoji: '🚀' },
];

const userList = [
  { id: 1, name: 'Alice', emoji: '👩' },
  { id: 2, name: 'Bob', emoji: '👨' },
  { id: 3, name: 'Carol', emoji: '👧' },
];

// -- Compact query code block ------------------------------------------------

function Pn({ children }: { children: ReactNode }) {
  return <span className="text-gray-500">{children}</span>;
}

function CompactQuery({ entities }: { entities: [string, string] }) {
  return (
    <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 font-mono text-[12px] leading-relaxed text-gray-400">
      <Pn>{'{ '}</Pn>
      <span className="text-orange-600">{entities[0]}</span>
      <Pn>{': { '}</Pn>
      <span className="text-orange-600">{entities[1]}</span>
      <Pn>{': {} } }'}</Pn>
    </div>
  );
}

// -- Query card (one per view) -----------------------------------------------

function QueryCard({
  items,
  activeId,
  onSelect,
  messages,
  renderMeta,
  queryEntities,
}: {
  items: { id: number; name: string; emoji: string }[];
  activeId: number;
  onSelect: (id: number) => void;
  messages: Message[];
  renderMeta: (msg: Message) => ReactNode;
  queryEntities: [string, string];
}) {
  const active = items.find((i) => i.id === activeId)!;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header with selectors */}
      <div className="flex items-center gap-1 border-b border-gray-100 bg-gray-50 px-3 py-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
              activeId === item.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {item.emoji} {item.name}
          </button>
        ))}
        <div className="flex-1" />
        <span className="flex items-center gap-1 text-[10px] font-medium text-green-600">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Live
        </span>
      </div>

      {/* Messages */}
      <div className="min-h-[180px] p-3">
        <div className="space-y-2.5">
          {messages.map((msg) => (
            <div key={msg.id}>
              <div className="flex items-center gap-1.5">
                {renderMeta(msg)}
                <span className="text-[10px] text-gray-400">{msg.time}</span>
              </div>
              <p className="mt-0.5 pl-5 text-xs text-gray-600">{msg.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Inline query */}
      <CompactQuery entities={queryEntities} />
    </div>
  );
}

// -- Main export -------------------------------------------------------------

export function SyncRelationsV5() {
  const [channelId, setChannelId] = useState(1);
  const [userId, setUserId] = useState(1);

  const activeChannel = channelList.find((c) => c.id === channelId)!;
  const activeUser = userList.find((u) => u.id === userId)!;

  const chMsgs = allMessages.filter((m) => m.channel === activeChannel.name);
  const userMsgs = allMessages.filter((m) => m.user === activeUser.name);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <QueryCard
        items={channelList}
        activeId={channelId}
        onSelect={setChannelId}
        messages={chMsgs}
        renderMeta={(msg) => (
          <>
            <span className="text-xs">{msg.userEmoji}</span>
            <span className="text-[11px] font-semibold text-gray-700">
              {msg.user}
            </span>
          </>
        )}
        queryEntities={['channels', 'messages']}
      />
      <QueryCard
        items={userList}
        activeId={userId}
        onSelect={setUserId}
        messages={userMsgs}
        renderMeta={(msg) => (
          <>
            <span className="text-xs">{msg.channelEmoji}</span>
            <span className="text-[11px] font-semibold text-gray-700">
              {msg.channel}
            </span>
          </>
        )}
        queryEntities={['users', 'messages']}
      />
    </div>
  );
}
