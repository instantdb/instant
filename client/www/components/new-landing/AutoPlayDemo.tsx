'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'motion/react';

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
            className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm"
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
