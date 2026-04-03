'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// Variation 5: Minimal — big avatars as selector, rules inline,
// messages as simple rows with animated allowed/denied pill

type User = 'joe' | 'daniel';
type Op = 'view' | 'update';

const userMeta: Record<User, { name: string; img: string }> = {
  joe: { name: 'Joe', img: '/img/landing/joe.jpg' },
  daniel: { name: 'Daniel', img: '/img/landing/daniel.png' },
};

const messages = [
  { id: 1, author: 'Joe', text: 'Launch is tomorrow!', owner: 'joe' as User },
  { id: 2, author: 'Daniel', text: 'Docs are ready', owner: 'daniel' as User },
];

const rules: { action: Op; rule: string }[] = [
  { action: 'view', rule: 'true' },
  { action: 'update', rule: 'auth.id == data.creator' },
];

function canDo(user: User, op: Op, msgOwner: User): boolean {
  if (op === 'view') return true;
  return user === msgOwner;
}

// Simplified sequence: start on Joe+view, click update, then click Daniel

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
      className="pointer-events-none absolute z-50"
      initial={false}
      animate={{ left: x, top: y, scale: clicking ? 0.85 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <svg
        width="28"
        height="34"
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

export default function PermsDemoPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const userBtnRefs = useRef(new Map<string, HTMLButtonElement>());
  const opBtnRefs = useRef(new Map<string, HTMLButtonElement>());

  const [selectedUser, setSelectedUser] = useState<User>('joe');
  const [selectedOp, setSelectedOp] = useState<Op>('view');
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [showCursor, setShowCursor] = useState(false);
  const [clicking, setClicking] = useState(false);

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const sched = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeouts.current.push(t);
  }, []);

  const getPos = useCallback((el: HTMLElement | null) => {
    const container = containerRef.current;
    if (!el || !container) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    return {
      x: r.left - c.left + r.width / 2,
      y: r.top - c.top + r.height / 2,
    };
  }, []);

  const clickEl = useCallback(
    (ref: Map<string, HTMLElement>, key: string, t: number) => {
      sched(() => {
        const pos = getPos(ref.get(key) || null);
        setCursorPos(pos);
        setShowCursor(true);
      }, t);
      t += 500;
      sched(() => setClicking(true), t);
      t += 150;
      sched(() => setClicking(false), t);
      return t;
    },
    [sched, getPos],
  );

  const runCycle = useCallback(() => {
    clear();
    setSelectedUser('joe');
    setSelectedOp('view');
    setShowCursor(false);
    setClicking(false);

    // Start: Joe + view (all green), pause to see
    let t = 1500;

    // Click "update" — Joe can only update his own message
    t = clickEl(opBtnRefs.current as Map<string, HTMLElement>, 'update', t);
    sched(() => setSelectedOp('update'), t);
    t += 2000;

    // Click Daniel — Daniel can only update his own message
    t = clickEl(userBtnRefs.current as Map<string, HTMLElement>, 'daniel', t);
    sched(() => setSelectedUser('daniel'), t);
    t += 2000;

    // Hide cursor and restart
    sched(() => setShowCursor(false), t);
    t += 1500;
    sched(() => runCycle(), t);
  }, [clear, sched, clickEl]);

  useEffect(() => {
    runCycle();
    return () => clear();
  }, [runCycle, clear]);

  const activeRuleIdx = rules.findIndex((r) => r.action === selectedOp);

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-screen items-center justify-center bg-white"
    >
      <a
        href="/demos"
        className="absolute top-4 left-4 z-50 text-xs text-gray-400 hover:text-gray-600"
      >
        &larr; All Demos
      </a>
      <div className="w-full max-w-xl px-8">
        {/* Big avatar selector */}
        <div className="mb-10 flex items-center justify-center gap-6">
          {(['joe', 'daniel'] as User[]).map((u) => {
            const m = userMeta[u];
            const active = selectedUser === u;
            return (
              <button
                key={u}
                ref={(el) => {
                  if (el) userBtnRefs.current.set(u, el);
                }}
                className="flex flex-col items-center gap-2"
              >
                <motion.div
                  initial={false}
                  animate={{
                    borderColor: active ? '#f97316' : '#e5e7eb',
                    scale: active ? 1.05 : 1,
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className="rounded-full border-[3px] p-1"
                >
                  <img
                    src={m.img}
                    alt={m.name}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                </motion.div>
                <span
                  className="text-xl font-semibold transition-colors"
                  style={{ color: active ? '#ea580c' : '#9ca3af' }}
                >
                  {m.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Operation tabs */}
        <div className="mb-8 flex justify-center gap-4">
          {(['view', 'update'] as Op[]).map((op) => {
            const active = selectedOp === op;
            return (
              <button
                key={op}
                ref={(el) => {
                  if (el) opBtnRefs.current.set(op, el);
                }}
                className="relative rounded-xl px-8 py-3 text-xl font-semibold capitalize"
                style={{
                  color: active ? '#4f46e5' : '#9ca3af',
                }}
              >
                {active && (
                  <motion.div
                    layoutId="op-tab"
                    className="absolute inset-0 rounded-xl border-2 border-indigo-400 bg-indigo-50"
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 35,
                    }}
                  />
                )}
                <span className="relative">{op}</span>
              </button>
            );
          })}
        </div>

        {/* Rule display */}
        <div className="mb-8 rounded-2xl bg-gray-50 px-6 py-4 text-center font-mono text-xl">
          <span className="text-gray-400">rule: </span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={selectedOp}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="font-semibold text-gray-800"
            >
              {rules[activeRuleIdx].rule}
            </motion.span>
          </AnimatePresence>
        </div>

        {/* Messages */}
        <div className="space-y-4">
          {messages.map((msg) => {
            const allowed = canDo(selectedUser, selectedOp, msg.owner);
            return (
              <motion.div
                key={msg.id}
                initial={false}
                animate={{
                  borderColor: allowed ? '#86efac' : '#fca5a5',
                  backgroundColor: allowed ? '#f0fdf4' : '#fef2f2',
                }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-5 rounded-2xl border-2 px-6 py-6"
              >
                <img
                  src={userMeta[msg.owner].img}
                  alt={msg.author}
                  className="h-14 w-14 shrink-0 rounded-full object-cover"
                />
                <motion.div
                  initial={false}
                  animate={{
                    filter: allowed ? 'blur(0px)' : 'blur(6px)',
                    opacity: allowed ? 1 : 0.4,
                  }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="text-2xl text-gray-700">{msg.text}</div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {showCursor && (
        <FakeCursor x={cursorPos.x} y={cursorPos.y} clicking={clicking} />
      )}
    </div>
  );
}
