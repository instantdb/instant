'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
} from 'react';

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
          <div className="mb-1.5 text-center text-xs text-gray-400">Laptop</div>
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
          <div className="mb-1.5 text-center text-xs text-gray-400">Phone</div>
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
            <div className="min-h-[74px] w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs break-words whitespace-pre-wrap text-gray-700">
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
              target = unchecked[Math.floor(Math.random() * unchecked.length)];
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
        <ChecklistView highlights={phoneHighlights} label="Phone" user="Alex" />
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
        className="absolute top-3.5 left-3 rounded-full px-1.5 py-0.5 text-[8px] font-medium whitespace-nowrap text-white"
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
      <div className="h-8 w-full rounded border border-dashed border-gray-200 bg-gray-50" />
      <div className="h-2 w-2/3 rounded bg-gray-100" />
      <div className="h-2 w-4/5 rounded bg-gray-100" />
    </div>
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="flex gap-4">
        {/* Laptop */}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-center text-xs text-gray-400">Laptop</div>
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
          <div className="mb-1.5 text-center text-xs text-gray-400">Phone</div>
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
          const emoji = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
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
          <span className="text-xs font-medium text-gray-500">Ship it! 🚀</span>
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
        <div className="absolute top-[-3px] left-1/2 z-10 h-[8px] w-[32px] -translate-x-1/2 rounded-b-[5px] bg-gray-800">
          <div className="absolute top-[2px] left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-gray-600" />
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
        <div className="absolute top-0 left-1/2 h-[4px] w-[50px] -translate-x-1/2 rounded-b-md bg-gray-500/30 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]" />
      </div>
    </div>
  );
}

