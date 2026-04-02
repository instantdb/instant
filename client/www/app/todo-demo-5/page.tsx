'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Confetti ────────────────────────────────────────────

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

// ─── Syntax-Highlighted Code Snippets ────────────────────

function UseStateCode() {
  return (
    <span style={{ fontFamily: 'monospace', fontSize: '15px' }}>
      <span style={{ color: '#286983' }}>const</span>{' '}
      <span style={{ color: '#575279' }}>[</span>
      <span style={{ color: '#56949f' }}>todos</span>
      <span style={{ color: '#575279' }}>, </span>
      <span style={{ color: '#56949f' }}>setTodos</span>
      <span style={{ color: '#575279' }}>]</span>
      <span style={{ color: '#575279' }}> = </span>
      <span style={{ color: '#d7827e' }}>useState</span>
      <span style={{ color: '#797593' }}>(</span>
      <span style={{ color: '#575279' }}>[]</span>
      <span style={{ color: '#797593' }}>)</span>
    </span>
  );
}

function UseQueryCode() {
  return (
    <span style={{ fontFamily: 'monospace', fontSize: '15px' }}>
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

// ─── Fake Cursor ─────────────────────────────────────────

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

// ─── Icons ───────────────────────────────────────────────

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
      className="h-10 w-10 text-white"
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

function LightningIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z" />
    </svg>
  );
}

// ─── Tab Toggle Code Badge ───────────────────────────────

