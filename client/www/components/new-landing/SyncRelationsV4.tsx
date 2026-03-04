'use client';

import { useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';

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

// -- Query rendering with animated entity swap -------------------------------

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

function Pn({ children }: { children: ReactNode }) {
  return <span className="text-gray-500">{children}</span>;
}

function AnimatedEntity({
  name,
  direction,
}: {
  name: string;
  direction: 'down' | 'up';
}) {
  // 'down' = top slot: old name exits downward, new name enters from below
  // 'up' = bottom slot: old name exits upward, new name enters from above
  const y = direction === 'down' ? 18 : -18;
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={name}
        initial={{ opacity: 0, y }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="inline-block text-orange-300"
      >
        {name}
      </motion.span>
    </AnimatePresence>
  );
}

function AnimatedQueryBlock({
  topEntity,
  bottomEntity,
}: {
  topEntity: string;
  bottomEntity: string;
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-800 bg-[#0D1117]">
      <div className="border-b border-gray-800 px-4 py-2.5 text-[11px] font-medium text-gray-500">
        InstaQL
      </div>
      <div className="flex-1 p-4 font-mono text-[13px] leading-relaxed">
        <QLine>
          <span className="text-purple-400">const</span>{' '}
          <span className="text-gray-300">query</span>{' '}
          <Pn>=</Pn> <Pn>{'{'}</Pn>
        </QLine>
        <QLine indent={1} highlight active>
          <AnimatedEntity name={topEntity} direction="down" />
          <Pn>{': {'}</Pn>
        </QLine>
        <QLine indent={2} highlight active>
          <AnimatedEntity name={bottomEntity} direction="up" />
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

// -- App UI ------------------------------------------------------------------

type ViewMode = 'byChannel' | 'byMessage';

function ChannelView({
  activeChannelId,
  onSelectChannel,
}: {
  activeChannelId: number;
  onSelectChannel: (id: number) => void;
}) {
  const channel = channelList.find((c) => c.id === activeChannelId)!;
  const msgs = allMessages.filter((m) => m.channel === channel.name);

  return (
    <div className="flex min-h-[260px]">
      {/* Sidebar */}
      <div className="w-28 border-r border-gray-100 bg-gray-50/50 p-1.5 sm:w-[160px] sm:p-2">
        {channelList.map((c) => {
          const count = allMessages.filter((m) => m.channel === c.name).length;
          return (
            <button
              key={c.id}
              onClick={() => onSelectChannel(c.id)}
              className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors sm:gap-2 ${
                activeChannelId === c.id
                  ? 'border border-gray-200 bg-white shadow-sm'
                  : 'text-gray-600 hover:bg-white/60'
              }`}
            >
              <span className="text-xs sm:text-sm">{c.emoji}</span>
              <span className="flex-1 truncate text-[11px] font-medium sm:text-xs">
                {c.name}
              </span>
              <span className="text-[10px] text-gray-400">{count}</span>
            </button>
          );
        })}
      </div>
      {/* Messages */}
      <div className="flex-1 p-3">
        <div className="mb-3 flex items-center gap-1.5">
          <span className="text-sm">{channel.emoji}</span>
          <span className="text-sm font-semibold">{channel.name}</span>
        </div>
        <div className="space-y-3">
          {msgs.map((msg) => (
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
    </div>
  );
}

function MessageFeedView() {
  return (
    <div className="min-h-[260px] p-3">
      <div className="space-y-3">
        {allMessages.map((msg) => (
          <div key={msg.id}>
            <div className="flex items-center gap-1.5">
              <span className="text-xs">{msg.userEmoji}</span>
              <span className="text-[11px] font-semibold text-gray-700">
                {msg.user}
              </span>
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                {msg.channelEmoji} {msg.channel}
              </span>
              <span className="text-[10px] text-gray-400">{msg.time}</span>
            </div>
            <p className="mt-0.5 pl-5 text-xs text-gray-600">{msg.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// -- Main export -------------------------------------------------------------

export function SyncRelationsV4() {
  const [viewMode, setViewMode] = useState<ViewMode>('byChannel');
  const [activeChannelId, setActiveChannelId] = useState(1);

  const topEntity = viewMode === 'byChannel' ? 'channels' : 'messages';
  const bottomEntity = viewMode === 'byChannel' ? 'messages' : 'channels';

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* App */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-gray-100 bg-gray-50 px-4 py-2">
          <button
            onClick={() => setViewMode('byChannel')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === 'byChannel'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            By Channel
          </button>
          <button
            onClick={() => setViewMode('byMessage')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === 'byMessage'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            By Message
          </button>
          <div className="flex-1" />
          <span className="flex items-center gap-1 text-xs font-medium text-green-600">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Live
          </span>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {viewMode === 'byChannel' ? (
              <ChannelView
                activeChannelId={activeChannelId}
                onSelectChannel={setActiveChannelId}
              />
            ) : (
              <MessageFeedView />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Animated query */}
      <AnimatedQueryBlock topEntity={topEntity} bottomEntity={bottomEntity} />
    </div>
  );
}
