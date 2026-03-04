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

// ─── Likes-themed offline demo ──────────────────────────────────────

const fixedMessages = [
  { id: 1, user: 'Alyssa', emoji: '❤️', text: 'The eval is ready' },
  { id: 2, user: 'Ben', emoji: '🔥', text: 'Cons the pair first' },
  { id: 3, user: 'Eva Lu', emoji: '🚀', text: 'Tail calls work now' },
];

type Like = { msgId: number };

interface LikesState {
  online: boolean;
  queue1: Like[];
  queue2: Like[];
  synced: Like[];
}

function countLikes(likes: Like[], msgId: number) {
  return likes.filter((l) => l.msgId === msgId).length;
}

function LikeDeviceCard({
  synced,
  queued,
  onLike,
}: {
  synced: Like[];
  queued: Like[];
  onLike: (msgId: number) => void;
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

      {/* Messages with like buttons */}
      <div className="space-y-2.5 p-3">
        {fixedMessages.map((msg) => {
          const syncedCount = countLikes(synced, msg.id);
          const queuedCount = countLikes(queued, msg.id);

          return (
            <div
              key={msg.id}
              className="flex items-center gap-2"
            >
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold text-gray-700">
                  {msg.user}
                </span>
                <p className="text-xs text-gray-600">{msg.text}</p>
              </div>
              <button
                onClick={() => onLike(msg.id)}
                className="flex shrink-0 items-center gap-1 rounded-full border border-gray-200 px-2 py-1 text-xs transition-all hover:bg-gray-50 active:scale-95"
              >
                <span>{msg.emoji}</span>
                {syncedCount > 0 && (
                  <span className="font-medium text-gray-500">
                    {syncedCount}
                  </span>
                )}
                {queuedCount > 0 && (
                  <span className="font-medium text-amber-500">
                    + {queuedCount}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

    </div>
  );
}

export function OfflineDemoReactions() {
  const [state, setState] = useState<LikesState>({
    online: true,
    queue1: [],
    queue2: [],
    synced: [],
  });

  function onLike(q: 'queue1' | 'queue2', msgId: number) {
    setState((s) =>
      produce(s, (d) => {
        const like = { msgId };
        if (s.online) {
          d.synced.push(like);
        } else {
          d[q].push(like);
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
        synced: [...s.synced, ...s.queue1, ...s.queue2],
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
        <LikeDeviceCard
          synced={state.synced}
          queued={state.queue1}
          onLike={(msgId) => onLike('queue1', msgId)}
        />
        <LikeDeviceCard
          synced={state.synced}
          queued={state.queue2}
          onLike={(msgId) => onLike('queue2', msgId)}
        />
      </div>
    </div>
  );
}