function TabCodeBadge({
  activeTab,
  showCursor,
  cursorX,
  cursorY,
  cursorClicking,
  afterTabRef,
  confettiRef,
}: {
  activeTab: 'before' | 'after';
  showCursor: boolean;
  cursorX: number;
  cursorY: number;
  cursorClicking: boolean;
  afterTabRef: React.RefObject<HTMLButtonElement | null>;
  confettiRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={confettiRef as React.RefObject<HTMLDivElement>}
      className="relative overflow-visible rounded-xl"
      style={{ backgroundColor: '#faf8f5' }}
    >
      {/* Tab bar */}
      <div
        className="relative flex border-b"
        style={{ borderColor: '#e8e5e0' }}
      >
        <button className="relative px-5 py-2.5 text-sm font-medium">
          <span
            style={{
              color: activeTab === 'before' ? '#1a1a1a' : '#9ca3af',
              transition: 'color 0.3s ease',
            }}
          >
            Before
          </span>
          {activeTab === 'before' && (
            <motion.div
              layoutId="tab-underline"
              className="absolute bottom-0 left-0 right-0 h-0.5"
              style={{ backgroundColor: '#f97316' }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            />
          )}
        </button>
        <button
          ref={afterTabRef as React.RefObject<HTMLButtonElement>}
          className="relative px-5 py-2.5 text-sm font-medium"
        >
          <span
            style={{
              color: activeTab === 'after' ? '#1a1a1a' : '#9ca3af',
              transition: 'color 0.3s ease',
            }}
          >
            After
          </span>
          {activeTab === 'after' && (
            <motion.div
              layoutId="tab-underline"
              className="absolute bottom-0 left-0 right-0 h-0.5"
              style={{ backgroundColor: '#f97316' }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            />
          )}
        </button>
      </div>

      {/* Code content */}
      <div className="px-5 py-3.5">
        <AnimatePresence mode="wait">
          {activeTab === 'before' ? (
            <motion.div
              key="before-code"
              initial={{ opacity: 0, filter: 'blur(4px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(4px)' }}
              transition={{ duration: 0.3 }}
            >
              <UseStateCode />
            </motion.div>
          ) : (
            <motion.div
              key="after-code"
              initial={{ opacity: 0, filter: 'blur(4px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(4px)' }}
              transition={{ duration: 0.3 }}
            >
              <UseQueryCode />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Fake cursor overlay */}
      <AnimatePresence>
        {showCursor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <FakeCursor x={cursorX} y={cursorY} clicking={cursorClicking} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Todo Card ───────────────────────────────────────────

type TodoItem = { id: number; text: string };

function TodoCard({
  todos,
  showEmpty,
  emptyMessage,
  typingText,
  typingActive,
  label,
  overlay,
}: {
  todos: TodoItem[];
  showEmpty: boolean;
  emptyMessage?: string;
  typingText: string;
  typingActive: boolean;
  label?: string;
  overlay?: React.ReactNode;
}) {
  return (
    <div
      className="relative rounded-2xl bg-white shadow-lg"
      style={{
        overflow: 'visible',
        height: 320,
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      }}
    >
      {/* Ring via box-shadow to avoid layout shift */}
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          boxShadow: 'inset 0 0 0 1px rgba(229,231,235,0.5)',
          pointerEvents: 'none',
        }}
      />

      {/* Orange gradient header */}
      <div
        className="flex items-center gap-2 rounded-t-2xl px-5 py-3"
        style={{
          background: 'linear-gradient(135deg, #f97316, #fb923c)',
        }}
      >
        {label && (
          <span className="text-xs font-medium uppercase tracking-wider text-white/70">
            {label}
          </span>
        )}
        <span className="text-sm font-semibold text-white">My Todos</span>
      </div>

      {/* Todo list area */}
      <div className="px-5 pt-3">
        <div style={{ height: 180, overflow: 'hidden' }}>
          <AnimatePresence mode="popLayout">
            {todos.map((todo) => (
              <motion.div
                key={todo.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 30,
                }}
                className="flex items-center gap-3 py-2"
              >
                <div className="h-5 w-5 flex-shrink-0 rounded-full border-2 border-gray-300" />
                <span className="text-base text-gray-700">{todo.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          {showEmpty && todos.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full flex-col items-center justify-center text-gray-400"
            >
              <span className="text-sm">
                {emptyMessage || 'No todos yet'}
              </span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
        <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
          <div className="flex-1 border-b border-gray-200 pb-1">
            <span className="text-sm text-gray-400">
              {typingActive && typingText ? (
                <span className="text-gray-700">
                  {typingText}
                  <span className="animate-pulse text-gray-400">|</span>
                </span>
              ) : typingText ? (
                <span className="text-gray-700">{typingText}</span>
              ) : (
                'What needs to be done?'
              )}
            </span>
          </div>
          <motion.button
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
            style={{ backgroundColor: '#f97316' }}
            whileTap={{ scale: 0.95 }}
          >
            Add
          </motion.button>
        </div>
      </div>

      {overlay}
    </div>
  );
}

// ─── Feature Indicator Pills ─────────────────────────────

function FeaturePill({
  icon,
  text,
  color,
}: {
  icon: React.ReactNode;
  text: string;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {icon}
      {text}
    </motion.div>
  );
}

// ─── Constants ───────────────────────────────────────────

const INITIAL_TODOS = ['Buy groceries', 'Walk the dog', 'Ship v2'];

// ─── Main Demo Component ─────────────────────────────────

type Phase =
  | 'usestate-add'
  | 'usestate-refresh'
  | 'usestate-empty'
  | 'transform-cursor'
  | 'transform-click'
  | 'transform-done'
  | 'instant-add'
  | 'instant-refresh'
  | 'instant-persist'
  | 'realtime'
  | 'realtime-sync'
  | 'offline'
  | 'offline-sync'
  | 'finale';

function TodoDemo() {
  const [phase, setPhase] = useState<Phase>('usestate-add');

  // Todo states
  const [leftTodos, setLeftTodos] = useState<TodoItem[]>([]);
  const [rightTodos, setRightTodos] = useState<TodoItem[]>([]);

  // Tab code badge
  const [activeTab, setActiveTab] = useState<'before' | 'after'>('before');

  // Cursor state
  const [showCursor, setShowCursor] = useState(false);
  const [cursorX, setCursorX] = useState(0);
  const [cursorY, setCursorY] = useState(0);
  const [cursorClicking, setCursorClicking] = useState(false);

  // UI states
  const [showRefresh, setShowRefresh] = useState(false);
  const [refreshSpin, setRefreshSpin] = useState(false);
  const [showSecondCard, setShowSecondCard] = useState(false);
  const [typingText, setTypingText] = useState('');
  const [typingActive, setTypingActive] = useState(false);
  const [rightTypingText, setRightTypingText] = useState('');
  const [rightTypingActive, setRightTypingActive] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);

  // Feature indicators
  const [featureIndicator, setFeatureIndicator] = useState<
    'none' | 'lost' | 'persists' | 'realtime' | 'offline'
  >('none');

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasStarted = useRef(false);
  const confettiRef = useRef<HTMLDivElement>(null);
  const afterTabRef = useRef<HTMLButtonElement>(null);

  const clear = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const sched = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeouts.current.push(t);
  }, []);

  const typeText = useCallback(
    (
      text: string,
      setterText: (t: string) => void,
      setterActive: (a: boolean) => void,
      startMs: number,
      speed = 40,
    ): number => {
      sched(() => setterActive(true), startMs);
      for (let i = 0; i <= text.length; i++) {
        const partial = text.slice(0, i);
        sched(() => setterText(partial), startMs + i * speed);
      }
      const endMs = startMs + text.length * speed + 100;
      sched(() => setterActive(false), endMs);
      return endMs;
    },
    [sched],
  );

  const runCycle = useCallback(() => {
    clear();

    // Reset everything
    setPhase('usestate-add');
    setLeftTodos([]);
    setRightTodos([]);
    setActiveTab('before');
    setShowCursor(false);
    setCursorX(0);
    setCursorY(0);
    setCursorClicking(false);
    setShowRefresh(false);
    setRefreshSpin(false);
    setShowSecondCard(false);
    setTypingText('');
    setTypingActive(false);
    setRightTypingText('');
    setRightTypingActive(false);
    setShowEmpty(false);
    setFeatureIndicator('none');

    let t = 600;
    let nextId = 1;

    // ─── Phase 1: useState - add todos ──────────────────
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

    // ─── Phase 2: The Refresh (data loss) ───────────────
    t += 400;
    sched(() => {
      setPhase('usestate-refresh');
      setShowRefresh(true);
      setRefreshSpin(true);
    }, t);

    t += 800;
    sched(() => {
      setLeftTodos([]);
      setRefreshSpin(false);
    }, t);

    t += 400;
    sched(() => {
      setShowRefresh(false);
      setPhase('usestate-empty');
      setShowEmpty(true);
      setFeatureIndicator('lost');
    }, t);

    t += 1200;

    // ─── Phase 3: The Transformation (tab click) ────────

    // Cursor appears off to the side
    sched(() => {
      setPhase('transform-cursor');
      setFeatureIndicator('none');
      setCursorX(120);
      setCursorY(8);
      setShowCursor(true);
    }, t);

    // Cursor moves toward the "After" tab
    t += 400;
    sched(() => {
      // Position cursor over the After tab center
      // The After tab is roughly at x:110, y:12 in the badge's coordinate space
      setCursorX(110);
      setCursorY(12);
    }, t);

    // Click
    t += 500;
    sched(() => {
      setPhase('transform-click');
      setCursorClicking(true);
    }, t);

    // Tab switches
    t += 150;
    sched(() => {
      setActiveTab('after');
    }, t);

    // Release click
    t += 200;
    sched(() => {
      setCursorClicking(false);
    }, t);

    // Cursor fades away, confetti
    t += 300;
    sched(() => {
      setShowCursor(false);
      setPhase('transform-done');
      if (confettiRef.current) spawnConfetti(confettiRef.current);
    }, t);

    t += 500;
    sched(() => {
      if (confettiRef.current) spawnConfetti(confettiRef.current);
    }, t);

    t += 700;

    // ─── Phase 4: Persistence proof ─────────────────────
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
      setFeatureIndicator('persists');
    }, t);

    t += 2200;

    // ─── Phase 5: Real-time ─────────────────────────────
    sched(() => {
      setPhase('realtime');
      setFeatureIndicator('none');
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
      setLeftTodos((prev) => [
        ...prev,
        { id: realtimeId, text: realtimeTodo },
      ]);
    }, t);

    t += 300;
    sched(() => {
      setRightTodos((prev) => [
        ...prev,
        { id: realtimeId + 1000, text: realtimeTodo },
      ]);
      setFeatureIndicator('realtime');
    }, t);

    t += 2500;

    // ─── Phase 6: Offline ───────────────────────────────
    sched(() => {
      setPhase('offline');
      setFeatureIndicator('none');
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
    }, t);

    t += 600;
    sched(() => {
      setLeftTodos((prev) => [
        ...prev,
        { id: offlineId, text: offlineTodo },
      ]);
      setFeatureIndicator('offline');
    }, t);

    t += 2500;

    // ─── Phase 7: Finale / loop ─────────────────────────
    sched(() => {
      setPhase('finale');
      setFeatureIndicator('none');
    }, t);

    t += 2000;
    sched(() => runCycle(), t);
  }, [clear, sched, typeText]);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      runCycle();
    }
    return () => clear();
  }, [runCycle, clear]);

  const isOfflineOverlay = phase === 'offline';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-8">
      {/* Code badge with tabs */}
      <div className="relative mb-8">
        <TabCodeBadge
          activeTab={activeTab}
          showCursor={showCursor}
          cursorX={cursorX}
          cursorY={cursorY}
          cursorClicking={cursorClicking}
          afterTabRef={afterTabRef}
          confettiRef={confettiRef}
        />
      </div>

      {/* Refresh indicator - absolutely positioned */}
      <div className="relative mb-4" style={{ height: 28 }}>
        <AnimatePresence>
          {showRefresh && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap text-sm text-gray-500"
            >
              <RefreshIcon spinning={refreshSpin} />
              <span>Refreshing...</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Cards area - fixed width container */}
      <div className="flex gap-6" style={{ width: 740 }}>
        <div style={{ width: 350 }}>
          <TodoCard
            todos={leftTodos}
            showEmpty={showEmpty}
            emptyMessage="No todos yet"
            typingText={typingText}
            typingActive={typingActive}
            label={showSecondCard ? 'Device A' : undefined}
          />
        </div>
        <motion.div
          style={{ width: 350 }}
          animate={{ opacity: showSecondCard ? 1 : 0 }}
          transition={{ duration: 0.5 }}
          className={showSecondCard ? '' : 'pointer-events-none'}
        >
          <TodoCard
            todos={rightTodos}
            showEmpty={false}
            typingText={rightTypingText}
            typingActive={rightTypingActive}
            label="Device B"
            overlay={
              isOfflineOverlay ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-gray-900/70"
                  style={{ zIndex: 10 }}
                >
                  <WifiOffIcon />
                  <span className="mt-2 text-sm font-medium text-white">
                    Offline
                  </span>
                </motion.div>
              ) : null
            }
          />
        </motion.div>
      </div>

      {/* Feature indicator pills - absolutely positioned below cards */}
      <div className="relative mt-5" style={{ height: 36 }}>
        <AnimatePresence mode="wait">
          {featureIndicator === 'lost' && (
            <motion.div
              key="lost"
              className="absolute left-1/2 -translate-x-1/2"
            >
              <FeaturePill
                icon={
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                }
                text="Data lost on refresh"
                color="#ef4444"
              />
            </motion.div>
          )}
          {featureIndicator === 'persists' && (
            <motion.div
              key="persists"
              className="absolute left-1/2 -translate-x-1/2"
            >
              <FeaturePill
                icon={
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                }
                text="Data persists!"
                color="#22c55e"
              />
            </motion.div>
          )}
          {featureIndicator === 'realtime' && (
            <motion.div
              key="realtime"
              className="absolute left-1/2 -translate-x-1/2"
            >
              <FeaturePill
                icon={<LightningIcon />}
                text="Real-time sync"
                color="#f97316"
              />
            </motion.div>
          )}
          {featureIndicator === 'offline' && (
            <motion.div
              key="offline"
              className="absolute left-1/2 -translate-x-1/2"
            >
              <FeaturePill
                icon={
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
                  </svg>
                }
                text="Works offline"
                color="#3b82f6"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Page Export ──────────────────────────────────────────

export default function TodoDemo5Page() {
  return <TodoDemo />;
}
