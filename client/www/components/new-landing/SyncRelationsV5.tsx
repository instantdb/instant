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

// -- Data --------------------------------------------------------------------

const allMessages: Message[] = [
  { id: 1, text: 'Hey team, ready to ship?', time: '2m', user: 'Alice', userEmoji: '👩', channel: '#general', channelEmoji: '💬' },
  { id: 2, text: 'One sec, pushing now', time: '1m', user: 'Bob', userEmoji: '👨', channel: '#general', channelEmoji: '💬' },
  { id: 3, text: "Let's gooo", time: '30s', user: 'Carol', userEmoji: '👧', channel: '#general', channelEmoji: '💬' },
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

// -- Query rendering ---------------------------------------------------------

function QLine({
  children,
  indent = 0,
}: {
  children: ReactNode;
  indent?: number;
}) {
  return (
    <div
      className="px-1.5 py-0"
      style={{ paddingLeft: `${indent * 16 + 6}px` }}
    >
      {children}
    </div>
  );
}

function Pn({ children }: { children: ReactNode }) {
  return <span className="text-gray-500">{children}</span>;
}

function CompactQuery({ entity, sub }: { entity: string; sub: string }) {
  return (
    <div className="border-t border-gray-800 bg-[#0D1117] px-3 py-2 font-mono text-[11px] leading-snug rounded-b-xl">
      <QLine>
        <Pn>{'{ '}</Pn>
        <span className="text-orange-300">{entity}</span>
        <Pn>{': { '}</Pn>
        <span className="text-gray-400">{sub}</span>
        <Pn>{': {} } }'}</Pn>
      </QLine>
    </div>
  );
}

// -- Panel -------------------------------------------------------------------

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? 'bg-gray-900 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

function ChannelPanel() {
  const [activeId, setActiveId] = useState(1);
  const active = channelList.find((c) => c.id === activeId)!;
  const messages = allMessages.filter((m) => m.channel === active.name);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gray-50 px-3 py-2">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Channel
        </div>
        <div className="flex gap-1.5">
          {channelList.map((c) => (
            <PillButton
              key={c.id}
              active={activeId === c.id}
              onClick={() => setActiveId(c.id)}
            >
              {c.emoji} {c.name}
            </PillButton>
          ))}
        </div>
      </div>

      <div className="flex-1 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-sm">{active.emoji}</span>
          <span className="text-sm font-semibold">Messages in {active.name}</span>
        </div>
        <div className="space-y-2.5">
          {messages.map((msg) => (
            <div key={msg.id}>
              <div className="flex items-center gap-1.5">
                <span className="text-xs">{msg.userEmoji}</span>
                <span className="text-[11px] font-semibold text-gray-700">
                  {msg.user}
                </span>
                <span className="text-[10px] text-gray-400">{msg.time}</span>
              </div>
              <p className="mt-0.5 pl-5 text-xs text-gray-600">{msg.text}</p>
            </div>
          ))}
        </div>
      </div>

      <CompactQuery entity="channels" sub="messages" />
    </div>
  );
}

function UserPanel() {
  const [activeId, setActiveId] = useState(1);
  const active = userList.find((u) => u.id === activeId)!;
  const messages = allMessages.filter((m) => m.user === active.name);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gray-50 px-3 py-2">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          User
        </div>
        <div className="flex gap-1.5">
          {userList.map((u) => (
            <PillButton
              key={u.id}
              active={activeId === u.id}
              onClick={() => setActiveId(u.id)}
            >
              {u.emoji} {u.name}
            </PillButton>
          ))}
        </div>
      </div>

      <div className="flex-1 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-sm">{active.emoji}</span>
          <span className="text-sm font-semibold">{active.name}'s messages</span>
        </div>
        <div className="space-y-2.5">
          {messages.map((msg) => (
            <div key={msg.id}>
              <div className="flex items-center gap-1.5">
                <span className="text-xs">{msg.channelEmoji}</span>
                <span className="text-[11px] font-semibold text-gray-700">
                  {msg.channel}
                </span>
                <span className="text-[10px] text-gray-400">{msg.time}</span>
              </div>
              <p className="mt-0.5 pl-5 text-xs text-gray-600">{msg.text}</p>
            </div>
          ))}
        </div>
      </div>

      <CompactQuery entity="users" sub="messages" />
    </div>
  );
}

// -- Main export -------------------------------------------------------------

export function SyncRelationsV5() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChannelPanel />
      <UserPanel />
    </div>
  );
}
