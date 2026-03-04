'use client';

import { useState, ReactNode } from 'react';
import { motion, LayoutGroup } from 'motion/react';

// -- Data --------------------------------------------------------------------

type Mode = 'channels-users' | 'users-channels';

const membership: Record<string, string[]> = {
  '#general': ['Alice', 'Bob', 'Carol'],
  '#design': ['Alice', 'Carol'],
  '#shipped': ['Bob', 'Alice'],
};

const channelEmojis: Record<string, string> = {
  '#general': '💬',
  '#design': '🎨',
  '#shipped': '🚀',
};

const userEmojis: Record<string, string> = {
  Alice: '👩',
  Bob: '👨',
  Carol: '👧',
};

const channels = Object.keys(membership);
const users = [...new Set(Object.values(membership).flat())];

function usersInChannel(ch: string) {
  return membership[ch] ?? [];
}

function channelsForUser(u: string) {
  return channels.filter((ch) => membership[ch].includes(u));
}

// -- Query rendering ---------------------------------------------------------

function Kw({ children }: { children: ReactNode }) {
  return <span className="text-purple-400">{children}</span>;
}

function Pn({ children }: { children: ReactNode }) {
  return <span className="text-gray-500">{children}</span>;
}

function QueryCodeBlock({ mode }: { mode: Mode }) {
  const isChannelsFirst = mode === 'channels-users';

  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-800 bg-[#0D1117]">
      <div className="border-b border-gray-800 px-4 py-2.5 text-[11px] font-medium text-gray-500">
        InstaQL
      </div>
      <div className="flex-1 p-4 font-mono text-[13px] leading-relaxed">
        <LayoutGroup>
          {/* const query = { */}
          <div className="border-l-2 border-transparent rounded px-2 py-0.5">
            <Kw>const</Kw> <span className="text-gray-300">query</span>{' '}
            <Pn>=</Pn> <Pn>{'{'}</Pn>
          </div>

          {/* Level 1 entity */}
          <div
            className="border-l-2 border-orange-400 bg-orange-500/15 rounded px-2 py-0.5"
            style={{ paddingLeft: '28px' }}
          >
            <motion.span
              layoutId={isChannelsFirst ? 'entity-channels' : 'entity-users'}
              className="text-orange-300 inline-block"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              {isChannelsFirst ? 'channels' : 'users'}
            </motion.span>
            <Pn>{': {'}</Pn>
          </div>

          {/* Level 2 entity */}
          <div
            className="border-l-2 border-orange-400 bg-orange-500/15 rounded px-2 py-0.5"
            style={{ paddingLeft: '48px' }}
          >
            <motion.span
              layoutId={isChannelsFirst ? 'entity-users' : 'entity-channels'}
              className="text-orange-300 inline-block"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              {isChannelsFirst ? 'users' : 'channels'}
            </motion.span>
            <Pn>{': {}'}</Pn>
          </div>

          {/* closing braces */}
          <div
            className="border-l-2 border-transparent rounded px-2 py-0.5"
            style={{ paddingLeft: '28px' }}
          >
            <Pn>{'}'}</Pn>
          </div>
          <div className="border-l-2 border-transparent rounded px-2 py-0.5">
            <Pn>{'}'}</Pn>
          </div>
        </LayoutGroup>
      </div>
    </div>
  );
}

// -- Left panel --------------------------------------------------------------

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

function LeftPanel({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const isChannelsFirst = mode === 'channels-users';

  const parentItems = isChannelsFirst
    ? channels.map((ch) => ({ key: ch, label: ch, emoji: channelEmojis[ch] }))
    : users.map((u) => ({ key: u, label: u, emoji: userEmojis[u] }));

  const [selectedKey, setSelectedKey] = useState<string>(parentItems[0].key);

  // Reset selection when mode changes and key is invalid
  const validKey = parentItems.some((p) => p.key === selectedKey)
    ? selectedKey
    : parentItems[0].key;

  const childItems = isChannelsFirst
    ? usersInChannel(validKey).map((u) => ({ label: u, emoji: userEmojis[u] }))
    : channelsForUser(validKey).map((ch) => ({ label: ch, emoji: channelEmojis[ch] }));

  const header = isChannelsFirst
    ? `Users in ${validKey}`
    : `${validKey}'s channels`;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Toggle buttons */}
      <div className="flex items-center gap-1 border-b border-gray-100 bg-gray-50 px-4 py-2">
        <button
          onClick={() => { setMode('channels-users'); setSelectedKey(channels[0]); }}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            isChannelsFirst
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Channels → Users
        </button>
        <button
          onClick={() => { setMode('users-channels'); setSelectedKey(users[0]); }}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            !isChannelsFirst
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Users → Channels
        </button>
      </div>

      {/* Selector pills */}
      <div className="border-b border-gray-100 px-3 py-2">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {isChannelsFirst ? 'Channel' : 'User'}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {parentItems.map((item) => (
            <PillButton
              key={item.key}
              active={validKey === item.key}
              onClick={() => setSelectedKey(item.key)}
            >
              {item.emoji} {item.label}
            </PillButton>
          ))}
        </div>
      </div>

      {/* Result list */}
      <div className="flex-1 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-sm font-semibold">{header}</span>
        </div>
        <div className="space-y-2">
          {childItems.map((item) => (
            <div key={item.label} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5">
              <span className="text-sm">{item.emoji}</span>
              <span className="text-xs font-medium text-gray-700">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// -- Main export -------------------------------------------------------------

export function SyncRelationsV5() {
  const [mode, setMode] = useState<Mode>('channels-users');

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <LeftPanel mode={mode} setMode={setMode} />
      <QueryCodeBlock mode={mode} />
    </div>
  );
}
