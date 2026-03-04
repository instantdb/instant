'use client';

import { useState } from 'react';
import { produce } from 'immer';

// ─── Revived interactive offline demo ───────────────────────────────

const showQueueLength = 3;

interface OfflineState {
  online: boolean;
  queue1: { ts: string }[];
  queue2: { ts: string }[];
  synced: { ts: string }[];
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function OfflineDemoRevived() {
  const [state, setState] = useState<OfflineState>({
    online: false,
    queue1: [],
    queue2: [],
    synced: [],
  });

  function onClick(q: 'queue1' | 'queue2') {
    setState((s) =>
      produce(s, (d) => {
        const e = { ts: new Date().toISOString() };
        if (!s.online) {
          d[q].push(e);
        } else {
          d.synced.push(e);
        }
      }),
    );
  }

  function onChangeOnline(online: boolean) {
    setState((s) => {
      if (!online) {
        return { ...s, online: false };
      }
      return {
        online: true,
        queue1: [],
        queue2: [],
        synced: [...s.synced, ...s.queue1, ...s.queue2],
      };
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sync toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChangeOnline(!state.online)}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
            state.online ? 'bg-green-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
              state.online ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span
          className={`text-sm font-medium transition-colors ${
            state.online ? 'text-green-700' : 'text-gray-500'
          }`}
        >
          {state.online ? 'Sync On' : 'Sync Off'}
        </span>
      </div>

      {/* Two side-by-side cards */}
      <div className="flex gap-3">
        {(['queue1', 'queue2'] as const).map((q) => (
          <div key={q} className="flex flex-1 flex-col gap-3">
            {/* Press me card */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col items-center gap-2">
                <button
                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-orange-700 active:scale-95"
                  onClick={() => onClick(q)}
                >
                  Press me
                </button>
                <span className="text-sm font-semibold text-gray-700">
                  Check-ins: {state[q].length + state.synced.length}
                </span>
              </div>
            </div>

            {/* Transaction queue */}
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-col-reverse gap-1.5">
                {state[q].slice(-showQueueLength).map((item, i) => (
                  <div
                    key={item.ts + i}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs text-gray-600 shadow-sm"
                  >
                    {formatTimestamp(item.ts)}
                  </div>
                ))}
              </div>
              {state[q].length > showQueueLength ? (
                <div className="text-center text-xs text-gray-400">
                  {state[q].length - showQueueLength} more
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Reactions-themed offline demo ───────────────────────────────────

const fixedMessages = [
  { id: 1, user: 'Alyssa', text: 'The eval is ready' },
  { id: 2, user: 'Ben', text: 'Cons the pair first' },
  { id: 3, user: 'Eva Lu', text: 'Tail calls work now' },
];

const reactionEmojis = ['👍', '🚀', '💯', '🎯'];

type Reaction = { msgId: number; emoji: string };

interface ReactionsState {
  online: boolean;
  queue1: Reaction[];
  queue2: Reaction[];
  synced: Reaction[];
}

function reactionKey(r: Reaction) {
  return `${r.msgId}:${r.emoji}`;
}

function hasReaction(reactions: Reaction[], msgId: number, emoji: string) {
  return reactions.some((r) => r.msgId === msgId && r.emoji === emoji);
}

function toggleInList(list: Reaction[], msgId: number, emoji: string) {
  const exists = hasReaction(list, msgId, emoji);
  if (exists) {
    return list.filter((r) => !(r.msgId === msgId && r.emoji === emoji));
  }
  return [...list, { msgId, emoji }];
}

function dedup(reactions: Reaction[]): Reaction[] {
  const seen = new Set<string>();
  return reactions.filter((r) => {
    const k = reactionKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function ReactionDeviceCard({
  synced,
  queued,
  onReact,
}: {
  synced: Reaction[];
  queued: Reaction[];
  onReact: (msgId: number, emoji: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-100 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">💬</span>
          <span className="text-xs font-semibold text-gray-700">#general</span>
        </div>
      </div>

      {/* Messages with reactions */}
      <div className="space-y-3 p-3">
        {fixedMessages.map((msg) => {
          const msgSynced = synced.filter((r) => r.msgId === msg.id);
          const msgQueued = queued.filter((r) => r.msgId === msg.id);

          return (
            <div key={msg.id}>
              <div className="mb-1">
                <span className="text-[11px] font-semibold text-gray-700">
                  {msg.user}
                </span>
                <p className="text-xs text-gray-600">{msg.text}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {reactionEmojis.map((emoji) => {
                  const isSynced = hasReaction(msgSynced, msg.id, emoji);
                  const isQueued = hasReaction(msgQueued, msg.id, emoji);
                  const isActive = isSynced || isQueued;

                  return (
                    <button
                      key={emoji}
                      onClick={() => onReact(msg.id, emoji)}
                      className={`rounded-full border px-2 py-0.5 text-xs transition-all active:scale-95 ${
                        isQueued
                          ? 'border-amber-300 bg-amber-50'
                          : isActive
                            ? 'border-gray-300 bg-gray-100'
                            : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OfflineDemoReactions() {
  const [state, setState] = useState<ReactionsState>({
    online: true,
    queue1: [],
    queue2: [],
    synced: [],
  });

  function onReact(q: 'queue1' | 'queue2', msgId: number, emoji: string) {
    setState((s) =>
      produce(s, (d) => {
        if (s.online) {
          d.synced = toggleInList(d.synced, msgId, emoji);
        } else {
          d[q] = toggleInList(d[q], msgId, emoji);
        }
      }),
    );
  }

  function onToggleSync(online: boolean) {
    setState((s) => {
      if (!online) {
        return { ...s, online: false };
      }
      return {
        online: true,
        queue1: [],
        queue2: [],
        synced: dedup([...s.synced, ...s.queue1, ...s.queue2]),
      };
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sync toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onToggleSync(!state.online)}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
            state.online ? 'bg-green-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
              state.online ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span
          className={`text-sm font-medium transition-colors ${
            state.online ? 'text-green-700' : 'text-gray-500'
          }`}
        >
          {state.online ? 'Sync On' : 'Sync Off'}
        </span>
      </div>

      {/* Two device cards */}
      <div className="flex gap-3">
        <ReactionDeviceCard
          synced={state.synced}
          queued={state.queue1}
          onReact={(msgId, emoji) => onReact('queue1', msgId, emoji)}
        />
        <ReactionDeviceCard
          synced={state.synced}
          queued={state.queue2}
          onReact={(msgId, emoji) => onReact('queue2', msgId, emoji)}
        />
      </div>
    </div>
  );
}
