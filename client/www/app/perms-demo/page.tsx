'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Shared Types & Data ────────────────────────────────

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

// ─── Animation Hook ─────────────────────────────────────

function useAnimatedRoles(
  buttonMap: React.MutableRefObject<Map<Role, HTMLButtonElement>>,
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const [role, setRole] = useState<Role>('guest');
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [showCursor, setShowCursor] = useState(false);
  const [clicking, setClicking] = useState(false);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const ts = timeouts.current;

    const sched = (fn: () => void, ms: number) => {
      ts.push(setTimeout(fn, ms));
    };

    const getButtonPos = (target: Role) => {
      const btn = buttonMap.current.get(target);
      const container = containerRef.current;
      if (!btn || !container) return { x: 0, y: 0 };
      const btnRect = btn.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      return {
        x: btnRect.left - containerRect.left + btnRect.width / 2,
        y: btnRect.top - containerRect.top + btnRect.height / 2,
      };
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

      // Show cursor off to the side
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

    // Small delay so button refs are populated
    const init = setTimeout(runCycle, 200);

    return () => {
      cancelled = true;
      clearTimeout(init);
      ts.forEach(clearTimeout);
      ts.length = 0;
    };
  }, [buttonMap, containerRef]);

  return { role, cursorPos, showCursor, clicking };
}

// ─── Role Selector Bar ──────────────────────────────────

