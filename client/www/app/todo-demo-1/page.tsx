'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Confetti ────────────────────────────────────────────────────────────────

function spawnConfetti(container: HTMLDivElement) {
  const items = ['✨', '⚡', '💫', '🎉', '🚀'];
  const count = 12;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.innerText = items[Math.floor(Math.random() * items.length)];
    container.appendChild(el);
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const dist = 100 + Math.random() * 80;
    const xDrift = Math.cos(angle) * dist;
    const yDrift = Math.sin(angle) * dist;
    const delay = i * 50;
    const duration = 1200 + Math.random() * 400;
    const rotation = (Math.random() - 0.5) * 60;
    Object.assign(el.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      fontSize: '28px',
      pointerEvents: 'none',
      zIndex: '9999',
      transform: 'translate(-50%, -50%) scale(0)',
      opacity: '1',
      transition: `transform ${duration}ms cubic-bezier(0.15, 0.6, 0.3, 1), opacity ${duration}ms ease-out`,
      transitionDelay: `${delay}ms`,
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        Object.assign(el.style, {
          transform: `translate(calc(-50% + ${xDrift}px), calc(-50% + ${yDrift}px)) scale(1) rotate(${rotation}deg)`,
          opacity: '0',
        });
      });
    });
    setTimeout(() => el.remove(), duration + delay + 50);
  }
}

// ─── Syntax-Highlighted Code Badges ──────────────────────────────────────────

function UseStateCode() {
  return (
    <span style={{ fontFamily: 'monospace', fontSize: '16px' }}>
      <span style={{ color: '#286983' }}>const</span>{' '}
      <span style={{ color: '#575279' }}>[</span>
      <span style={{ color: '#56949f' }}>todos</span>
      <span style={{ color: '#575279' }}>, </span>
      <span style={{ color: '#56949f' }}>setTodos</span>
      <span style={{ color: '#575279' }}>]</span>
      <span style={{ color: '#797593' }}> = </span>
      <span style={{ color: '#d7827e' }}>useState</span>
      <span style={{ color: '#797593' }}>([])</span>
    </span>
  );
}

