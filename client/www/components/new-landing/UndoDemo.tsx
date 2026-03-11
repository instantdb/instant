'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const ROWS = [
  { attr: 'title', type: 'string' },
  { attr: 'body', type: 'string' },
  { attr: 'createdAt', type: 'date' },
];

function FakeCursor({
  x,
  y,
  clicking,
}: {
  x: number;
  y: number;
  clicking: boolean;
}) {
  return (
    <motion.div
      className="pointer-events-none absolute z-10"
      initial={false}
      animate={{ left: x, top: y, scale: clicking ? 0.85 : 1 }}
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

export function UndoDemo() {
  const [hasPlayed, setHasPlayed] = useState(false);
  const [deletedAttrs, setDeletedAttrs] = useState<string[]>([]);

  const [showCursor, setShowCursor] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [cursorClicking, setCursorClicking] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  const sched = useCallback((fn: () => void, ms: number) => {
    timeoutsRef.current.push(setTimeout(fn, ms));
  }, []);

  useEffect(() => () => clearTimeouts(), [clearTimeouts]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || hasPlayed) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasPlayed(true);
          sched(() => runAutoPlay(), 400);
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPlayed]);

  const runAutoPlay = () => {
    const container = containerRef.current;
    const btn = btnRefs.current['title'];
    if (!container || !btn) return;

    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();

    const targetX = bRect.left - cRect.left + bRect.width / 2;
    const targetY = bRect.top - cRect.top + bRect.height / 2;

    const startX = cRect.width * 0.25;
    const startY = cRect.height * 0.25;

    setCursorPos({ x: startX, y: startY });
    setShowCursor(true);

    sched(() => setCursorPos({ x: targetX, y: targetY }), 500);
    sched(() => setCursorClicking(true), 1300);
    sched(() => {
      setCursorClicking(false);
      setDeletedAttrs((prev) => [...prev, 'title']);
    }, 1500);
    sched(() => setShowCursor(false), 2000);
  };

  const handleDelete = (attr: string) => {
    setDeletedAttrs((prev) => [...prev, attr]);
  };

  const handleRestore = (attr: string) => {
    setDeletedAttrs((prev) => prev.filter((a) => a !== attr));
  };

  const activeRows = ROWS.filter((r) => !deletedAttrs.includes(r.attr));

  return (
    <div ref={containerRef} className="relative select-none">
      <div className="flex items-stretch gap-3">
        {/* Posts table */}
        <div className="h-[200px] flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-md">
          <div className="border-b border-gray-100 px-4 py-2">
            <span className="font-mono text-sm font-semibold text-gray-900">
              posts
            </span>
          </div>
          <div>
            <AnimatePresence initial={false}>
              {activeRows.map((row) => (
                <motion.div
                  key={row.attr}
                  layout
                  initial={{ opacity: 0, x: 20, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: 'auto' }}
                  exit={{ opacity: 0, x: 20, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="relative flex items-center border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex items-baseline gap-2 px-4 py-2.5">
                    <span className="font-mono text-sm font-semibold text-gray-900">
                      {row.attr}
                    </span>
                    <span className="text-xs text-gray-400">{row.type}</span>
                  </div>
                  <div className="ml-auto pr-3">
                    <button
                      ref={(el) => {
                        btnRefs.current[row.attr] = el;
                      }}
                      onClick={() => handleDelete(row.attr)}
                      className="cursor-pointer rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-red-500 transition-all hover:bg-gray-200 active:scale-95"
                    >
                      Delete
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {activeRows.length === 0 && (
              <div className="px-4 py-3 text-xs text-gray-400">
                No attributes
              </div>
            )}
          </div>
        </div>

        {/* Recently deleted */}
        <div className="h-[200px] flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-2">
            <span className="font-mono text-sm font-semibold text-gray-900">
              Recently deleted
            </span>
          </div>
          <div>
            <AnimatePresence initial={false}>
              {deletedAttrs.map((attr) => {
                const row = ROWS.find((r) => r.attr === attr)!;
                return (
                  <motion.div
                    key={attr}
                    layout
                    initial={{ opacity: 0, x: -20, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: 'auto' }}
                    exit={{ opacity: 0, x: -20, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex items-baseline gap-2 px-4 py-2.5">
                      <span className="font-mono text-sm font-semibold text-gray-400 line-through">
                        {row.attr}
                      </span>
                      <span className="text-xs text-gray-300">{row.type}</span>
                    </div>
                    <div className="ml-auto pr-3">
                      <button
                        onClick={() => handleRestore(attr)}
                        className="cursor-pointer rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-green-600 active:scale-95"
                      >
                        Restore
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {deletedAttrs.length === 0 && (
              <div className="px-4 py-3 text-xs text-gray-300 italic">
                Nothing here
              </div>
            )}
          </div>
        </div>
      </div>

      {showCursor && (
        <FakeCursor x={cursorPos.x} y={cursorPos.y} clicking={cursorClicking} />
      )}
    </div>
  );
}
