import Head from 'next/head';
import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const taskData = [
  { id: 1, text: 'Design landing page', done: false },
  { id: 2, text: 'Write API docs', done: false },
  { id: 3, text: 'Ship v1.0', done: false },
];

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

function TaskCard({
  title,
  badge,
  items,
  pending,
  queued,
  onToggle,
  footer,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  items: { id: number; text: string; done: boolean }[];
  pending?: number | null;
  queued?: Set<number>;
  onToggle?: (id: number) => void;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        {badge}
      </div>
      <div className="space-y-1.5">
        {items.map((t) => (
          <button
            key={t.id}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-gray-50"
            onClick={() => onToggle?.(t.id)}
          >
            <Checkbox done={t.done} isPending={pending === t.id} />
            <span
              className={
                t.done && pending !== t.id ? 'text-gray-400 line-through' : ''
              }
            >
              {t.text}
            </span>
            {queued?.has(t.id) && (
              <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                queued
              </span>
            )}
          </button>
        ))}
      </div>
      {children}
      {footer && (
        <p className="mt-3 text-center text-xs text-gray-400">{footer}</p>
      )}
    </div>
  );
}

const InstantBadge = () => (
  <span className="flex items-center gap-1 text-xs font-medium text-green-600">
    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
    Instant
  </span>
);

const TraditionalBadge = () => (
  <span className="flex items-center gap-1 text-xs font-medium text-gray-400">
    <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
    Traditional
  </span>
);

function SectionShell({
  heading,
  description,
  children,
}: {
  heading: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 items-center gap-6">
      <div className="col-span-1">
        <h3 className="text-2xl font-semibold sm:text-3xl">{heading}</h3>
        <p className="mt-2 text-lg text-gray-600">{description}</p>
      </div>
      <div className="col-span-2 rounded-2xl bg-[#B8B8B8]/20 px-12 py-9">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant 1 — Auto-playing rapid sequence
// ---------------------------------------------------------------------------

function AutoPlayDemo() {
  const [fastItems, setFastItems] = useState(
    taskData.map((t) => ({ ...t, done: false })),
  );
  const [slowItems, setSlowItems] = useState(
    taskData.map((t) => ({ ...t, done: false })),
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
    setFastItems(taskData.map((t) => ({ ...t, done: false })));
    setSlowItems(taskData.map((t) => ({ ...t, done: false })));
    setSlowPending(null);
    setCursorIndex(null);
    setActiveSide(null);
    setFastDone(false);
    setSlowDone(false);
    setUserTookOver(false);

    const ids = taskData.map((t) => t.id);

    // --- Fast side: click all 3 rapidly (~150ms apart) ---
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

    // Show fast footer after last fast click
    const fastEnd = 500 + (ids.length - 1) * 150 + 100;
    timeouts.current.push(setTimeout(() => setFastDone(true), fastEnd));

    // --- Slow side: sequential, each waits 600ms for "server" ---
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

    // Show slow footer after last slow resolve
    const slowEnd = slowStart + (ids.length - 1) * 750 + 600;
    timeouts.current.push(setTimeout(() => setSlowDone(true), slowEnd));

    // --- Reset & loop (5s pause) ---
    const totalTime = slowEnd + 5000;
    const tLoop = setTimeout(() => {
      runCycle();
    }, totalTime);
    timeouts.current.push(tLoop);
  }, []);

  // --- User interaction: pause autoplay, let user drive ---
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
      // First user click: pause autoplay, reset state
      clear();
      setUserTookOver(true);
      setCursorIndex(null);
      setActiveSide(null);
      setFastItems(taskData.map((t) => ({ ...t, done: false })));
      setSlowItems(taskData.map((t) => ({ ...t, done: false })));
      setSlowPending(null);
      setFastDone(false);
      setSlowDone(false);
      slowQueueRef.current = [];
      slowProcessingRef.current = false;
    }

    // Schedule restart after 5s of inactivity
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

  useEffect(() => {
    runCycle();
    return clear;
  }, [runCycle]);

  const showCursor = !userTookOver && activeSide && cursorIndex !== null;

  return (
    <SectionShell
      heading="Instant updates"
      description="Watch the same 3 tasks get checked off. Instant completes in under half a second. Traditional takes 4x longer."
    >
      <div className="flex items-start gap-6">
        <div className="relative min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2.5 px-1">
            <img
              src="/img/icon/favicon-96x96.svg"
              alt="Instant"
              className="h-6 w-6 rounded"
            />
            <span className="text-sm font-medium">With Instant</span>
          </div>
          <TaskCard
            title="My Tasks"
            items={fastItems}
            onToggle={(id) => handleUserClick('fast', id)}
          />
          <motion.p
            className="mt-2 px-1 text-xs font-medium text-green-600"
            initial={{ opacity: 0 }}
            animate={{ opacity: fastDone ? 1 : 0 }}
            transition={{ duration: 0.3 }}
          >
            Updates right away
          </motion.p>
          {showCursor && activeSide === 'fast' && (
            <FakeCursor index={cursorIndex!} />
          )}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2.5 px-1">
            <span className="text-lg">😬</span>
            <span className="text-sm font-medium">Without Instant</span>
          </div>
          <TaskCard
            title="My Tasks"
            items={slowItems}
            pending={slowPending}
            onToggle={(id) => handleUserClick('slow', id)}
          />
          <motion.p
            className="mt-2 px-1 text-xs font-medium text-gray-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: slowDone ? 1 : 0 }}
            transition={{ duration: 0.3 }}
          >
            Waits on the server
          </motion.p>
          {activeSide === 'slow' && cursorIndex !== null && (
            <FakeCursor index={cursorIndex} />
          )}
        </div>
      </div>
    </SectionShell>
  );
}