function UseQueryCode() {
  return (
    <span style={{ fontFamily: 'monospace', fontSize: '16px' }}>
      <span style={{ color: '#286983' }}>const</span>{' '}
      <span style={{ color: '#575279' }}>{'{ '}</span>
      <span style={{ color: '#56949f' }}>data</span>
      <span style={{ color: '#575279' }}>{' } = '}</span>
      <span style={{ color: '#56949f' }}>db</span>
      <span style={{ color: '#797593' }}>.</span>
      <span style={{ color: '#d7827e' }}>useQuery</span>
      <span style={{ color: '#797593' }}>({'{ '}</span>
      <span style={{ color: '#ea9d34' }}>todos</span>
      <span style={{ color: '#797593' }}>{': {} })'}</span>
    </span>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <motion.svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      animate={spinning ? { rotate: 360 } : { rotate: 0 }}
      transition={
        spinning
          ? { duration: 0.6, ease: 'linear', repeat: Infinity }
          : { duration: 0 }
      }
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </motion.svg>
  );
}

function WifiOffIcon() {
  return (
    <svg
      className="h-8 w-8 text-white/90"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
      <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
      <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
      <path d="M5 12.86a10 10 0 0 1 5.17-2.89" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

type TodoItem = { id: number; text: string };

type Phase =
  | 'usestate-add'
  | 'usestate-refresh'
  | 'usestate-empty'
  | 'transform'
  | 'instant-add'
  | 'instant-refresh'
  | 'instant-persist'
  | 'realtime'
  | 'realtime-sync'
  | 'offline'
  | 'offline-sync'
  | 'finale';

// ─── Glow Color Helper ──────────────────────────────────────────────────────

function glowShadow(color: string, intensity: number = 0.15) {
  if (color === 'none') return 'none';
  return `0 0 20px rgba(${color}, ${intensity}), 0 1px 3px rgba(0,0,0,0.08)`;
}

const GLOW_MAP: Record<string, string> = {
  neutral: '0 0 0px transparent, 0 1px 3px rgba(0,0,0,0.08)',
  red: glowShadow('239,68,68', 0.25),
  orange: glowShadow('249,115,22', 0.25),
  green: glowShadow('34,197,94', 0.3),
};

// ─── Todo Card ───────────────────────────────────────────────────────────────

function TodoCard({
  todos,
  glowKey,
  showEmpty,
  emptyMessage,
  typingText,
  typingActive,
  label,
  overlay,
}: {
  todos: TodoItem[];
  glowKey: string;
  showEmpty: boolean;
  emptyMessage?: string;
  typingText: string;
  typingActive: boolean;
  label?: string;
  overlay?: React.ReactNode;
}) {
  const shadow = GLOW_MAP[glowKey] || GLOW_MAP.neutral;

  return (
    <div
      className="relative flex h-[380px] w-full flex-col rounded-2xl border border-gray-200 bg-white"
      style={{
        boxShadow: shadow,
        transition: 'box-shadow 0.8s ease',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{
          background: 'linear-gradient(135deg, #f97316, #ea580c)',
        }}
      >
        <div className="flex items-center gap-2">
          <svg
            className="h-5 w-5 text-white/90"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
          <h2 className="text-lg font-semibold text-white">My Todos</h2>
        </div>
        {label && (
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white">
            {label}
          </span>
        )}
      </div>

      {/* Todo list area */}
      <div className="flex-1 overflow-hidden px-5 pt-3">
        <div className="min-h-[180px]">
          <AnimatePresence mode="popLayout">
            {todos.map((todo) => (
              <motion.div
                key={todo.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 25,
                }}
                className="flex items-center gap-3 border-b border-gray-50 py-2.5"
              >
                <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 border-orange-300" />
                <span className="text-[15px] text-gray-700">{todo.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          {showEmpty && todos.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-center justify-center py-12 text-gray-300"
            >
              <svg
                className="mb-2 h-8 w-8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
              </svg>
              <span className="text-sm">{emptyMessage || 'No todos yet'}</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-gray-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg bg-gray-50 px-3 py-2">
            <span className="text-[15px]">
              {typingActive && typingText ? (
                <span className="text-gray-700">
                  {typingText}
                  <span className="animate-pulse text-orange-400">|</span>
                </span>
              ) : typingText ? (
                <span className="text-gray-700">{typingText}</span>
              ) : (
                <span className="text-gray-300">What needs to be done?</span>
              )}
            </span>
          </div>
          <button
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
            }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Overlay (for offline) */}
      {overlay}
    </div>
  );
}

// ─── Todos List ──────────────────────────────────────────────────────────────

const INITIAL_TODOS = ['Buy groceries', 'Walk the dog', 'Ship v2'];

// ─── Main Demo Component ─────────────────────────────────────────────────────

function TodoDemo() {
  const [phase, setPhase] = useState<Phase>('usestate-add');

  // Todo state
  const [leftTodos, setLeftTodos] = useState<TodoItem[]>([]);
  const [rightTodos, setRightTodos] = useState<TodoItem[]>([]);

  // UI state
  const [codeBadge, setCodeBadge] = useState<'usestate' | 'usequery'>('usestate');
  const [codeTransitioning, setCodeTransitioning] = useState(false);
  const [glowKey, setGlowKey] = useState('neutral');
  const [showRefresh, setShowRefresh] = useState(false);
  const [refreshSpin, setRefreshSpin] = useState(false);
  const [showSecondCard, setShowSecondCard] = useState(false);
  const [showPersistBadge, setShowPersistBadge] = useState(false);
  const [showRealtimeBadge, setShowRealtimeBadge] = useState(false);
  const [showOfflineBadge, setShowOfflineBadge] = useState(false);
  const [offlineOverlay, setOfflineOverlay] = useState(false);
  const [typingText, setTypingText] = useState('');
  const [typingActive, setTypingActive] = useState(false);
  const [rightTypingText, setRightTypingText] = useState('');
  const [rightTypingActive, setRightTypingActive] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasStarted = useRef(false);
  const confettiRef = useRef<HTMLDivElement>(null);

  const clear = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const sched = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeouts.current.push(t);
  };

  const typeText = (
    text: string,
    setterText: (t: string) => void,
    setterActive: (a: boolean) => void,
    startMs: number,
    speed = 45,
  ): number => {
    sched(() => setterActive(true), startMs);
    for (let i = 0; i <= text.length; i++) {
      const partial = text.slice(0, i);
      sched(() => setterText(partial), startMs + i * speed);
    }
    const endMs = startMs + text.length * speed + 100;
    sched(() => setterActive(false), endMs);
    return endMs;
  };

  // ─── Animation Cycle ────────────────────────────────────────────────────────

  const runCycle = useCallback(() => {
    clear();

    // Reset all state
    setPhase('usestate-add');
    setLeftTodos([]);
    setRightTodos([]);
    setCodeBadge('usestate');
    setCodeTransitioning(false);
    setGlowKey('neutral');
    setShowRefresh(false);
    setRefreshSpin(false);
    setShowSecondCard(false);
    setShowPersistBadge(false);
    setShowRealtimeBadge(false);
    setShowOfflineBadge(false);
    setOfflineOverlay(false);
    setTypingText('');
    setTypingActive(false);
    setRightTypingText('');
    setRightTypingActive(false);
    setShowEmpty(false);
    setFadeOut(false);

    let t = 600;
    let nextId = 1;

    // ─── Phase 1: useState (add todos) ~5s ──────────────────────────────────

    for (let i = 0; i < INITIAL_TODOS.length; i++) {
      const todoText = INITIAL_TODOS[i];
      const id = nextId++;
      const typeEnd = typeText(todoText, setTypingText, setTypingActive, t);
      t = typeEnd + 200;
      sched(() => {
        setTypingText('');
        setLeftTodos((prev) => [...prev, { id, text: todoText }]);
      }, t);
      t += 400;
    }

    // ─── Phase 2: The Refresh ~2s ───────────────────────────────────────────

    t += 400;
    sched(() => {
      setPhase('usestate-refresh');
      setShowRefresh(true);
      setRefreshSpin(true);
    }, t);

    t += 800;
    sched(() => {
      setGlowKey('red');
      setLeftTodos([]);
      setRefreshSpin(false);
    }, t);

    t += 400;
    sched(() => {
      setShowRefresh(false);
      setPhase('usestate-empty');
      setShowEmpty(true);
    }, t);

    t += 1200;

    // ─── Phase 3: The Transformation ~2.5s ──────────────────────────────────

    sched(() => {
      setPhase('transform');
      setCodeTransitioning(true);
    }, t);

    t += 400;
    sched(() => {
      setCodeBadge('usequery');
      setGlowKey('orange');
    }, t);

    t += 600;
    sched(() => {
      setGlowKey('green');
      setCodeTransitioning(false);
      if (confettiRef.current) spawnConfetti(confettiRef.current);
    }, t);

    t += 800;
    sched(() => {
      if (confettiRef.current) spawnConfetti(confettiRef.current);
    }, t);

    t += 700;

    // ─── Phase 4: Persistence ~3s ───────────────────────────────────────────

    sched(() => {
      setPhase('instant-add');
      setShowEmpty(false);
    }, t);

    t += 300;
    for (let i = 0; i < INITIAL_TODOS.length; i++) {
      const todoText = INITIAL_TODOS[i];
      const id = nextId++;
      const typeEnd = typeText(todoText, setTypingText, setTypingActive, t);
      t = typeEnd + 200;
      sched(() => {
        setTypingText('');
        setLeftTodos((prev) => [...prev, { id, text: todoText }]);
      }, t);
      t += 400;
    }

    t += 300;
    sched(() => {
      setPhase('instant-refresh');
      setShowRefresh(true);
      setRefreshSpin(true);
    }, t);

    t += 800;
    sched(() => {
      setRefreshSpin(false);
    }, t);

    t += 400;
    sched(() => {
      setShowRefresh(false);
      setPhase('instant-persist');
      setShowPersistBadge(true);
    }, t);

    t += 2200;

    // ─── Phase 5: Real-time ~3s ─────────────────────────────────────────────

    sched(() => {
      setPhase('realtime');
      setShowPersistBadge(false);
      setShowSecondCard(true);
      setRightTodos(
        INITIAL_TODOS.map((text, i) => ({ id: 100 + i, text })),
      );
    }, t);

    t += 1200;
    const realtimeTodo = 'Call mom';
    const realtimeId = nextId++;
    const rtTypeEnd = typeText(
      realtimeTodo,
      setTypingText,
      setTypingActive,
      t,
    );
    t = rtTypeEnd + 200;
    sched(() => {
      setPhase('realtime-sync');
      setTypingText('');
      setLeftTodos((prev) => [...prev, { id: realtimeId, text: realtimeTodo }]);
    }, t);

    t += 300;
    sched(() => {
      setRightTodos((prev) => [
        ...prev,
        { id: realtimeId + 1000, text: realtimeTodo },
      ]);
      setShowRealtimeBadge(true);
    }, t);

    t += 2500;

    // ─── Phase 6: Offline ~3s ───────────────────────────────────────────────

    sched(() => {
      setPhase('offline');
      setShowRealtimeBadge(false);
      setOfflineOverlay(true);
    }, t);

    t += 1000;
    const offlineTodo = 'Read book';
    const offlineId = nextId++;
    const offTypeEnd = typeText(
      offlineTodo,
      setRightTypingText,
      setRightTypingActive,
      t,
    );
    t = offTypeEnd + 200;
    sched(() => {
      setRightTypingText('');
      setRightTodos((prev) => [
        ...prev,
        { id: offlineId + 2000, text: offlineTodo },
      ]);
    }, t);

    t += 800;
    sched(() => {
      setPhase('offline-sync');
      setOfflineOverlay(false);
    }, t);

    t += 600;
    sched(() => {
      setLeftTodos((prev) => [
        ...prev,
        { id: offlineId, text: offlineTodo },
      ]);
      setShowOfflineBadge(true);
    }, t);

    t += 2500;

    // ─── Phase 7: Finale ~2s ────────────────────────────────────────────────

    sched(() => {
      setPhase('finale');
      setShowOfflineBadge(false);
      setFadeOut(true);
    }, t);

    t += 2000;
    sched(() => runCycle(), t);
  }, [clear]);

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      runCycle();
    }
    return () => clear();
  }, [runCycle, clear]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <motion.div
      className="flex min-h-screen flex-col items-center justify-center bg-white"
      animate={{ opacity: fadeOut ? 0 : 1 }}
      transition={{ duration: 1.2, ease: 'easeInOut' }}
    >
      {/* Code badge */}
      <div className="relative mb-8">
        <motion.div
          ref={confettiRef}
          className="relative rounded-xl px-6 py-3.5"
          style={{
            backgroundColor: '#faf8f5',
            boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
            overflow: 'visible',
          }}
          animate={{ y: [0, -4, 0] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <AnimatePresence mode="wait">
            {codeBadge === 'usestate' && !codeTransitioning && (
              <motion.div
                key="usestate"
                initial={{ opacity: 0, filter: 'blur(6px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(6px)' }}
                transition={{ duration: 0.4 }}
              >
                <UseStateCode />
              </motion.div>
            )}
            {codeBadge === 'usequery' && !codeTransitioning && (
              <motion.div
                key="usequery"
                initial={{ opacity: 0, filter: 'blur(6px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(6px)' }}
                transition={{ duration: 0.4 }}
              >
                <UseQueryCode />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Refresh indicator (absolutely positioned so no layout shift) */}
      <div className="relative mb-4 h-6">
        <AnimatePresence>
          {showRefresh && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="absolute left-1/2 top-0 flex -translate-x-1/2 items-center gap-2 text-sm text-gray-400"
            >
              <RefreshIcon spinning={refreshSpin} />
              <span>Refreshing...</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Cards container: fixed width, always has slots for two cards */}
      <div className="relative">
        <div className="flex gap-6" style={{ width: 740 }}>
          <div style={{ width: 350 }}>
            <TodoCard
              todos={leftTodos}
              glowKey={glowKey}
              showEmpty={showEmpty}
              emptyMessage="No todos yet"
              typingText={typingText}
              typingActive={typingActive}
              label={showSecondCard ? 'Device A' : undefined}
            />
          </div>
          <motion.div
            style={{ width: 350 }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
              opacity: showSecondCard ? 1 : 0,
              scale: showSecondCard ? 1 : 0.95,
            }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 25,
            }}
            className={showSecondCard ? '' : 'pointer-events-none'}
          >
            <TodoCard
              todos={rightTodos}
              glowKey={glowKey}
              showEmpty={false}
              typingText={rightTypingText}
              typingActive={rightTypingActive}
              label="Device B"
              overlay={
                offlineOverlay ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-gray-900/50 backdrop-blur-sm"
                  >
                    <WifiOffIcon />
                    <span className="mt-2 text-sm font-medium text-white/90">
                      Offline
                    </span>
                  </motion.div>
                ) : null
              }
            />
          </motion.div>
        </div>

        {/* Feature indicator badges: absolutely positioned below cards */}
        <div className="absolute -bottom-12 left-1/2 flex -translate-x-1/2 items-center justify-center">
          <AnimatePresence>
            {showPersistBadge && (
              <motion.div
                key="persist"
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              >
                <div className="flex items-center gap-1.5 rounded-full bg-green-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm">
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Persists!
                </div>
              </motion.div>
            )}
            {showRealtimeBadge && (
              <motion.div
                key="realtime"
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              >
                <div className="flex items-center gap-1.5 rounded-full bg-orange-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm">
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="none"
                  >
                    <path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z" />
                  </svg>
                  Real-time
                </div>
              </motion.div>
            )}
            {showOfflineBadge && (
              <motion.div
                key="offline"
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              >
                <div className="flex items-center gap-1.5 rounded-full bg-blue-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm">
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M12 20h.01" />
                    <path d="M8.5 16.5a5 5 0 0 1 7 0" />
                    <path d="M5 12.86a10 10 0 0 1 14 0" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                  Offline
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Page Export ──────────────────────────────────────────────────────────────

export default function TodoDemo1Page() {
  return <TodoDemo />;
}
