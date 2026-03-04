'use client';

import { useState, useRef } from 'react';
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

// ─── Messages-themed offline demo ────────────────────────────────────

const users = [
  { name: 'Alyssa' },
  { name: 'Ben' },
  { name: 'Eva Lu' },
] as const;

const cannedTexts = [
  'The eval is ready',
  'Just need the environment',
  'Cons the pair first',
  'It\'s all lambdas',
  'Metacircular!',
  'Tail calls work now',
  'Check the substitution',
  'Apply then eval',
];

interface ChatMsg {
  id: number;
  user: string;
  text: string;
  synced: boolean;
}

interface MsgState {
  online: boolean;
  queue1: ChatMsg[];
  queue2: ChatMsg[];
  shared: ChatMsg[];
}

export function OfflineDemoMessages() {
  const nextId = useRef(1);
  const userIdx = useRef(0);
  const textIdx = useRef(0);

  const [state, setState] = useState<MsgState>({
    online: true,
    queue1: [],
    queue2: [],
    shared: [],
  });

  function nextMessage(): ChatMsg {
    const user = users[userIdx.current % users.length];
    const text = cannedTexts[textIdx.current % cannedTexts.length];
    userIdx.current++;
    textIdx.current++;
    return {
      id: nextId.current++,
      user: user.name,
      text,
      synced: false,
    };
  }

  function onSend(q: 'queue1' | 'queue2') {
    const msg = nextMessage();
    setState((s) =>
      produce(s, (d) => {
        if (s.online) {
          d.shared.push({ ...msg, synced: true });
        } else {
          d[q].push(msg);
        }
      }),
    );
  }

  function onToggleSync(online: boolean) {
    setState((s) => {
      if (!online) {
        return { ...s, online: false };
      }
      // Flush queues into shared, mark as synced
      const flushed = [...s.queue1, ...s.queue2].map((m) => ({
        ...m,
        synced: true,
      }));
      return {
        online: true,
        queue1: [],
        queue2: [],
        shared: [...s.shared, ...flushed],
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
        {(['queue1', 'queue2'] as const).map((q, i) => {
          const localMsgs = state[q];
          const allMsgs = [...state.shared, ...localMsgs];

          return (
            <div
              key={q}
              className="flex flex-1 flex-col rounded-xl border border-gray-200 bg-white shadow-sm"
            >
              {/* Device header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">💬</span>
                  <span className="text-xs font-semibold text-gray-700">
                    #general
                  </span>
                </div>
                <span className="text-[10px] text-gray-400">
                  {i === 0 ? 'Laptop' : 'Phone'}
                </span>
              </div>

              {/* Message list */}
              <div className="flex max-h-[200px] min-h-[180px] flex-col justify-end overflow-y-auto p-3">
                <div className="space-y-2">
                  {allMsgs.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${
                        msg.synced ? 'bg-white' : 'bg-amber-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] font-semibold text-gray-700">
                          {msg.user}
                        </span>
                        <p className="text-xs text-gray-600">{msg.text}</p>
                      </div>
                      {msg.synced ? (
                        <svg
                          className="mt-0.5 h-3 w-3 shrink-0 text-green-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2.5}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m4.5 12.75 6 6 9-13.5"
                          />
                        </svg>
                      ) : (
                        <span className="mt-0.5 shrink-0 text-[10px] font-medium text-amber-500">
                          queued
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Send button */}
              <div className="border-t border-gray-100 px-3 py-2">
                <button
                  className="w-full rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-orange-700 active:scale-[0.98]"
                  onClick={() => onSend(q)}
                >
                  Send
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
