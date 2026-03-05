'use client';

import { useState, useEffect } from 'react';
import { produce } from 'immer';
import { MotionValue, motion, useSpring, useTransform } from 'motion/react';

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
  { id: 1, user: 'Daniel', emoji: '🚀', text: 'Just shipped the new sync engine' },
  { id: 2, user: 'Joe', emoji: '🔥', text: 'Perf is looking great' },
  { id: 3, user: 'Drew', emoji: '❤️', text: 'Deploys are green across the board' },
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

// ─── Rolling digit counter ──────────────────────────────────────────

const DIGIT_HEIGHT = 16;

function RollingDigit({ value }: { value: number }) {
  const animatedValue = useSpring(value, { stiffness: 200, damping: 20 });
  useEffect(() => {
    animatedValue.set(value);
  }, [animatedValue, value]);

  return (
    <div
      className="relative overflow-hidden"
      style={{ height: DIGIT_HEIGHT, width: '0.6em' }}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <RollingDigitNumber
          key={i}
          mv={animatedValue}
          number={i}
          height={DIGIT_HEIGHT}
        />
      ))}
    </div>
  );
}

function RollingDigitNumber({
  mv,
  number,
  height,
}: {
  mv: MotionValue;
  number: number;
  height: number;
}) {
  const y = useTransform(mv, (latest) => {
    const placeValue = latest % 10;
    const offset = (10 + number - placeValue) % 10;
    let memo = offset * height;
    if (offset > 5) memo -= 10 * height;
    return memo;
  });

  return (
    <motion.span
      style={{ y }}
      className="absolute inset-0 flex items-center justify-center"
    >
      {number}
    </motion.span>
  );
}

function RollingCount({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const digits = `${value}`.split('');
  return (
    <span className={`inline-flex items-center tabular-nums ${className ?? ''}`}>
      {digits.map((d, i) => (
        <RollingDigit key={i} value={+d} />
      ))}
    </span>
  );
}

function LikeDeviceCard({
  name,
  img,
  synced,
  queued,
  onLike,
}: {
  name: string;
  img: string;
  synced: Like[];
  queued: Like[];
  onLike: (msgId: number) => void;
}) {
  const totalQueued = queued.length;

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-2 flex items-center gap-2.5 px-1">
        <img
          src={img}
          alt={name}
          className="h-7 w-7 rounded-full object-cover"
        />
        <span className="text-sm font-medium">{name}&apos;s phone</span>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">💬</span>
            <span className="text-sm font-medium text-gray-500">#ship-it</span>
          </div>
          {totalQueued > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
              +{totalQueued} queued
            </span>
          )}
        </div>

        <div className="space-y-3">
          {fixedMessages.map((msg) => {
            const syncedCount = countLikes(synced, msg.id);
            const queuedCount = countLikes(queued, msg.id);

            return (
              <div key={msg.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-semibold text-gray-700">
                    {msg.user}
                  </span>
                  <p className="text-xs text-gray-600">{msg.text}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => onLike(msg.id)}
                    className="flex items-center gap-1 rounded-full border border-gray-200 px-2 py-1 text-xs transition-all hover:bg-gray-50 active:scale-95"
                  >
                    <span>{msg.emoji}</span>
                    {syncedCount + queuedCount > 0 && (
                      <RollingCount
                        value={syncedCount + queuedCount}
                        className="font-medium text-gray-500"
                      />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WifiIcon({ className }: { className?: string }) {
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
        d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12 18.75h.008v.008H12v-.008Z"
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

  function onToggleSync() {
    if (state.online) {
      setState((s) => ({ ...s, online: false }));
    } else {
      setState((s) => ({
        online: true,
        queue1: [],
        queue2: [],
        synced: [...s.synced, ...s.queue1, ...s.queue2],
      }));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sync toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSync}
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
          className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
            state.online ? 'text-green-700' : 'text-gray-500'
          }`}
        >
          {state.online ? (
            <>
              <WifiIcon className="h-4 w-4" />
              Synced
            </>
          ) : (
            <>
              <WifiOffIcon className="h-4 w-4" />
              Offline
            </>
          )}
        </span>
      </div>

      {/* Two device cards */}
      <div className="flex gap-6">
        <LikeDeviceCard
          name="Stopa"
          img="/img/landing/stopa.jpg"
          synced={state.synced}
          queued={state.queue1}
          onLike={(msgId) => onLike('queue1', msgId)}
        />
        <LikeDeviceCard
          name="Drew"
          img="/img/landing/drew.jpg"
          synced={state.synced}
          queued={state.queue2}
          onLike={(msgId) => onLike('queue2', msgId)}
        />
      </div>
    </div>
  );
}