function FakeCursor({ index }: { index: number }) {
  // Position cursor near the checkbox of each item
  // 40px for the outside label, ~60px for the card header/padding, then ~38px per row
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

// ---------------------------------------------------------------------------
// Variant 2 — Rapid-fire clicking (interactive)
// ---------------------------------------------------------------------------

function RapidFireDemo() {
  const [fastItems, setFastItems] = useState(taskData.map((t) => ({ ...t })));
  const [slowItems, setSlowItems] = useState(taskData.map((t) => ({ ...t })));
  const [slowPending, setSlowPending] = useState<number | null>(null);
  const [slowQueue, setSlowQueue] = useState<Set<number>>(new Set());
  const queueRef = useRef<number[]>([]);
  const processingRef = useRef(false);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const processQueue = useCallback(() => {
    if (processingRef.current || queueRef.current.length === 0) return;
    processingRef.current = true;

    const id = queueRef.current.shift()!;
    setSlowQueue(new Set(queueRef.current));
    setSlowPending(id);

    const t = setTimeout(() => {
      setSlowItems((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      );
      setSlowPending(null);
      processingRef.current = false;
      processQueue();
    }, 600);
    timeouts.current.push(t);
  }, []);

  const toggleFast = (id: number) => {
    setFastItems((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  };

  const toggleSlow = (id: number) => {
    queueRef.current.push(id);
    setSlowQueue(new Set(queueRef.current));
    processQueue();
  };

  useEffect(() => {
    return () => timeouts.current.forEach(clearTimeout);
  }, []);

  return (
    <SectionShell
      heading="Instant updates"
      description="Click tasks as fast as you can. Instant keeps up. Traditional queues every click and resolves them one by one."
    >
      <div className="grid grid-cols-2 gap-6">
        <TaskCard
          title="With Instant"
          badge={<InstantBadge />}
          items={fastItems}
          onToggle={toggleFast}
          footer="Click a task — no spinner, no delay"
        />
        <TaskCard
          title="Without Instant"
          badge={<TraditionalBadge />}
          items={slowItems}
          pending={slowPending}
          queued={slowQueue}
          onToggle={toggleSlow}
          footer="Click rapidly — watch the queue build up"
        />
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Variant 3 — Single card mode toggle
// ---------------------------------------------------------------------------

function ToggleModeDemo() {
  const [isInstant, setIsInstant] = useState(false);
  const [items, setItems] = useState(taskData.map((t) => ({ ...t })));
  const [pending, setPending] = useState<number | null>(null);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const toggle = (id: number) => {
    if (isInstant) {
      setItems((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      );
    } else {
      if (pending) return; // block while pending
      setPending(id);
      const t = setTimeout(() => {
        setItems((prev) =>
          prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
        );
        setPending(null);
      }, 600);
      timeouts.current.push(t);
    }
  };

  useEffect(() => {
    return () => timeouts.current.forEach(clearTimeout);
  }, []);

  const helperText = isInstant
    ? 'Click a task — it responds instantly'
    : 'Click a task — notice the delay';

  return (
    <SectionShell
      heading="Instant updates"
      description="Feel the difference yourself. Start in Traditional mode, then flip the switch."
    >
      <div className="mx-auto max-w-sm">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          {/* Toggle */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium">My Tasks</span>
            <button
              className="flex items-center gap-2 text-xs font-medium"
              onClick={() => setIsInstant((v) => !v)}
            >
              <span className={isInstant ? 'text-gray-400' : 'text-gray-700'}>
                Traditional
              </span>
              <div
                className={`relative h-5 w-9 rounded-full transition-colors ${isInstant ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <motion.div
                  className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow"
                  animate={{ left: isInstant ? 18 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </div>
              <span className={isInstant ? 'text-green-600' : 'text-gray-400'}>
                Instant
              </span>
            </button>
          </div>

          {/* Tasks */}
          <div className="space-y-1.5">
            {items.map((t) => (
              <button
                key={t.id}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-gray-50"
                onClick={() => toggle(t.id)}
              >
                <Checkbox done={t.done} isPending={pending === t.id} />
                <span
                  className={
                    t.done && pending !== t.id
                      ? 'text-gray-400 line-through'
                      : ''
                  }
                >
                  {t.text}
                </span>
              </button>
            ))}
          </div>

          <p className="mt-3 text-center text-xs text-gray-400">{helperText}</p>
        </div>
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Variant 4 — "Add item" workflow
// ---------------------------------------------------------------------------

const newTaskNames = [
  'Review PR #42',
  'Update docs',
  'Deploy to staging',
  'Fix login bug',
  'Add unit tests',
  'Refactor auth',
];

function AddItemDemo() {
  const [fastItems, setFastItems] = useState<string[]>([]);
  const [slowItems, setSlowItems] = useState<string[]>([]);
  const [slowLoading, setSlowLoading] = useState(false);
  const counterRef = useRef(0);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const addItem = () => {
    if (slowLoading) return;
    const name = newTaskNames[counterRef.current % newTaskNames.length];
    counterRef.current++;

    // Reset after 5 items
    if (fastItems.length >= 5) {
      setFastItems([name]);
      setSlowLoading(true);
      const t = setTimeout(() => {
        setSlowItems([name]);
        setSlowLoading(false);
      }, 600);
      timeouts.current.push(t);
      return;
    }

    // Instant side: add immediately
    setFastItems((prev) => [...prev, name]);

    // Slow side: loading then add
    setSlowLoading(true);
    const t = setTimeout(() => {
      setSlowItems((prev) => [...prev, name]);
      setSlowLoading(false);
    }, 600);
    timeouts.current.push(t);
  };

  useEffect(() => {
    return () => timeouts.current.forEach(clearTimeout);
  }, []);

  return (
    <SectionShell
      heading="Instant updates"
      description="Add tasks and see them appear. One side responds immediately. The other waits for the server."
    >
      <div className="grid grid-cols-2 gap-6">
        <ItemListCard
          title="With Instant"
          badge={<InstantBadge />}
          items={fastItems}
          loading={false}
          onAdd={addItem}
        />
        <ItemListCard
          title="Without Instant"
          badge={<TraditionalBadge />}
          items={slowItems}
          loading={slowLoading}
          onAdd={addItem}
        />
      </div>
    </SectionShell>
  );
}

function ItemListCard({
  title,
  badge,
  items,
  loading,
  onAdd,
}: {
  title: string;
  badge: React.ReactNode;
  items: string[];
  loading: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        {badge}
      </div>
      <div className="min-h-[160px] space-y-1.5">
        <AnimatePresence initial={false}>
          {items.map((item, i) => (
            <motion.div
              key={`${item}-${i}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-md border-2 border-gray-300" />
              <span>{item}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <button
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
        onClick={onAdd}
      >
        {loading ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
        ) : (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
        )}
        {loading ? 'Adding...' : 'Add task'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InstantUpdatesDemoV2() {
  return (
    <>
      <Head>
        <title>Instant Updates — Demo Variants</title>
      </Head>
      <div className="mx-auto max-w-5xl space-y-24 px-6 py-16">
        <div>
          <h1 className="text-3xl font-bold">
            Instant Updates — Demo Variants
          </h1>
          <p className="mt-2 text-gray-500">
            4 approaches to demonstrate the speed difference.
          </p>
        </div>

        <div>
          <h2 className="mb-6 text-sm font-semibold tracking-wide text-gray-400 uppercase">
            Variant 1 — Auto-playing sequence
          </h2>
          <AutoPlayDemo />
        </div>

        <div>
          <h2 className="mb-6 text-sm font-semibold tracking-wide text-gray-400 uppercase">
            Variant 2 — Rapid-fire clicking
          </h2>
          <RapidFireDemo />
        </div>

        <div>
          <h2 className="mb-6 text-sm font-semibold tracking-wide text-gray-400 uppercase">
            Variant 3 — Single card toggle
          </h2>
          <ToggleModeDemo />
        </div>

        <div>
          <h2 className="mb-6 text-sm font-semibold tracking-wide text-gray-400 uppercase">
            Variant 4 — Add item workflow
          </h2>
          <AddItemDemo />
        </div>
      </div>
    </>
  );
}
