'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useState, useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Shared: The left-side text that appears next to every variant
// ---------------------------------------------------------------------------
function SectionText() {
  return (
    <div className="col-span-1">
      <h3 className="text-2xl font-semibold sm:text-3xl">Instant updates</h3>
      <p className="mt-2 text-lg">
        Click a button, toggle a switch, type in a field — whatever you do, you
        see the result right away. Your apps feel more responsive and alive and
        your users stay in flow.
      </p>
    </div>
  );
}

function DemoShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-gray-400 uppercase">
        {label}
      </h2>
      <div className="grid grid-cols-3 items-center gap-6">
        <SectionText />
        <div className="col-span-2 rounded-2xl bg-[#B8B8B8]/20 px-20 py-9">
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A: "Feel the Difference" — toggle between Traditional (with latency) and
//    Instant mode so the visitor viscerally feels what optimistic updates buy.
// ---------------------------------------------------------------------------
export function FeelTheDifferenceDemo() {
  const [mode, setMode] = useState<'instant' | 'traditional'>('traditional');
  const [items, setItems] = useState([
    { id: 1, text: 'Design landing page', done: true },
    { id: 2, text: 'Write API docs', done: false },
    { id: 3, text: 'Ship v1.0', done: false },
  ]);
  const [pending, setPending] = useState<number | null>(null);

  const toggle = (id: number) => {
    if (mode === 'instant') {
      setItems((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      );
    } else {
      // Simulate a network round-trip
      setPending(id);
      setTimeout(() => {
        setItems((prev) =>
          prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
        );
        setPending(null);
      }, 600);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {/* Mode toggle */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium">My Tasks</span>
        <div className="flex items-center gap-1 rounded-full bg-gray-100 p-0.5 text-xs font-medium">
          <button
            onClick={() => setMode('traditional')}
            className={`rounded-full px-3 py-1 transition-colors ${
              mode === 'traditional'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500'
            }`}
          >
            Traditional
          </button>
          <button
            onClick={() => setMode('instant')}
            className={`rounded-full px-3 py-1 transition-colors ${
              mode === 'instant'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500'
            }`}
          >
            Instant
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {items.map((t) => (
          <button
            key={t.id}
            onClick={() => toggle(t.id)}
            disabled={pending !== null}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50 disabled:opacity-60"
          >
            <div
              className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
                pending === t.id
                  ? 'border-gray-300 bg-gray-100'
                  : t.done
                    ? 'border-orange-600 bg-orange-600'
                    : 'border-gray-300'
              }`}
            >
              {pending === t.id ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
              ) : (
                t.done && (
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
                )
              )}
            </div>
            <span
              className={`text-sm ${t.done && pending !== t.id ? 'text-gray-400 line-through' : 'text-gray-700'}`}
            >
              {t.text}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-3 text-center text-xs text-gray-400">
        {mode === 'traditional'
          ? 'Toggle "Instant" to feel the difference'
          : 'Click a task — no spinner, no delay'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// B: Under-the-hood timeline — shows the optimistic update pipeline
// ---------------------------------------------------------------------------
export function UnderTheHoodDemo() {
  const [items, setItems] = useState([
    { id: 1, text: 'Design landing page', done: true },
    { id: 2, text: 'Write API docs', done: false },
    { id: 3, text: 'Ship v1.0', done: false },
  ]);

  type TimelineStep = {
    label: string;
    status: 'pending' | 'active' | 'done';
  };

  const [timeline, setTimeline] = useState<TimelineStep[]>([]);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);

  const clearTimeouts = () => {
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];
  };

  const toggle = (id: number) => {
    setItems((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );

    clearTimeouts();

    // Animate the pipeline
    const steps = [
      'Optimistic update',
      'Mutation sent',
      'Server confirmed',
      'Peers notified',
    ];

    setTimeline(steps.map((label) => ({ label, status: 'pending' })));

    steps.forEach((_, i) => {
      const t1 = setTimeout(() => {
        setTimeline((prev) =>
          prev.map((s, j) => (j === i ? { ...s, status: 'active' } : s)),
        );
      }, i * 400);

      const t2 = setTimeout(
        () => {
          setTimeline((prev) =>
            prev.map((s, j) => (j === i ? { ...s, status: 'done' } : s)),
          );
        },
        i * 400 + 300,
      );

      timeoutRefs.current.push(t1, t2);
    });

    const tClear = setTimeout(() => setTimeline([]), 2400);
    timeoutRefs.current.push(tClear);
  };

  useEffect(() => () => clearTimeouts(), []);

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
        {items.map((t) => (
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

      {/* Pipeline visualization */}
      <div className="mt-4 min-h-[32px]">
        {timeline.length > 0 && (
          <div className="flex items-center gap-1">
            {timeline.map((step, i) => (
              <div key={i} className="flex items-center gap-1">
                <div
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-all duration-200 ${
                    step.status === 'done'
                      ? 'bg-green-100 text-green-700'
                      : step.status === 'active'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {step.status === 'done' ? '✓ ' : ''}
                  {step.label}
                </div>
                {i < timeline.length - 1 && (
                  <svg
                    className="h-3 w-3 text-gray-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m8.25 4.5 7.5 7.5-7.5 7.5"
                    />
                  </svg>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-2 text-center text-xs text-gray-400">
        Click a task — UI updates first, network follows
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// C: Code + Result — shows the one-liner that powers the interaction
// ---------------------------------------------------------------------------
export function CodeAndResultDemo() {
  const [items, setItems] = useState([
    { id: 1, text: 'Design landing page', done: true },
    { id: 2, text: 'Write API docs', done: false },
    { id: 3, text: 'Ship v1.0', done: false },
  ]);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const toggle = (id: number) => {
    const item = items.find((t) => t.id === id);
    if (!item) return;
    const newDone = !item.done;
    setItems((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: newDone } : t)),
    );
    setLastAction(
      `db.transact(tx.todos["${id}"].update({ done: ${newDone} }))`,
    );
    setSynced(false);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setSynced(true), 800);
  };

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return (
    <div className="space-y-3">
      {/* Code panel */}
      <div className="rounded-xl border border-gray-200 bg-[#1e1e2e] p-4 font-mono text-sm shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-medium tracking-wider text-gray-500 uppercase">
            Your code
          </span>
          {lastAction && (
            <span
              className={`ml-auto text-[10px] font-medium transition-colors ${synced ? 'text-green-400' : 'text-orange-400'}`}
            >
              {synced ? '● synced' : '● syncing...'}
            </span>
          )}
        </div>
        <div className="min-h-[24px]">
          {lastAction ? (
            <span className="text-green-300">{lastAction}</span>
          ) : (
            <span className="text-gray-600">{'// click a task below...'}</span>
          )}
        </div>
      </div>

      {/* Result panel */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium">My Tasks</span>
          <span className="flex items-center gap-1 text-xs font-medium text-green-600">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Synced
          </span>
        </div>
        <div className="space-y-1.5">
          {items.map((t) => (
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
          One line of code. Zero perceived latency.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// D: Drag-to-reorder list — richer interaction showing instant persistence
// ---------------------------------------------------------------------------
export function DragReorderDemo() {
  const [items, setItems] = useState([
    { id: 1, text: 'Design landing page', priority: 'high' },
    { id: 2, text: 'Write API docs', priority: 'med' },
    { id: 3, text: 'Ship v1.0', priority: 'high' },
    { id: 4, text: 'Set up CI/CD', priority: 'low' },
  ]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [writeCount, setWriteCount] = useState(0);

  const dragStart = (id: number) => setDragging(id);

  const dragOver = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (dragging === null || dragging === targetId) return;
    setItems((prev) => {
      const arr = [...prev];
      const fromIdx = arr.findIndex((i) => i.id === dragging);
      const toIdx = arr.findIndex((i) => i.id === targetId);
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      return arr;
    });
    setWriteCount((c) => c + 1);
  };

  const dragEnd = () => setDragging(null);

  const priorityColors: Record<string, string> = {
    high: 'bg-red-100 text-red-700',
    med: 'bg-amber-100 text-amber-700',
    low: 'bg-green-100 text-green-700',
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium">Backlog</span>
        <span className="flex items-center gap-1 text-xs font-medium text-green-600">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          {writeCount > 0 ? `${writeCount} writes synced` : 'Synced'}
        </span>
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => dragStart(item.id)}
            onDragOver={(e) => dragOver(e, item.id)}
            onDragEnd={dragEnd}
            className={`flex cursor-grab items-center gap-3 rounded-lg border px-3 py-2.5 transition-all active:cursor-grabbing ${
              dragging === item.id
                ? 'border-orange-300 bg-orange-50 shadow-md'
                : 'border-transparent bg-gray-50'
            }`}
          >
            <span className="text-xs text-gray-300">
              {String(i + 1).padStart(2, '0')}
            </span>
            <svg
              className="h-4 w-4 shrink-0 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 9h16.5m-16.5 6.75h16.5"
              />
            </svg>
            <span className="flex-1 text-sm text-gray-700">{item.text}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityColors[item.priority]}`}
            >
              {item.priority}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">
        Drag to reorder — every move persisted instantly
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// E: Live Timer — pill toggle between "With Instant" / "Without Instant".
//    One card, task list, footer with a live-counting timer.
//    With Instant: checkbox toggles immediately, footer flashes "0ms".
//    Without Instant: checkbox freezes + spinner, timer ticks up in real-time
//    via requestAnimationFrame, resolves at ~600ms.
// ---------------------------------------------------------------------------

type FooterState =
  | { kind: 'idle' }
  | { kind: 'instant'; visible: boolean }
  | { kind: 'ticking' }
  | { kind: 'done'; ms: number };

export function SideBySideDemo() {
  // "With Instant" state
  const [fastItems, setFastItems] = useState([
    { id: 1, text: 'Design landing page', done: true },
    { id: 2, text: 'Write API docs', done: false },
    { id: 3, text: 'Ship v1.0', done: false },
  ]);
  const [fastFooter, setFastFooter] = useState<'idle' | 'flash'>('idle');
  const fastFadeRef = useRef<NodeJS.Timeout | null>(null);

  // "Without Instant" state
  const [slowItems, setSlowItems] = useState([
    { id: 1, text: 'Design landing page', done: true },
    { id: 2, text: 'Write API docs', done: false },
    { id: 3, text: 'Ship v1.0', done: false },
  ]);
  const [pending, setPending] = useState<number | null>(null);
  const [slowFooter, setSlowFooter] = useState<'idle' | 'waiting' | 'done'>(
    'idle',
  );
  const resolveRef = useRef<NodeJS.Timeout | null>(null);

  const toggle = (id: number) => {
    if (pending !== null) return;

    // Fast side: instant
    setFastItems((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
    setFastFooter('flash');
    if (fastFadeRef.current) clearTimeout(fastFadeRef.current);
    fastFadeRef.current = setTimeout(() => setFastFooter('idle'), 2000);

    // Slow side: delayed
    setPending(id);
    setSlowFooter('waiting');
    if (resolveRef.current) clearTimeout(resolveRef.current);
    resolveRef.current = setTimeout(() => {
      setSlowItems((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      );
      setPending(null);
      setSlowFooter('done');
    }, 600);
  };

  useEffect(
    () => () => {
      if (fastFadeRef.current) clearTimeout(fastFadeRef.current);
      if (resolveRef.current) clearTimeout(resolveRef.current);
    },
    [],
  );

  const Checkbox = ({
    done,
    isPending,
  }: {
    done: boolean;
    isPending: boolean;
  }) => (
    <div
      className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
        isPending
          ? 'border-gray-300 bg-gray-100'
          : done
            ? 'border-orange-600 bg-orange-600'
            : 'border-gray-300'
      }`}
    >
      {isPending ? (
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
      ) : (
        done && (
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
        )
      )}
    </div>
  );

  return (
    <div className="flex items-start gap-6">
      {/* With Instant */}
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2.5 px-1">
          <img
            src="/img/icon/favicon-96x96.svg"
            alt="Instant"
            className="h-6 w-6 rounded"
          />
          <span className="text-sm font-medium">With Instant</span>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-medium text-gray-500">My Tasks</div>
          <div className="space-y-1.5">
            {fastItems.map((t) => (
              <button
                key={t.id}
                onClick={() => toggle(t.id)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
              >
                <Checkbox done={t.done} isPending={false} />
                <span
                  className={`text-sm ${t.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}
                >
                  {t.text}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex min-h-[20px] items-center justify-center">
            {fastFooter === 'flash' && (
              <span className="text-xs font-medium text-green-600">0ms ✓</span>
            )}
          </div>
        </div>
      </div>

      {/* Without Instant */}
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2.5 px-1">
          <span className="text-lg">😟</span>
          <span className="text-sm font-medium">Without Instant</span>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-medium text-gray-500">My Tasks</div>
          <div className="space-y-1.5">
            {slowItems.map((t) => (
              <button
                key={t.id}
                onClick={() => toggle(t.id)}
                disabled={pending !== null}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50 disabled:cursor-not-allowed"
              >
                <Checkbox done={t.done} isPending={pending === t.id} />
                <span
                  className={`text-sm ${t.done && pending !== t.id ? 'text-gray-400 line-through' : 'text-gray-700'}`}
                >
                  {t.text}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex min-h-[20px] items-center justify-center">
            {slowFooter === 'waiting' && (
              <span className="text-xs font-medium text-amber-600">
                Waiting for server...
              </span>
            )}
            {slowFooter === 'done' && (
              <span className="text-xs font-medium text-gray-400">600ms</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type DemoMode = 'traditional' | 'instant';

type ModeConfig = {
  id: DemoMode;
  label: string;
  tint: string;
  ring: string;
  uiAt: number;
  peersAt: number;
  ackAt: number;
};

const DEMO_DURATION_MS = 800;

const MODE_CONFIGS: ModeConfig[] = [
  {
    id: 'traditional',
    label: 'Traditional',
    tint: 'bg-amber-50',
    ring: 'border-amber-200',
    uiAt: 620,
    peersAt: 730,
    ackAt: 620,
  },
  {
    id: 'instant',
    label: 'Instant',
    tint: 'bg-emerald-50',
    ring: 'border-emerald-200',
    uiAt: 0,
    peersAt: 220,
    ackAt: 420,
  },
];

export function SyncPulseDemo() {
  const [ms, setMs] = useState(0);
  const progressWidth = (ms / DEMO_DURATION_MS) * 100;
  const transactSnippet =
    'db.transact(tx.reactions[postId].update({ count: count + 1 }))';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">
            One action in time
          </p>
          <p className="text-xs text-gray-500">Scrub and compare both models</p>
        </div>
        <button
          onClick={() => setMs(0)}
          className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Reset
        </button>
      </div>

      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-gray-600">t = {ms}ms</span>
        <span className="text-gray-500">Real-time by default</span>
      </div>
      <div className="relative">
        <div className="absolute top-1/2 right-0 left-0 h-1 -translate-y-1/2 rounded-full bg-gray-100" />
        <motion.div
          className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-orange-500"
          initial={false}
          animate={{ width: `${progressWidth}%` }}
          transition={{ type: 'spring', stiffness: 240, damping: 30 }}
        />
        <motion.div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-orange-500 shadow-sm"
          initial={false}
          animate={{ left: `calc(${progressWidth}% - 6px)` }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        />
        <input
          aria-label="timeline"
          type="range"
          min={0}
          max={DEMO_DURATION_MS}
          step={10}
          value={ms}
          onChange={(e) => setMs(Number(e.target.value))}
          className="relative z-10 h-6 w-full cursor-ew-resize appearance-none bg-transparent"
        />
      </div>

      <div className="mt-4 grid gap-2">
        {MODE_CONFIGS.map((mode) => (
          <ModeLane key={mode.id} mode={mode} ms={ms} />
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-[#1f1f2e] p-3 font-mono text-[11px] text-green-300 sm:text-xs">
        {transactSnippet}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        In Instant mode, `transact` applies locally at `0ms`, then sync catches
        everyone else up.
      </p>
    </div>
  );
}

function ModeLane({ mode, ms }: { mode: ModeConfig; ms: number }) {
  const uiOn = ms >= mode.uiAt;
  const peersOn = ms >= mode.peersAt;
  const ackOn = ms >= mode.ackAt;
  const myCount = 42 + (uiOn ? 1 : 0);
  const peerCount = 42 + (peersOn ? 1 : 0);

  const stepText = !uiOn
    ? 'waiting on network'
    : !peersOn
      ? 'local UI is updated'
      : !ackOn
        ? 'peers are updating'
        : 'fully synced';

  return (
    <motion.div
      layout
      initial={false}
      className={`rounded-lg border p-3 ${mode.ring} ${mode.tint}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">
          {mode.label}
        </span>
        <span className="text-[11px] text-gray-500">{stepText}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <CounterPill label="You" count={myCount} active={uiOn} />
        <CounterPill label="Maya" count={peerCount} active={peersOn} />
        <CounterPill label="Leo" count={peerCount} active={peersOn} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
        <StatusChip label="UI" on={uiOn} when={mode.uiAt} />
        <StatusChip label="Peers" on={peersOn} when={mode.peersAt} />
        <StatusChip label="Ack" on={ackOn} when={mode.ackAt} />
      </div>
    </motion.div>
  );
}

function CounterPill({
  label,
  count,
  active,
}: {
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-2 py-1 ${
        active ? 'border-orange-300 bg-white' : 'border-gray-200 bg-white/70'
      }`}
    >
      <div className="text-[10px] font-medium text-gray-500">{label}</div>
      <div className="mt-0.5 flex min-w-[24px] text-sm font-semibold text-gray-900 tabular-nums">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={count}
            initial={{ y: 6, opacity: 0.2 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -6, opacity: 0.2 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            {count}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatusChip({
  label,
  on,
  when,
}: {
  label: string;
  on: boolean;
  when: number;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-medium ${
        on ? 'bg-orange-100 text-orange-700' : 'bg-white text-gray-500'
      }`}
    >
      {label} {when}ms
    </span>
  );
}

// ---------------------------------------------------------------------------
// F: Auto-playing rapid sequence with user takeover
// ---------------------------------------------------------------------------

const autoPlayTaskData = [
  { id: 1, text: 'Design landing page', done: false },
  { id: 2, text: 'Write API docs', done: false },
  { id: 3, text: 'Ship v1.0', done: false },
];

function AutoPlayCheckbox({
  done,
  isPending,
}: {
  done: boolean;
  isPending: boolean;
}) {
  return (
    <div
      className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
        isPending
          ? 'border-gray-300 bg-gray-100'
          : done
            ? 'border-orange-600 bg-orange-600'
            : 'border-gray-300'
      }`}
    >
      {isPending ? (
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
      ) : (
        done && (
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
        )
      )}
    </div>
  );
}

function AutoPlayTaskCard({
  title,
  items,
  pending,
  onToggle,
}: {
  title: string;
  items: { id: number; text: string; done: boolean }[];
  pending?: number | null;
  onToggle?: (id: number) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="space-y-1.5">
        {items.map((t) => (
          <button
            key={t.id}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-gray-50"
            onClick={() => onToggle?.(t.id)}
          >
            <AutoPlayCheckbox done={t.done} isPending={pending === t.id} />
            <span
              className={
                t.done && pending !== t.id ? 'text-gray-400 line-through' : ''
              }
            >
              {t.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AutoPlayFakeCursor({ index }: { index: number }) {
  const top = 40 + 60 + index * 38;
  return (
    <motion.div
      className="pointer-events-none absolute z-10"
      initial={false}
      animate={{ top, left: 28 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <svg
        width="16"
        height="20"
        viewBox="0 0 16 20"
        fill="none"
        className="drop-shadow-md"
      >
        <path
          d="M1 1L1 15L5 11L9 18L12 16.5L8 9.5L13 9L1 1Z"
          fill="black"
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>
    </motion.div>
  );
}

export function AutoPlayDemo() {
  const [fastItems, setFastItems] = useState(
    autoPlayTaskData.map((t) => ({ ...t, done: false })),
  );
  const [slowItems, setSlowItems] = useState(
    autoPlayTaskData.map((t) => ({ ...t, done: false })),
  );
  const [slowPending, setSlowPending] = useState<number | null>(null);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [activeSide, setActiveSide] = useState<'fast' | 'slow' | null>(null);
  const [fastDone, setFastDone] = useState(false);
  const [slowDone, setSlowDone] = useState(false);
  const [userTookOver, setUserTookOver] = useState(false);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const restartTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
    if (restartTimeout.current) {
      clearTimeout(restartTimeout.current);
      restartTimeout.current = null;
    }
  };

  const runCycle = useCallback(() => {
    clear();
    setFastItems(autoPlayTaskData.map((t) => ({ ...t, done: false })));
    setSlowItems(autoPlayTaskData.map((t) => ({ ...t, done: false })));
    setSlowPending(null);
    setCursorIndex(null);
    setActiveSide(null);
    setFastDone(false);
    setSlowDone(false);
    setUserTookOver(false);

    const ids = autoPlayTaskData.map((t) => t.id);

    ids.forEach((id, i) => {
      const t = setTimeout(
        () => {
          setActiveSide('fast');
          setCursorIndex(i);
          setFastItems((prev) =>
            prev.map((t) => (t.id === id ? { ...t, done: true } : t)),
          );
        },
        500 + i * 150,
      );
      timeouts.current.push(t);
    });

    const fastEnd = 500 + (ids.length - 1) * 150 + 100;
    timeouts.current.push(setTimeout(() => setFastDone(true), fastEnd));

    const slowStart = 500 + ids.length * 150 + 800;
    ids.forEach((id, i) => {
      const tClick = setTimeout(
        () => {
          setActiveSide('slow');
          setCursorIndex(i);
          setSlowPending(id);
        },
        slowStart + i * 750,
      );
      timeouts.current.push(tClick);

      const tResolve = setTimeout(
        () => {
          setSlowItems((prev) =>
            prev.map((t) => (t.id === id ? { ...t, done: true } : t)),
          );
          setSlowPending(null);
        },
        slowStart + i * 750 + 600,
      );
      timeouts.current.push(tResolve);
    });

    const slowEnd = slowStart + (ids.length - 1) * 750 + 600;
    timeouts.current.push(setTimeout(() => setSlowDone(true), slowEnd));

    const totalTime = slowEnd + 5000;
    const tLoop = setTimeout(() => {
      runCycle();
    }, totalTime);
    timeouts.current.push(tLoop);
  }, []);

  const slowQueueRef = useRef<number[]>([]);
  const slowProcessingRef = useRef(false);

  const processSlowQueue = useCallback(() => {
    if (slowProcessingRef.current || slowQueueRef.current.length === 0) return;
    slowProcessingRef.current = true;
    const id = slowQueueRef.current.shift()!;
    setSlowPending(id);
    const t = setTimeout(() => {
      setSlowItems((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      );
      setSlowPending(null);
      setSlowDone(true);
      slowProcessingRef.current = false;
      processSlowQueue();
    }, 600);
    timeouts.current.push(t);
  }, []);

  const handleUserClick = (side: 'fast' | 'slow', id: number) => {
    if (!userTookOver) {
      clear();
      setUserTookOver(true);
      setCursorIndex(null);
      setActiveSide(null);
      // Keep current item state — just stop autoplay and hide cursor
    }

    if (restartTimeout.current) clearTimeout(restartTimeout.current);
    restartTimeout.current = setTimeout(() => {
      runCycle();
    }, 5000);

    if (side === 'fast') {
      setFastItems((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      );
      setFastDone(true);
    } else {
      slowQueueRef.current.push(id);
      processSlowQueue();
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);

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
      clear();
    };
  }, [runCycle]);

  const showCursor = !userTookOver && activeSide && cursorIndex !== null;

  return (
    <div ref={containerRef} className="flex items-start gap-6">
      <div className="relative min-w-0 flex-1">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <img
              src="/img/icon/favicon-96x96.svg"
              alt="Instant"
              className="h-6 w-6 rounded"
            />
            <span className="text-sm font-medium">With Instant</span>
          </div>
          <span className="text-xs font-medium text-green-600">
            Updates right away
          </span>
        </div>
        <AutoPlayTaskCard
          title="My Tasks"
          items={fastItems}
          onToggle={(id) => handleUserClick('fast', id)}
        />
        {showCursor && activeSide === 'fast' && (
          <AutoPlayFakeCursor index={cursorIndex!} />
        )}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-medium">Without Instant</span>
          </div>
          <span className="text-xs font-medium text-gray-400">
            Waits on the server
          </span>
        </div>
        <AutoPlayTaskCard
          title="My Tasks"
          items={slowItems}
          pending={slowPending}
          onToggle={(id) => handleUserClick('slow', id)}
        />
        {showCursor && activeSide === 'slow' && (
          <AutoPlayFakeCursor index={cursorIndex!} />
        )}
      </div>
    </div>
  );
}
