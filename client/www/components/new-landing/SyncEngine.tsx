'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimateIn } from './AnimateIn';

// Interactive demo: click a todo and see it update instantly (no spinner)
function InstantUpdatesDemo() {
  const [todos, setTodos] = useState([
    { id: 1, text: 'Design landing page', done: true },
    { id: 2, text: 'Write API docs', done: false },
    { id: 3, text: 'Ship v1.0', done: false },
  ]);

  const toggle = (id: number) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium">My Tasks</span>
        <span className="flex items-center gap-1 text-xs font-medium text-green-600">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Synced
        </span>
      </div>
      <div className="space-y-1.5">
        {todos.map((t) => (
          <button
            key={t.id}
            onClick={() => toggle(t.id)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
          >
            <div
              className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
                t.done ? 'border-orange-600 bg-orange-600' : 'border-gray-300'
              }`}
            >
              {t.done && (
                <svg
                  className="h-3 w-3 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={3}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m4.5 12.75 6 6 9-13.5"
                  />
                </svg>
              )}
            </div>
            <span
              className={`text-sm ${t.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}
            >
              {t.text}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">
        Click a task — no spinner, no delay
      </p>
    </div>
  );
}

// Two devices showing real-time sync
function RealtimeSyncDemo() {
  const [messages, setMessages] = useState([
    { id: 1, user: 'Alice', text: 'Ready to ship?' },
    { id: 2, user: 'Bob', text: 'One sec, pushing now' },
  ]);
  const [showNew, setShowNew] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const cycle = () => {
      setShowNew(true);
      timerRef.current = setTimeout(() => {
        setShowNew(false);
        timerRef.current = setTimeout(cycle, 3000);
      }, 4000);
    };
    timerRef.current = setTimeout(cycle, 2000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const newMessage = { id: 3, user: 'Alice', text: 'Shipped! 🚀' };

  const DeviceFrame = ({ label }: { label: string }) => (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 text-center text-xs text-gray-400">{label}</div>
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="space-y-2">
          {messages.map((m) => (
            <div key={m.id} className="flex gap-2">
              <span className="shrink-0 text-xs font-semibold">{m.user}</span>
              <span className="text-xs text-gray-600">{m.text}</span>
            </div>
          ))}
          <div
            className={`flex gap-2 transition-opacity duration-300 ${
              showNew ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <span className="shrink-0 text-xs font-semibold">
              {newMessage.user}
            </span>
            <span className="text-xs text-gray-600">{newMessage.text}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="flex gap-4">
        <DeviceFrame label="Laptop" />
        <div className="flex items-center">
          <SyncIcon className="h-5 w-5 text-gray-300" />
        </div>
        <DeviceFrame label="Phone" />
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">
        Same data, every device, instantly
      </p>
    </div>
  );
}

// Offline mode visual
function OfflineDemo() {
  const [isOffline, setIsOffline] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const cycle = () => {
      setIsOffline(true);
      timerRef.current = setTimeout(() => {
        setIsOffline(false);
        timerRef.current = setTimeout(cycle, 4000);
      }, 4000);
    };
    cycle();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const events = isOffline
    ? [
        {
          icon: '✏️',
          text: 'Edited "Project plan"',
          time: 'just now',
          status: 'queued',
        },
        {
          icon: '✅',
          text: 'Completed 3 tasks',
          time: '2m ago',
          status: 'queued',
        },
        { icon: '💬', text: 'Added comment', time: '5m ago', status: 'queued' },
      ]
    : [
        {
          icon: '✏️',
          text: 'Edited "Project plan"',
          time: '1m ago',
          status: 'synced',
        },
        {
          icon: '✅',
          text: 'Completed 3 tasks',
          time: '3m ago',
          status: 'synced',
        },
        { icon: '💬', text: 'Added comment', time: '6m ago', status: 'synced' },
      ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium">Activity</span>
        <span
          className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
            isOffline ? 'text-amber-600' : 'text-green-600'
          }`}
        >
          {isOffline ? (
            <>
              <WifiOffIcon className="h-3.5 w-3.5" />
              Offline
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Synced
            </>
          )}
        </span>
      </div>
      <div className="space-y-2">
        {events.map((e, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-sm">{e.icon}</span>
              <span className="text-sm text-gray-700">{e.text}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{e.time}</span>
              {e.status === 'queued' ? (
                <span className="text-xs font-medium text-amber-500">
                  queued
                </span>
              ) : (
                <svg
                  className="h-3.5 w-3.5 text-green-500"
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
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">
        {isOffline
          ? 'Changes queue while offline...'
          : 'Back online — everything synced!'}
      </p>
    </div>
  );
}

// Icons
function SyncIcon({ className }: { className?: string }) {
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
        d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
      />
    </svg>
  );
}

function WifiOffIcon({ className }: { className?: string }) {
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
        d="M3 3l18 18M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12 18.75h.008v.008H12v-.008Z"
      />
    </svg>
  );
}

export function SyncEngine() {
  return (
    <div className="space-y-16">
      {/* Section header */}
      <AnimateIn>
        <div className="sm:text-center">
          <h2 className="text-3xl font-semibold sm:text-7xl">
            The Sync Engine
          </h2>
          <p className="mt-6 max-w-2xl text-[21px] sm:mx-auto">
            Apps powered by Instant feel smoother. No loading spinners. No
            waiting. No refreshing to check if it worked. Changes just happen.
          </p>
        </div>
      </AnimateIn>

      {/* Features */}
      <div className="flex flex-col gap-9">
        {/* Instant updates */}
        <AnimateIn>
          <div className="grid grid-cols-3 items-center gap-6 space-y-4">
            <div className="col-span-1">
              <h3 className="text-2xl font-semibold sm:text-3xl">
                Instant updates
              </h3>
              <p className="mt-2 text-lg">
                Apps built with Instant update immediately. Click a button,
                toggle a switch, type in a field — whatever you do, you see the
                result right away. Your apps feel more responsive and alive and
                your users stay in flow.
              </p>
            </div>
            <div className="col-span-2 bg-[#B8B8B8]/20 px-20 py-9">
              <InstantUpdatesDemo />
            </div>
          </div>
        </AnimateIn>

        {/* Real-time sync */}
        <AnimateIn>
          <div className="grid grid-cols-3 items-center gap-6 space-y-4">
            <div>
              <h3 className="text-2xl font-semibold sm:text-3xl">
                Real-time sync
              </h3>
              <p className="mt-2 text-lg">
                Multiplayer experiences work out of the box. If one person makes
                a change, everyone else can see it right away. No need to
                refresh or re-open the app to see the latest.
              </p>
            </div>
            <div className="col-span-2 bg-[#FFE7E7]/20 px-20 py-9">
              <RealtimeSyncDemo />
            </div>
          </div>
        </AnimateIn>

        {/* Works offline */}
        <AnimateIn>
          <div className="grid grid-cols-3 items-center gap-6 space-y-4">
            <div>
              <h3 className="text-2xl font-semibold sm:text-3xl">
                Works offline
              </h3>
              <p className="mt-2 text-lg">
                Apps built with Instant keep working when you lose connection.
                When your users get back online, everything syncs up without
                them having to do a thing. Pure magic.
              </p>
            </div>
            <div className="col-span-2 bg-[#B8B8B8]/20 px-20 py-9">
              <OfflineDemo />
            </div>
          </div>
        </AnimateIn>
      </div>
    </div>
  );
}