function RoleSelector({
  role,
  buttonMap,
}: {
  role: Role;
  buttonMap: React.MutableRefObject<Map<Role, HTMLButtonElement>>;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-lg text-gray-400">Viewing as</span>
      <div className="flex gap-2">
        {ROLES.map((r) => {
          const meta = ROLE_META[r.key];
          const active = role === r.key;
          return (
            <button
              key={r.key}
              ref={(el) => {
                if (el) buttonMap.current.set(r.key, el);
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
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Variation 1: Grid ──────────────────────────────────

function Variation1() {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonMap = useRef(new Map<Role, HTMLButtonElement>());
  const { role, cursorPos, showCursor, clicking } = useAnimatedRoles(
    buttonMap,
    containerRef,
  );

  return (
    <div ref={containerRef} className="relative flex min-h-screen items-center justify-center bg-white">
      <div className="w-full max-w-xl px-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Votes</h1>
          <RoleSelector role={role} buttonMap={buttonMap} />
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
                  <AnimatePresence mode="wait">
                    {visible ? (
                      <motion.svg
                        key="check"
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
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
                      </motion.svg>
                    ) : (
                      <motion.svg
                        key="x"
                        initial={{ scale: 0, rotate: 45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
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
                      </motion.svg>
                    )}
                  </AnimatePresence>
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

// ─── Variation 2: List ──────────────────────────────────

function Variation2() {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonMap = useRef(new Map<Role, HTMLButtonElement>());
  const { role, cursorPos, showCursor, clicking } = useAnimatedRoles(
    buttonMap,
    containerRef,
  );
  const visibleCount = VOTES.filter((v) => isVisible(v, role)).length;

  return (
    <div ref={containerRef} className="relative flex min-h-screen items-center justify-center bg-white">
      <div className="w-full max-w-lg px-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Votes</h1>
            <motion.div
              key={`${role}-${visibleCount}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-full px-3 py-1 text-sm font-semibold"
              style={{
                backgroundColor:
                  visibleCount === 0
                    ? '#fef2f2'
                    : visibleCount === VOTES.length
                      ? '#f0fdf4'
                      : '#fff7ed',
                color:
                  visibleCount === 0
                    ? '#ef4444'
                    : visibleCount === VOTES.length
                      ? '#22c55e'
                      : '#ea580c',
              }}
            >
              {visibleCount}/{VOTES.length}
            </motion.div>
          </div>
          <RoleSelector role={role} buttonMap={buttonMap} />
        </div>

        <div className="space-y-3">
          {VOTES.map((vote) => {
            const visible = isVisible(vote, role);
            return (
              <motion.div
                key={vote.id}
                layout
                animate={{
                  opacity: visible ? 1 : 0.6,
                  scale: visible ? 1 : 0.98,
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="flex items-center gap-4 rounded-xl border border-gray-100 px-5 py-4"
              >
                <motion.div
                  animate={{
                    color: visible ? '#22c55e' : '#ef4444',
                    scale: visible ? 1 : 0.85,
                  }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  className="shrink-0"
                >
                  <AnimatePresence mode="wait">
                    {visible ? (
                      <motion.svg
                        key="ok"
                        initial={{ scale: 0, rotate: -30 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        className="h-8 w-8"
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
                      </motion.svg>
                    ) : (
                      <motion.svg
                        key="no"
                        initial={{ scale: 0, rotate: 30 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        className="h-8 w-8"
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
                      </motion.svg>
                    )}
                  </AnimatePresence>
                </motion.div>
                <div className="flex-1">
                  <motion.div
                    animate={{
                      filter: visible ? 'blur(0px)' : 'blur(5px)',
                      opacity: visible ? 1 : 0.3,
                    }}
                    transition={{ duration: 0.3 }}
                    className="flex items-baseline justify-between"
                  >
                    <span className="text-base font-semibold text-gray-900">
                      {vote.voter}
                    </span>
                    <span className="text-sm text-gray-500">{vote.choice}</span>
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

// ─── Variation 3: Rows ──────────────────────────────────

function Variation3() {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonMap = useRef(new Map<Role, HTMLButtonElement>());
  const { role, cursorPos, showCursor, clicking } = useAnimatedRoles(
    buttonMap,
    containerRef,
  );

  return (
    <div ref={containerRef} className="relative flex min-h-screen items-center justify-center bg-white">
      <div className="w-full max-w-lg px-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Votes</h1>
          <RoleSelector role={role} buttonMap={buttonMap} />
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200">
          {VOTES.map((vote, i) => {
            const visible = isVisible(vote, role);
            return (
              <motion.div
                key={vote.id}
                className={`flex items-center gap-4 px-5 py-5 ${i < VOTES.length - 1 ? 'border-b border-gray-100' : ''}`}
                animate={{
                  backgroundColor: visible ? '#ffffff' : '#fafafa',
                }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  animate={{ backgroundColor: visible ? '#22c55e' : '#ef4444' }}
                  transition={{ duration: 0.3 }}
                  className="h-8 w-1 shrink-0 rounded-full"
                />
                <div className="flex flex-1 items-center justify-between">
                  <div>
                    {visible ? (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="text-base font-semibold text-gray-900">
                          {vote.voter}
                        </div>
                        <div className="text-sm text-gray-500">
                          {vote.choice}
                        </div>
                      </motion.div>
                    ) : (
                      <div>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="mb-1.5 h-4 w-24 rounded bg-gray-200"
                        />
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="h-3 w-16 rounded bg-gray-100"
                        />
                      </div>
                    )}
                  </div>
                  <motion.div
                    animate={{ color: visible ? '#22c55e' : '#ef4444' }}
                    transition={{ duration: 0.3 }}
                  >
                    <AnimatePresence mode="wait">
                      {visible ? (
                        <motion.svg
                          key="ok"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                          className="h-7 w-7"
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
                        </motion.svg>
                      ) : (
                        <motion.svg
                          key="no"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                          className="h-7 w-7"
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
                        </motion.svg>
                      )}
                    </AnimatePresence>
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

// ─── Variation 4: Hero ──────────────────────────────────

function Variation4() {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonMap = useRef(new Map<Role, HTMLButtonElement>());
  const { role, cursorPos, showCursor, clicking } = useAnimatedRoles(
    buttonMap,
    containerRef,
  );
  const visibleCount = VOTES.filter((v) => isVisible(v, role)).length;
  const meta = ROLE_META[role];

  return (
    <div ref={containerRef} className="relative flex min-h-screen items-center justify-center bg-white">
      <div className="w-full max-w-xl px-8">
        <div className="mb-8 flex justify-center">
          <RoleSelector role={role} buttonMap={buttonMap} />
        </div>

        {/* Big central shield */}
        <div className="mb-8 flex flex-col items-center">
          <motion.div
            key={role}
            initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            style={{ color: meta.color }}
          >
            <svg
              className="h-20 w-20"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              {visibleCount > 0 ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z"
                />
              )}
            </svg>
          </motion.div>
          <motion.p
            key={`label-${role}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 text-lg font-semibold"
            style={{ color: meta.color }}
          >
            {visibleCount === VOTES.length
              ? 'Full Access'
              : visibleCount === 0
                ? 'No Access'
                : `${visibleCount} of ${VOTES.length} Visible`}
          </motion.p>
        </div>

        {/* Vote cards */}
        <div className="grid grid-cols-2 gap-4">
          {VOTES.map((vote) => {
            const visible = isVisible(vote, role);
            return (
              <motion.div
                key={vote.id}
                layout
                animate={{
                  opacity: visible ? 1 : 0.4,
                  scale: visible ? 1 : 0.95,
                  y: visible ? 0 : 4,
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="rounded-xl border border-gray-100 p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-xs text-gray-400">
                    {vote.id}
                  </span>
                  <motion.div
                    animate={{
                      backgroundColor: visible ? '#dcfce7' : '#fee2e2',
                    }}
                    className="rounded-full px-2 py-0.5"
                  >
                    <motion.span
                      animate={{ color: visible ? '#16a34a' : '#dc2626' }}
                      className="text-[10px] font-semibold uppercase"
                    >
                      {visible ? 'allow' : 'deny'}
                    </motion.span>
                  </motion.div>
                </div>
                <motion.div
                  animate={{
                    filter: visible ? 'blur(0px)' : 'blur(6px)',
                  }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="text-base font-semibold text-gray-900">
                    {vote.voter}
                  </div>
                  <div className="text-sm text-gray-500">{vote.choice}</div>
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

// ─── Variation 5: Table ─────────────────────────────────

function Variation5() {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonMap = useRef(new Map<Role, HTMLButtonElement>());
  const { role, cursorPos, showCursor, clicking } = useAnimatedRoles(
    buttonMap,
    containerRef,
  );

  return (
    <div ref={containerRef} className="relative flex min-h-screen items-center justify-center bg-white">
      <div className="w-full max-w-xl px-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Votes</h1>
          <RoleSelector role={role} buttonMap={buttonMap} />
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200">
          <div className="grid grid-cols-[60px_1fr_1fr_100px] border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-400">
            <div className="px-4 py-3" />
            <div className="px-4 py-3">Voter</div>
            <div className="px-4 py-3">Choice</div>
            <div className="px-4 py-3 text-center">Access</div>
          </div>

          {VOTES.map((vote) => {
            const visible = isVisible(vote, role);
            return (
              <motion.div
                key={vote.id}
                className="grid grid-cols-[60px_1fr_1fr_100px] border-b border-gray-50"
                animate={{
                  backgroundColor: visible ? '#ffffff' : '#fafafa',
                }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center justify-center">
                  <motion.div
                    animate={{ color: visible ? '#22c55e' : '#ef4444' }}
                    transition={{ duration: 0.3 }}
                  >
                    <AnimatePresence mode="wait">
                      {visible ? (
                        <motion.svg
                          key="ok"
                          initial={{ scale: 0, rotate: -30 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={{ scale: 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                          className="h-6 w-6"
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
                        </motion.svg>
                      ) : (
                        <motion.svg
                          key="no"
                          initial={{ scale: 0, rotate: 30 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={{ scale: 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                          className="h-6 w-6"
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
                        </motion.svg>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </div>

                <motion.div
                  className="flex items-center px-4 py-4 text-sm font-medium text-gray-900"
                  animate={{
                    filter: visible ? 'blur(0px)' : 'blur(5px)',
                    opacity: visible ? 1 : 0.3,
                  }}
                  transition={{ duration: 0.3 }}
                >
                  {vote.voter}
                </motion.div>

                <motion.div
                  className="flex items-center px-4 py-4 text-sm text-gray-600"
                  animate={{
                    filter: visible ? 'blur(0px)' : 'blur(5px)',
                    opacity: visible ? 1 : 0.3,
                  }}
                  transition={{ duration: 0.3 }}
                >
                  {vote.choice}
                </motion.div>

                <div className="flex items-center justify-center px-4 py-4">
                  <motion.div
                    animate={{
                      backgroundColor: visible ? '#dcfce7' : '#fee2e2',
                    }}
                    transition={{ duration: 0.3 }}
                    className="rounded-full px-3 py-1"
                  >
                    <motion.span
                      animate={{ color: visible ? '#16a34a' : '#dc2626' }}
                      className="text-xs font-bold uppercase"
                    >
                      {visible ? 'allow' : 'deny'}
                    </motion.span>
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

// ─── Page ───────────────────────────────────────────────

const VARIATIONS = [
  { name: 'Grid', component: Variation1 },
  { name: 'List', component: Variation2 },
  { name: 'Rows', component: Variation3 },
  { name: 'Hero', component: Variation4 },
  { name: 'Table', component: Variation5 },
];

export default function PermsDemoPage() {
  const [active, setActive] = useState(0);
  const ActiveComponent = VARIATIONS[active].component;

  return (
    <div className="relative h-screen">
      <ActiveComponent key={active} />

      <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
        <div className="flex gap-1.5 rounded-full border border-gray-200 bg-white/90 px-2 py-1.5 shadow-lg backdrop-blur-sm">
          {VARIATIONS.map((v, i) => (
            <button
              key={v.name}
              onClick={() => setActive(i)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                active === i
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {v.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
