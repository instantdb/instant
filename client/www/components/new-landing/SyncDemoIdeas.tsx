'use client';

import { useState, useEffect, useRef } from 'react';

// ─── Shared ───

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

// ─────────────────────────────────────────────
// Variant A: Type here, see it there
// ─────────────────────────────────────────────

export function TypeSyncDemo() {
  const [localText, setLocalText] = useState('');
  const [remoteText, setRemoteText] = useState('');

  // Remote "catches up" to local one character at a time, 50ms apart.
  // Deletions snap instantly.
  useEffect(() => {
    if (remoteText === localText) return;

    const timer = setTimeout(() => {
      if (remoteText.length < localText.length) {
        setRemoteText(localText.slice(0, remoteText.length + 1));
      } else {
        setRemoteText(localText);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [localText, remoteText]);

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="flex gap-4">
        {/* Laptop */}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-center text-xs text-gray-400">
            Laptop
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">
                Shared Notes
              </span>
              <span className="flex items-center gap-1 text-[10px] font-medium text-green-600">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />2
                online
              </span>
            </div>
            <textarea
              value={localText}
              onChange={(e) => setLocalText(e.target.value)}
              placeholder="Start typing a note..."
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-200"
            />
          </div>
        </div>

        <div className="flex items-center">
          <SyncIcon className="h-5 w-5 text-gray-300" />
        </div>

        {/* Phone */}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-center text-xs text-gray-400">
            Phone
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">
                Shared Notes
              </span>
              <span className="flex items-center gap-1 text-[10px] font-medium text-green-600">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />2
                online
              </span>
            </div>
            <div className="min-h-[74px] w-full whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
              {remoteText || (
                <span className="text-gray-400">Start typing a note...</span>
              )}
              {remoteText !== localText && (
                <span className="ml-px inline-block h-3 w-0.5 animate-pulse bg-orange-500 align-middle" />
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">
        Type on the laptop — watch it sync to the phone
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Variant B: Interactive shared checklist
// ─────────────────────────────────────────────

export function SharedChecklistDemo() {
  const [items, setItems] = useState([
    { id: 1, text: 'Review PR #42', done: false },
    { id: 2, text: 'Deploy to staging', done: false },
    { id: 3, text: 'Update docs', done: true },
    { id: 4, text: 'Send release notes', done: false },
  ]);

  const [phoneHighlights, setPhoneHighlights] = useState<Set<number>>(
    new Set(),
  );
  const [laptopHighlights, setLaptopHighlights] = useState<Set<number>>(
    new Set(),
  );
  const autoRef = useRef<NodeJS.Timeout | null>(null);

  const toggleFromLaptop = (id: number) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)),
    );
    // Highlight on phone after a tiny "propagation" delay
    setTimeout(() => {
      setPhoneHighlights((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setPhoneHighlights((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 600);
    }, 120);
  };

  // Simulate "Alex" checking items on the phone side
  useEffect(() => {
    const cycle = () => {
      autoRef.current = setTimeout(
        () => {
          setItems((prev) => {
            const unchecked = prev.filter((i) => !i.done);
            let target;
            if (unchecked.length === 0) {
              // All done — uncheck one to keep it alive
              target = prev[Math.floor(Math.random() * prev.length)];
            } else {
              target =
                unchecked[Math.floor(Math.random() * unchecked.length)];
            }
            setLaptopHighlights(new Set([target.id]));
            setTimeout(() => setLaptopHighlights(new Set()), 600);
            return prev.map((i) =>
              i.id === target.id ? { ...i, done: !i.done } : i,
            );
          });
          cycle();
        },
        4000 + Math.random() * 3000,
      );
    };
    cycle();
    return () => {
      if (autoRef.current) clearTimeout(autoRef.current);
    };
  }, []);

  const ChecklistView = ({
    highlights,
    onToggle,
    label,
    user,
  }: {
    highlights: Set<number>;
    onToggle?: (id: number) => void;
    label: string;
    user: string;
  }) => (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 text-center text-xs text-gray-400">{label}</div>
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">
            Sprint Tasks
          </span>
          <span className="text-[10px] text-gray-400">{user}</span>
        </div>
        <div className="space-y-1">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => onToggle?.(item.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all duration-300 ${
                highlights.has(item.id)
                  ? 'bg-orange-50 ring-1 ring-orange-200'
                  : onToggle
                    ? 'hover:bg-gray-50'
                    : ''
              }`}
            >
              <div
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-[1.5px] transition-colors ${
                  item.done
                    ? 'border-orange-600 bg-orange-600'
                    : 'border-gray-300'
                }`}
              >
                {item.done && (
                  <svg
                    className="h-2.5 w-2.5 text-white"
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
                className={`text-xs ${item.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}
              >
                {item.text}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="flex gap-4">
        <ChecklistView
          highlights={laptopHighlights}
          onToggle={toggleFromLaptop}
          label="Laptop"
          user="You"
        />
        <div className="flex items-center">
          <SyncIcon className="h-5 w-5 text-gray-300" />
        </div>
        <ChecklistView
          highlights={phoneHighlights}
          label="Phone"
          user="Alex"
        />
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">
        Check a task on Laptop — watch it propagate to Phone
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Variant C: Live cursors / presence
// ─────────────────────────────────────────────

const ALEX_PATH = [
  { x: 30, y: 25 },
  { x: 55, y: 40 },
  { x: 72, y: 55 },
  { x: 50, y: 70 },
  { x: 25, y: 55 },
  { x: 40, y: 30 },
];

export function LiveCursorsDemo() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [myPos, setMyPos] = useState<{ x: number; y: number } | null>(null);
  const [myPosDelayed, setMyPosDelayed] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [alexIdx, setAlexIdx] = useState(0);
  const alexPos = ALEX_PATH[alexIdx];

  // Track mouse within the laptop canvas
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMyPos({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
  };

  const handleMouseLeave = () => setMyPos(null);

  // Tiny delay for the user cursor on the phone (simulate network)
  useEffect(() => {
    const timer = setTimeout(() => setMyPosDelayed(myPos), 80);
    return () => clearTimeout(timer);
  }, [myPos]);

  // Animate Alex along the path
  useEffect(() => {
    const interval = setInterval(() => {
      setAlexIdx((prev) => (prev + 1) % ALEX_PATH.length);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  const Cursor = ({
    pos,
    label,
    color,
    smooth,
  }: {
    pos: { x: number; y: number };
    label: string;
    color: string;
    smooth?: boolean;
  }) => (
    <div
      className={`pointer-events-none absolute ${smooth ? 'transition-all duration-[800ms] ease-in-out' : 'transition-all duration-75'}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
    >
      <svg
        width="14"
        height="18"
        viewBox="0 0 16 20"
        fill="none"
        className="-ml-0.5"
      >
        <path
          d="M1 1L1 15L5.5 11L11 18L14 16L8.5 9L14 7L1 1Z"
          fill={color}
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>
      <span
        className="absolute left-3 top-3.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[8px] font-medium text-white"
        style={{ backgroundColor: color }}
      >
        {label}
      </span>
    </div>
  );

  const DocContent = () => (
    <div className="space-y-2 p-3">
      <div className="h-2 w-3/4 rounded bg-gray-100" />
      <div className="h-2 w-full rounded bg-gray-100" />
      <div className="h-2 w-5/6 rounded bg-gray-100" />
      <div className="h-8 w-full rounded bg-gray-50 border border-dashed border-gray-200" />
      <div className="h-2 w-2/3 rounded bg-gray-100" />
      <div className="h-2 w-4/5 rounded bg-gray-100" />
    </div>
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="flex gap-4">
        {/* Laptop */}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-center text-xs text-gray-400">
            Laptop
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">
                Design Doc
              </span>
              <div className="flex -space-x-1.5">
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[7px] font-bold text-white ring-2 ring-white">
                  Y
                </div>
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[7px] font-bold text-white ring-2 ring-white">
                  A
                </div>
              </div>
            </div>
            <div
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              className="relative h-36 cursor-none overflow-hidden rounded-lg border border-gray-200 bg-white"
            >
              <DocContent />
              <Cursor pos={alexPos} label="Alex" color="#6366f1" smooth />
            </div>
          </div>
        </div>

        <div className="flex items-center">
          <SyncIcon className="h-5 w-5 text-gray-300" />
        </div>

        {/* Phone */}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-center text-xs text-gray-400">
            Phone
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">
                Design Doc
              </span>
              <div className="flex -space-x-1.5">
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[7px] font-bold text-white ring-2 ring-white">
                  Y
                </div>
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[7px] font-bold text-white ring-2 ring-white">
                  A
                </div>
              </div>
            </div>
            <div className="relative h-36 overflow-hidden rounded-lg border border-gray-200 bg-white">
              <DocContent />
              <Cursor pos={alexPos} label="Alex" color="#6366f1" smooth />
              {myPosDelayed && (
                <Cursor pos={myPosDelayed} label="You" color="#ea580c" />
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">
        Hover over the laptop — see your cursor appear on the phone
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Variant D: Emoji reaction wall
// ─────────────────────────────────────────────

const REACTIONS = ['👍', '🎉', '🚀', '❤️', '🔥', '👏'] as const;

export function EmojiReactionsDemo() {
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      REACTIONS.map((r) => [r, Math.floor(Math.random() * 5) + 1]),
    ),
  );
  const [justBumped, setJustBumped] = useState<
    Record<string, 'local' | 'remote' | null>
  >({});
  const autoRef = useRef<NodeJS.Timeout | null>(null);

  const react = (emoji: string) => {
    setCounts((prev) => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));
    setJustBumped((prev) => ({ ...prev, [emoji]: 'local' }));
    setTimeout(
      () => setJustBumped((prev) => ({ ...prev, [emoji]: null })),
      400,
    );
  };

  // Simulated other users reacting
  useEffect(() => {
    const cycle = () => {
      autoRef.current = setTimeout(
        () => {
          const emoji =
            REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
          setCounts((prev) => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));
          setJustBumped((prev) => ({ ...prev, [emoji]: 'remote' }));
          setTimeout(
            () => setJustBumped((prev) => ({ ...prev, [emoji]: null })),
            400,
          );
          cycle();
        },
        2500 + Math.random() * 2000,
      );
    };
    cycle();
    return () => {
      if (autoRef.current) clearTimeout(autoRef.current);
    };
  }, []);

  const ReactionsGrid = ({
    interactive,
    label,
  }: {
    interactive: boolean;
    label: string;
  }) => (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 text-center text-xs text-gray-400">{label}</div>
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">
            Ship it! 🚀
          </span>
          <span className="flex items-center gap-1 text-[10px] font-medium text-green-600">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />4 online
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {REACTIONS.map((emoji) => {
            const bumped = justBumped[emoji];
            return (
              <button
                key={emoji}
                onClick={interactive ? () => react(emoji) : undefined}
                className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs transition-all duration-200 ${
                  bumped === 'local'
                    ? 'scale-105 border-orange-300 bg-orange-50'
                    : bumped === 'remote'
                      ? 'scale-105 border-indigo-300 bg-indigo-50'
                      : interactive
                        ? 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        : 'border-gray-200'
                }`}
              >
                <span>{emoji}</span>
                <span className="text-[10px] font-medium text-gray-500">
                  {counts[emoji]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="flex gap-4">
        <ReactionsGrid interactive label="Laptop" />
        <div className="flex items-center">
          <SyncIcon className="h-5 w-5 text-gray-300" />
        </div>
        <ReactionsGrid interactive={false} label="Phone" />
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">
        Click a reaction — counts update on both devices
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Variant E: Device Frame Emoji Reactions
// ─────────────────────────────────────────────

function LaptopFrame2({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      {/* Screen lid */}
      <div className="relative mx-auto rounded-t-xl border-[6px] border-gray-800 bg-gray-800">
        {/* Camera notch */}
        <div className="absolute left-1/2 top-[-3px] z-10 h-[8px] w-[32px] -translate-x-1/2 rounded-b-[5px] bg-gray-800">
          <div className="absolute left-1/2 top-[2px] h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-gray-600" />
        </div>
        {/* Screen */}
        <div className="relative h-[140px] w-[210px] overflow-hidden rounded bg-white">
          {children}
        </div>
      </div>
      {/* Hinge */}
      <div
        className="relative h-[10px] w-[240px] rounded-b-lg"
        style={{
          background:
            'linear-gradient(to bottom, #6b6b6d, #b0b0b2 2px, #d1d1d3 3px, #b8b8ba 5px, #a0a0a2)',
        }}
      >
        <div className="absolute left-1/2 top-0 h-[4px] w-[50px] -translate-x-1/2 rounded-b-md bg-gray-500/30 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]" />
      </div>
    </div>
  );
}

// Floating hearts that pop out and fade
function FloatingHeart({ id, onDone }: { id: number; onDone: (id: number) => void }) {
  const xDrift = useRef((Math.random() - 0.5) * 40);
  useEffect(() => {
    const timer = setTimeout(() => onDone(id), 800);
    return () => clearTimeout(timer);
  }, [id, onDone]);
  return (
    <span
      className="pointer-events-none absolute"
      style={{
        left: '50%',
        bottom: '80%',
        fontSize: 20,
        animation: 'heartFloat 0.8s ease-out forwards',
        marginLeft: xDrift.current,
      }}
    >
      ❤️
    </span>
  );
}

function SocialPostScreen({
  onClick,
  floatingHearts,
  onHeartDone,
}: {
  onClick: () => void;
  floatingHearts: number[];
  onHeartDone: (id: number) => void;
}) {
  return (
    <div className="relative h-full">
      <img
        src="/img/landing/pet.jpg"
        alt=""
        className="h-full w-full object-cover"
      />
      {/* Heart button — bottom right */}
      <button
        onClick={onClick}
        className="absolute bottom-2 right-2 inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium transition-all hover:bg-gray-50 active:scale-95"
      >
        <span style={{ fontSize: 14 }}>❤️</span>
        <span className="text-gray-700">Like</span>
        {floatingHearts.map((hId) => (
          <FloatingHeart key={hId} id={hId} onDone={onHeartDone} />
        ))}
      </button>
    </div>
  );
}

function HeartFloatStyle() {
  return (
    <style>{`
      @keyframes heartFloat {
        0% { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(-50px) scale(1.3); }
      }
    `}</style>
  );
}

export function DeviceFrameReactionsDemo() {
  const [floatingHearts, setFloatingHearts] = useState<number[]>([]);
  const nextId = useRef(0);

  const removeHeart = (id: number) => {
    setFloatingHearts((prev) => prev.filter((h) => h !== id));
  };

  const addHeart = () => {
    const id = nextId.current++;
    setFloatingHearts((prev) => [...prev, id]);
  };

  return (
    <div>
      <HeartFloatStyle />
      <div className="flex items-start justify-center gap-6">
        <LaptopFrame2>
          <SocialPostScreen
            onClick={addHeart}
            floatingHearts={floatingHearts}
            onHeartDone={removeHeart}
          />
        </LaptopFrame2>

        <LaptopFrame2>
          <SocialPostScreen
            onClick={addHeart}
            floatingHearts={floatingHearts}
            onHeartDone={removeHeart}
          />
        </LaptopFrame2>
      </div>
    </div>
  );
}
