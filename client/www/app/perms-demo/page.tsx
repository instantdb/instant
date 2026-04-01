'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';

// ─── Types & Data ───────────────────────────────────────

type Role = 'guest' | 'admin' | 'bob';

interface Vote {
  id: string;
  voter: string;
  choice: string;
}

const VOTES: Vote[] = [
  { id: 'v1', voter: 'Alice', choice: 'Option A' },
  { id: 'v2', voter: 'Bob', choice: 'Option B' },
  { id: 'v3', voter: 'Charlie', choice: 'Option A' },
  { id: 'v4', voter: 'Diana', choice: 'Option C' },
];

const ROLES: { key: Role; label: string }[] = [
  { key: 'guest', label: 'Guest' },
  { key: 'admin', label: 'Admin' },
  { key: 'bob', label: 'Bob' },
];

const ROLE_META: Record<Role, { label: string; color: string; bg: string }> = {
  guest: { label: 'Guest', color: '#6366f1', bg: '#eef2ff' },
  admin: { label: 'Admin', color: '#059669', bg: '#ecfdf5' },
  bob: { label: 'Bob', color: '#ea580c', bg: '#fff7ed' },
};

function isVisible(vote: Vote, role: Role): boolean {
  if (role === 'admin') return true;
  if (role === 'bob') return vote.voter === 'Bob';
  return false;
}

// ─── Fake Cursor ────────────────────────────────────────

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
        width="20"
        height="24"
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

// ─── Shield Icons ───────────────────────────────────────

function ShieldCheck() {
  return (
    <svg
      className="h-10 w-10"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
      />
    </svg>
  );
}

function ShieldX() {
  return (
    <svg
      className="h-10 w-10"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z"
      />
    </svg>
  );
}

// ─── Demo ───────────────────────────────────────────────

export default function PermsDemoPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<Role, HTMLButtonElement>());

  const [role, setRole] = useState<Role>('guest');
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [showCursor, setShowCursor] = useState(false);
  const [clicking, setClicking] = useState(false);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const getButtonPos = useCallback((target: Role) => {
    const btn = buttonRefs.current.get(target);
    const container = containerRef.current;
    if (!btn || !container) return { x: 0, y: 0 };
    const btnRect = btn.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return {
      x: btnRect.left - containerRect.left + btnRect.width / 2,
      y: btnRect.top - containerRect.top + btnRect.height / 2,
    };
  }, []);

  useEffect(() => {
    const ts = timeouts.current;

    const sched = (fn: () => void, ms: number) => {
      ts.push(setTimeout(fn, ms));
    };

    const clickBtn = (target: Role, t: number): number => {
      sched(() => setCursorPos(getButtonPos(target)), t);
      t += 600;
      sched(() => setClicking(true), t);
      t += 150;
      sched(() => {
        setClicking(false);
        setRole(target);
      }, t);
      t += 150;
      return t;
    };

    let cancelled = false;

    const runCycle = () => {
      if (cancelled) return;
      ts.forEach(clearTimeout);
      ts.length = 0;

      setRole('guest');
      setShowCursor(false);
      setClicking(false);

      let t = 1000;

      sched(() => {
        const pos = getButtonPos('guest');
        setCursorPos({ x: pos.x + 80, y: pos.y + 40 });
        setShowCursor(true);
      }, t);
      t += 400;

      // Pause on guest
      t += 1400;

      // Click Admin
      t = clickBtn('admin', t);
      t += 2000;

      // Click Bob
      t = clickBtn('bob', t);
      t += 2000;

      // Hide cursor and restart
      sched(() => setShowCursor(false), t);
      t += 800;
      sched(() => runCycle(), t);
    };

    const init = setTimeout(runCycle, 200);

    return () => {
      cancelled = true;
      clearTimeout(init);
      ts.forEach(clearTimeout);
      ts.length = 0;
    };
  }, [getButtonPos]);

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-screen items-center justify-center bg-white"
    >
      <div className="w-full max-w-xl px-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Votes</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Viewing as</span>
            <div className="flex gap-2">
              {ROLES.map((r) => {
                const meta = ROLE_META[r.key];
                const active = role === r.key;
                return (
                  <button
                    key={r.key}
                    ref={(el) => {
                      if (el) buttonRefs.current.set(r.key, el);
                    }}
                    className="relative rounded-full border px-5 py-2 text-base font-semibold transition-colors"
                    style={{
                      borderColor: active ? meta.color : '#e5e7eb',
                      backgroundColor: active ? meta.bg : '#ffffff',
                      color: active ? meta.color : '#9ca3af',
                    }}
                  >
                    {active && (
                      <motion.div
                        layoutId="role-pill"
                        className="absolute inset-0 rounded-full border-2"
                        style={{ borderColor: meta.color }}
                        transition={{
                          type: 'spring',
                          stiffness: 400,
                          damping: 30,
                        }}
                      />
                    )}
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          {VOTES.map((vote) => {
            const visible = isVisible(vote, role);
            return (
              <motion.div
                key={vote.id}
                animate={{
                  borderColor: visible ? '#22c55e' : '#fca5a5',
                  backgroundColor: visible ? '#f0fdf4' : '#fef2f2',
                }}
                transition={{ duration: 0.4 }}
                className="flex items-center gap-4 rounded-2xl border-2 p-6"
              >
                <motion.div
                  animate={{ color: visible ? '#22c55e' : '#ef4444' }}
                  transition={{ duration: 0.3 }}
                >
                  {visible ? <ShieldCheck /> : <ShieldX />}
                </motion.div>
                <div className="flex-1">
                  <motion.div
                    animate={{
                      filter: visible ? 'blur(0px)' : 'blur(6px)',
                      opacity: visible ? 1 : 0.4,
                    }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="text-lg font-semibold text-gray-900">
                      {vote.voter}
                    </div>
                    <div className="text-sm text-gray-500">{vote.choice}</div>
                  </motion.div>
                </div>
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