// Floating hearts that pop out and fade
function FloatingHeart({
  id,
  onDone,
}: {
  id: number;
  onDone: (id: number) => void;
}) {
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
    <div className="flex h-full flex-col bg-gray-100 p-2">
      {/* White card wrapping name + image */}
      <div className="relative flex flex-1 flex-col overflow-hidden rounded-lg bg-white">
        {/* Top bar */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5">
          <span className="text-[9px] font-semibold text-gray-800">stopa</span>
          <span className="text-[9px] text-gray-400">· 2h</span>
        </div>
        {/* Image */}
        <div className="relative flex-1 overflow-hidden">
          <img
            src="/img/landing/pet.jpg"
            alt=""
            className="h-full w-full object-cover object-[center_30%]"
          />
        </div>
        {/* Like button overlay — bottom right */}
        <button
          onClick={onClick}
          className="absolute right-2 bottom-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white/95 px-3 py-1.5 text-[10px] font-medium text-gray-700 shadow-sm backdrop-blur-sm transition-all hover:bg-white active:scale-95"
        >
          <span style={{ fontSize: 13 }}>❤️</span>
          Like
          {floatingHearts.map((hId) => (
            <FloatingHeart key={hId} id={hId} onDone={onHeartDone} />
          ))}
        </button>
      </div>
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

// ─────────────────────────────────────────────
// Variant F: Live Chat Bubbles — Daniel & Joe
// ─────────────────────────────────────────────

type ChatMsg = {
  id: number;
  sender: 'daniel' | 'joe';
  text: string;
};

const CHAT_SEED: ChatMsg[] = [
  { id: 1, sender: 'daniel', text: 'Ready for code review?' },
  { id: 2, sender: 'joe', text: 'Yep, PR looks clean' },
];

// Pre-loaded messages that cycle on button press
const CANNED_MESSAGES: { sender: 'daniel' | 'joe'; text: string }[] = [
  { sender: 'daniel', text: 'Approved, merging now' },
  { sender: 'joe', text: 'Deploying to staging' },
  { sender: 'daniel', text: 'All green in prod' },
  { sender: 'joe', text: 'Nice, shipping it' },
  { sender: 'daniel', text: 'Docs updated too' },
  { sender: 'joe', text: 'Great, closing the ticket' },
];

const SENDER_META = {
  daniel: { name: 'Daniel', img: '/img/landing/daniel.png' },
  joe: { name: 'Joe', img: '/img/landing/joe.jpg' },
};

type ChatSyncDot = {
  id: number;
  direction: 'left-to-right' | 'right-to-left';
};

function ChatBubble({ msg }: { msg: ChatMsg }) {
  const meta = SENDER_META[msg.sender];
  return (
    <div className="flex items-start gap-2 rounded-lg px-2.5 py-2">
      <img
        src={meta.img}
        alt={meta.name}
        className="h-5 w-5 shrink-0 rounded-full object-cover"
      />
      <div className="min-w-0">
        <span className="text-[11px] font-semibold text-gray-700">
          {meta.name}
        </span>
        <p className="text-xs text-gray-600">{msg.text}</p>
      </div>
    </div>
  );
}

// Fixed height — fits ~3 messages, older ones scroll
const CHAT_HEIGHT = 126;

function ChatPhoneCard({
  owner,
  messages,
  onSend,
}: {
  owner: 'daniel' | 'joe';
  messages: ChatMsg[];
  onSend: () => void;
}) {
  const meta = SENDER_META[owner];
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const hadOverflowRef = useRef(false);
  const shouldStickToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);
  const prevContentHeightRef = useRef<number | null>(null);
  const motionFrameRef = useRef<number | null>(null);
  const motionResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supportsScrollAnchoring =
    typeof CSS !== 'undefined' && CSS.supports?.('overflow-anchor: auto');

  const handleScroll = useCallback(() => {
    if (supportsScrollAnchoring) return;

    const el = scrollRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 24;
  }, [supportsScrollAnchoring]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    const bottomAnchor = bottomAnchorRef.current;
    if (!el || !content || !bottomAnchor) return;

    if (motionFrameRef.current) {
      cancelAnimationFrame(motionFrameRef.current);
      motionFrameRef.current = null;
    }
    if (motionResetRef.current) {
      clearTimeout(motionResetRef.current);
      motionResetRef.current = null;
    }
    content.style.transition = '';
    content.style.transform = '';

    const hasOverflow = el.scrollHeight > el.clientHeight + 1;
    const nextContentHeight = content.offsetHeight;
    if (prevContentHeightRef.current == null) {
      prevContentHeightRef.current = nextContentHeight;
      hadOverflowRef.current = hasOverflow;
      prevMessageCountRef.current = messages.length;
      return;
    }

    const didAppend = messages.length > prevMessageCountRef.current;
    const didReset = messages.length < prevMessageCountRef.current;
    const overflowJustStarted = hasOverflow && !hadOverflowRef.current;
    const contentHeightDelta = nextContentHeight - prevContentHeightRef.current;

    if (supportsScrollAnchoring) {
      if (overflowJustStarted || (didReset && hasOverflow)) {
        bottomAnchor.scrollIntoView({ block: 'end' });
      }
    } else {
      if (didReset) {
        shouldStickToBottomRef.current = true;
      }

      if (shouldStickToBottomRef.current && hasOverflow) {
        el.scrollTop = el.scrollHeight - el.clientHeight;
      }
    }

    if (didAppend && contentHeightDelta > 0) {
      content.style.transform = `translate3d(0, ${contentHeightDelta}px, 0)`;
      content.getBoundingClientRect();
      motionFrameRef.current = requestAnimationFrame(() => {
        content.style.transition =
          'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)';
        content.style.transform = 'translate3d(0, 0, 0)';
      });
      motionResetRef.current = setTimeout(() => {
        if (contentRef.current === content) {
          content.style.transition = '';
        }
      }, 260);
    }

    hadOverflowRef.current = hasOverflow;
    prevContentHeightRef.current = nextContentHeight;
    prevMessageCountRef.current = messages.length;
  }, [messages.length, supportsScrollAnchoring]);

  useEffect(() => {
    return () => {
      if (motionFrameRef.current) {
        cancelAnimationFrame(motionFrameRef.current);
      }
      if (motionResetRef.current) {
        clearTimeout(motionResetRef.current);
      }
    };
  }, []);

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-2 flex items-center gap-2.5 px-1">
        <img
          src={meta.img}
          alt={meta.name}
          className="h-7 w-7 rounded-full object-cover"
        />
        <span className="text-sm font-medium">{meta.name}&apos;s phone</span>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-1.5">
          <span className="text-xs">#</span>
          <span className="text-sm font-medium text-gray-500">code-review</span>
        </div>
        <div
          ref={scrollRef}
          className="overflow-y-auto overscroll-contain"
          onScroll={handleScroll}
          style={{ height: CHAT_HEIGHT }}
        >
          <div
            ref={contentRef}
            className="space-y-0.5 pr-1"
            style={{ overflowAnchor: 'none' }}
          >
            {messages.map((msg) => (
              <div key={msg.id} style={{ overflowAnchor: 'none' }}>
                <ChatBubble msg={msg} />
              </div>
            ))}
          </div>
          <div
            ref={bottomAnchorRef}
            aria-hidden="true"
            className="h-px shrink-0"
            style={{ overflowAnchor: 'auto' }}
          />
        </div>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onSend}
          className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-100 active:scale-[0.98]"
        >
          Send message
        </button>
      </div>
    </div>
  );
}

