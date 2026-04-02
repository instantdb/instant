'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Confetti ────────────────────────────────────────────────

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

// ─── Icons ───────────────────────────────────────────────────

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

// ─── Constants ───────────────────────────────────────────────

const INITIAL_TODOS = ['Buy groceries', 'Walk the dog', 'Ship v2'];

type TodoItem = { id: number; text: string };

// ─── Todo Card ───────────────────────────────────────────────

function TodoCard({
  todos,
  showEmpty,
  emptyMessage,
  typingText,
  typingActive,
  label,
  refreshProgress,
  flashWhite,
  overlay,
}: {
  todos: TodoItem[];
  showEmpty: boolean;
  emptyMessage?: string;
  typingText: string;
  typingActive: boolean;
  label?: string;
  refreshProgress: boolean;
  flashWhite: boolean;
  overlay?: React.ReactNode;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-gray-200/60"
      style={{ width: 350, height: 420 }}
    >
      {/* Refresh progress bar */}
      <AnimatePresence>
        {refreshProgress && (
          <motion.div
            className="absolute left-0 top-0 z-20 h-[3px] bg-orange-400"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeInOut' }}
          />
        )}
      </AnimatePresence>

      {/* White flash overlay */}
      <AnimatePresence>
        {flashWhite && (
          <motion.div
            className="absolute inset-0 z-10 bg-white"
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>

      <div className="flex h-full flex-col p-6">
        {/* Label */}
        {label && (
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
            {label}
          </div>
        )}

        {/* Header */}
        <div className="mb-5 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-orange-400" />
          <h2 className="text-xl font-bold text-gray-900">My Todos</h2>
        </div>

        {/* Todo list */}
        <div className="min-h-0 flex-1">
          <AnimatePresence mode="popLayout">
            {todos.map((todo) => (
              <motion.div
                key={todo.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 25,
                }}
                className="flex items-center gap-3 py-2.5"
              >
                <div className="h-[18px] w-[18px] flex-shrink-0 rounded-full border-[1.5px] border-gray-300" />
                <span className="text-lg text-gray-700">{todo.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          {showEmpty && todos.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center py-12 text-gray-400"
            >
              <span className="text-sm">{emptyMessage || 'No todos yet'}</span>
            </motion.div>
          )}
        </div>

        {/* Input area */}
        <div className="mt-auto pt-4">
          <div className="border-b border-gray-200 pb-2">
            <span className="text-lg text-gray-400">
              {typingActive && typingText ? (
                <span className="text-gray-700">
                  {typingText}
                  <span className="animate-pulse text-orange-400">|</span>
                </span>
              ) : typingText ? (
                <span className="text-gray-700">{typingText}</span>
              ) : (
                'What needs to be done?'
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Overlay (offline etc.) */}
      {overlay}
    </div>
  );
}

// ─── Feature Indicator Text ──────────────────────────────────

function FeatureIndicator({
  text,
  color,
}: {
  text: string;
  color: string;
}) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="text-sm font-medium"
      style={{ color }}
    >
      {text}
    </motion.span>
  );
}

// ─── Main Demo ───────────────────────────────────────────────

function TodoDemo() {
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

  const [phase, setPhase] = useState<Phase>('usestate-add');

  // ─── State ─────────────────────────────────────────────────

  const [leftTodos, setLeftTodos] = useState<TodoItem[]>([]);
  const [rightTodos, setRightTodos] = useState<TodoItem[]>([]);

  const [codeBadge, setCodeBadge] = useState<'usestate' | 'usequery'>('usestate');
  const [codeTransitioning, setCodeTransitioning] = useState(false);
  const [showSecondCard, setShowSecondCard] = useState(false);

  const [refreshProgress, setRefreshProgress] = useState(false);
  const [flashWhite, setFlashWhite] = useState(false);

  const [offlineOverlay, setOfflineOverlay] = useState(false);

  const [typingText, setTypingText] = useState('');
  const [typingActive, setTypingActive] = useState(false);
  const [rightTypingText, setRightTypingText] = useState('');
  const [rightTypingActive, setRightTypingActive] = useState(false);

  const [showEmpty, setShowEmpty] = useState(false);

  const [featureText, setFeatureText] = useState('');
  const [featureColor, setFeatureColor] = useState('');

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasStarted = useRef(false);
  const confettiRef = useRef<HTMLDivElement>(null);

  // ─── Helpers ───────────────────────────────────────────────

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

  // ─── Orchestration ─────────────────────────────────────────

  const runCycle = useCallback(() => {
    clear();

    // Reset
    setPhase('usestate-add');
    setLeftTodos([]);
    setRightTodos([]);
    setCodeBadge('usestate');
    setCodeTransitioning(false);
    setShowSecondCard(false);
    setRefreshProgress(false);
    setFlashWhite(false);
    setOfflineOverlay(false);
    setTypingText('');
    setTypingActive(false);
    setRightTypingText('');
    setRightTypingActive(false);
    setShowEmpty(false);
    setFeatureText('');
    setFeatureColor('');

    let t = 600;
    let nextId = 1;

    // ─── Phase 1: useState (add todos) ~5s ───────────────────

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

    // ─── Phase 2: The Refresh ~2s ────────────────────────────

    t += 400;
    sched(() => {
      setPhase('usestate-refresh');
      setRefreshProgress(true);
    }, t);

    t += 700;
    sched(() => {
      setRefreshProgress(false);
      setFlashWhite(true);
      setLeftTodos([]);
    }, t);

    t += 200;
    sched(() => {
      setFlashWhite(false);
      setPhase('usestate-empty');
      setShowEmpty(true);
      setFeatureText('State lost on refresh');
      setFeatureColor('#dc2626');
    }, t);

    t += 1400;

    // ─── Phase 3: The Transformation ~2.5s ───────────────────

    sched(() => {
      setPhase('transform');
      setCodeTransitioning(true);
      setFeatureText('');
    }, t);

    t += 400;
    sched(() => {
      setCodeBadge('usequery');
    }, t);

    t += 500;
    sched(() => {
      setCodeTransitioning(false);
      if (confettiRef.current) spawnConfetti(confettiRef.current);
    }, t);

    t += 700;
    sched(() => {
      if (confettiRef.current) spawnConfetti(confettiRef.current);
    }, t);

    t += 800;

    // ─── Phase 4: Persistence ~3s ────────────────────────────

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
      setRefreshProgress(true);
    }, t);

    t += 700;
    sched(() => {
      setRefreshProgress(false);
      setFlashWhite(true);
    }, t);

    t += 200;
    sched(() => {
      setFlashWhite(false);
      setPhase('instant-persist');
      setFeatureText('Persists across refreshes');
      setFeatureColor('#16a34a');
    }, t);

    t += 2500;

    // ─── Phase 5: Real-time ~3s ──────────────────────────────

    sched(() => {
      setPhase('realtime');
      setFeatureText('');
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
      setFeatureText('Syncs in real-time');
      setFeatureColor('#ea580c');
    }, t);

    t += 2500;

    // ─── Phase 6: Offline ~3s ────────────────────────────────

    sched(() => {
      setPhase('offline');
      setFeatureText('');
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
      setFeatureText('Works offline, syncs when back');
      setFeatureColor('#2563eb');
    }, t);

    t += 2500;

    // ─── Phase 7: Finale ~2s, then loop ─────────────────────

    sched(() => {
      setPhase('finale');
      setFeatureText('');
    }, t);

    t += 2000;
    sched(() => runCycle(), t);
  }, [clear, sched, typeText]);

  // ─── Lifecycle ─────────────────────────────────────────────

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      runCycle();
    }
    return () => clear();
  }, [runCycle, clear]);

  // ─── Render ────────────────────────────────────────────────

  const showDual =
    showSecondCard ||
    phase === 'realtime' ||
    phase === 'realtime-sync' ||
    phase === 'offline' ||
    phase === 'offline-sync' ||
    phase === 'finale';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white">
      {/* Confetti anchor */}
      <div ref={confettiRef} className="pointer-events-none absolute inset-0" style={{ zIndex: 9999 }} />

      {/* Cards area: fixed width container */}
      <div className="flex gap-6" style={{ width: 740 }}>
        <div style={{ width: 350 }}>
          <TodoCard
            todos={leftTodos}
            showEmpty={showEmpty}
            emptyMessage="No todos yet"
            typingText={typingText}
            typingActive={typingActive}
            label={showDual ? 'Device A' : undefined}
            refreshProgress={refreshProgress}
            flashWhite={flashWhite}
          />
        </div>
        <motion.div
          style={{ width: 350 }}
          animate={{ opacity: showDual ? 1 : 0 }}
          transition={{ duration: 0.5 }}
          className={showDual ? '' : 'pointer-events-none'}
        >
          <TodoCard
            todos={rightTodos}
            showEmpty={false}
            typingText={rightTypingText}
            typingActive={rightTypingActive}
            label={showDual ? 'Device B' : undefined}
            refreshProgress={false}
            flashWhite={false}
            overlay={
              offlineOverlay ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl bg-gray-900/70"
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

      {/* Code caption below cards */}
      <div className="mt-6 flex flex-col items-center gap-2" style={{ minHeight: 48 }}>
        <AnimatePresence mode="wait">
          {codeBadge === 'usestate' && !codeTransitioning && (
            <motion.span
              key="usestate-code"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="font-mono text-sm text-gray-400"
            >
              {'const [todos, setTodos] = useState([])'}
            </motion.span>
          )}
          {codeBadge === 'usequery' && !codeTransitioning && (
            <motion.span
              key="usequery-code"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="font-mono text-sm text-gray-400"
            >
              {'const { data } = db.useQuery({ todos: {} })'}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Feature indicator text */}
        <div style={{ minHeight: 20 }}>
          <AnimatePresence mode="wait">
            {featureText && (
              <FeatureIndicator
                key={featureText}
                text={featureText}
                color={featureColor}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ─── Export ──────────────────────────────────────────────────

export default function TodoDemo3Page() {
  return <TodoDemo />;
}