export function RealtimeChatDemo() {
  const [messages, setMessages] = useState<ChatMsg[]>(CHAT_SEED);
  const [dots, setDots] = useState<ChatSyncDot[]>([]);
  const nextId = useRef(CHAT_SEED.length + 1);
  const cannedIdx = useRef(0);
  const dotIdRef = useRef(0);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);

  const clearTimeouts = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const fireSyncDot = useCallback((direction: ChatSyncDot['direction']) => {
    const id = dotIdRef.current++;
    setDots((prev) => [...prev, { id, direction }]);
    const t = setTimeout(() => {
      setDots((prev) => prev.filter((d) => d.id !== id));
    }, 350);
    timeouts.current.push(t);
  }, []);

  const sendNext = useCallback(
    (sender: 'daniel' | 'joe') => {
      const canned =
        CANNED_MESSAGES[cannedIdx.current % CANNED_MESSAGES.length];
      // Use the sender from the canned message pool but override with the button's owner
      const id = nextId.current++;
      const msg: ChatMsg = { id, sender, text: canned.text };
      cannedIdx.current++;
      setMessages((prev) => [...prev, msg]);
      fireSyncDot(sender === 'daniel' ? 'left-to-right' : 'right-to-left');
    },
    [fireSyncDot],
  );

  // Autoplay: 2 messages then loop
  const runCycle = useCallback(() => {
    clearTimeouts();
    nextId.current = CHAT_SEED.length + 1;
    cannedIdx.current = 0;
    setMessages(CHAT_SEED);

    const autoMsgs = CANNED_MESSAGES.slice(0, 2);
    autoMsgs.forEach((m, i) => {
      const delay = 1500 + i * 1800;
      const t = setTimeout(() => {
        const id = nextId.current++;
        setMessages((prev) => [
          ...prev,
          { id, sender: m.sender, text: m.text },
        ]);
        fireSyncDot(m.sender === 'daniel' ? 'left-to-right' : 'right-to-left');
        cannedIdx.current = i + 1;
      }, delay);
      timeouts.current.push(t);
    });

    const totalTime = 1500 + autoMsgs.length * 1800 + 4000;
    const tLoop = setTimeout(() => runCycle(), totalTime);
    timeouts.current.push(tLoop);
  }, [clearTimeouts, fireSyncDot]);

  const stopAutoplay = useCallback(() => {
    clearTimeouts();
  }, [clearTimeouts]);

  const handleSend = useCallback(
    (owner: 'daniel' | 'joe') => {
      stopAutoplay();
      sendNext(owner);
    },
    [stopAutoplay, sendNext],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted.current) {
          hasStarted.current = true;
          runCycle();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeouts();
    };
  }, [runCycle, clearTimeouts]);

  return (
    <div ref={containerRef} className="relative flex items-start gap-6">
      <ChatPhoneCard
        owner="daniel"
        messages={messages}
        onSend={() => handleSend('daniel')}
      />
      <ChatPhoneCard
        owner="joe"
        messages={messages}
        onSend={() => handleSend('joe')}
      />

      {/* Green sync dot */}
      {dots.map((dot) => (
        <span
          key={dot.id}
          className="pointer-events-none absolute top-1/2 h-2 w-2 rounded-full bg-green-400"
          style={{
            boxShadow:
              '0 0 8px 2px rgba(74, 222, 128, 0.6), 0 0 20px 4px rgba(74, 222, 128, 0.3)',
            animation: `${
              dot.direction === 'left-to-right'
                ? 'chatSyncDotLR'
                : 'chatSyncDotRL'
            } 0.3s ease-in-out forwards`,
          }}
        />
      ))}

      <style>{`
        @keyframes chatSyncDotLR {
          0% { left: 45%; opacity: 1; transform: translate(-50%, -50%) scale(0.8); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.3); }
          100% { left: 55%; opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
        }
        @keyframes chatSyncDotRL {
          0% { left: 55%; opacity: 1; transform: translate(-50%, -50%) scale(0.8); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.3); }
          100% { left: 45%; opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// Shared Checklist Demo — Daniel & Joe
// ─────────────────────────────────────────────

const SYNC_TASKS = [
  { id: 1, text: 'Review PR #42', done: false },
  { id: 2, text: 'Deploy to staging', done: false },
  { id: 3, text: 'Update docs', done: false },
];

type SyncDot = {
  id: number;
  direction: 'left-to-right' | 'right-to-left';
  yPx: number;
};

export function RealtimeChecklistDemo() {
  const [items, setItems] = useState(SYNC_TASKS.map((t) => ({ ...t })));
  const [dots, setDots] = useState<SyncDot[]>([]);
  const dotIdRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(
    (id: number, source: 'left' | 'right', e: React.MouseEvent) => {
      setItems((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      );
      const dotId = dotIdRef.current++;
      const direction: SyncDot['direction'] =
        source === 'left' ? 'left-to-right' : 'right-to-left';
      const containerRect = containerRef.current?.getBoundingClientRect();
      const yPx = containerRect ? e.clientY - containerRect.top : 0;
      setDots((prev) => [...prev, { id: dotId, direction, yPx }]);
      setTimeout(() => {
        setDots((prev) => prev.filter((d) => d.id !== dotId));
      }, 350);
    },
    [],
  );

  const Checkbox = ({ done }: { done: boolean }) => (
    <div
      className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
        done ? 'border-orange-600 bg-orange-600' : 'border-gray-300'
      }`}
    >
      {done && (
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
  );

  const TaskCard = ({
    name,
    img,
    source,
  }: {
    name: string;
    img: string;
    source: 'left' | 'right';
  }) => (
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
        <div className="mb-3 text-sm font-medium text-gray-500">Team Todos</div>
        <div className="space-y-1.5">
          {items.map((t) => (
            <button
              key={t.id}
              onClick={(e) => toggle(t.id, source, e)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
            >
              <Checkbox done={t.done} />
              <span
                className={`text-sm ${t.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}
              >
                {t.text}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="relative flex items-start gap-6">
      <TaskCard name="Daniel" img="/img/landing/daniel.png" source="left" />
      <TaskCard name="Joe" img="/img/landing/joe.jpg" source="right" />

      {/* Green sync dot that shoots through the gap between cards */}
      {dots.map((dot) => (
        <span
          key={dot.id}
          className="pointer-events-none absolute h-2 w-2 rounded-full bg-green-400"
          style={{
            top: dot.yPx,
            boxShadow:
              '0 0 8px 2px rgba(74, 222, 128, 0.6), 0 0 20px 4px rgba(74, 222, 128, 0.3)',
            animation: `${
              dot.direction === 'left-to-right' ? 'syncDotLR' : 'syncDotRL'
            } 0.3s ease-in-out forwards`,
          }}
        />
      ))}

      <style>{`
        @keyframes syncDotLR {
          0% { left: 45%; opacity: 1; transform: translate(-50%, -50%) scale(0.8); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.3); }
          100% { left: 55%; opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
        }
        @keyframes syncDotRL {
          0% { left: 55%; opacity: 1; transform: translate(-50%, -50%) scale(0.8); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.3); }
          100% { left: 45%; opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
        }
      `}</style>
    </div>
  );
}
