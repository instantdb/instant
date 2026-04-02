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

// ─── Syntax Highlighted Code Lines ───────────────────────

const mono = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '13px',
  lineHeight: '20px',
};

const c = {
  keyword: '#286983',
  fn: '#d7827e',
  variable: '#56949f',
  punct: '#797593',
  text: '#575279',
  prop: '#ea9d34',
};

function UseStateLine1() {
  return (
    <span style={mono}>
      <span style={{ color: c.keyword }}>const</span>{' '}
      <span style={{ color: c.punct }}>[</span>
      <span style={{ color: c.variable }}>todos</span>
      <span style={{ color: c.punct }}>, </span>
      <span style={{ color: c.variable }}>setTodos</span>
      <span style={{ color: c.punct }}>]</span>
      <span style={{ color: c.punct }}> = </span>
      <span style={{ color: c.fn }}>useState</span>
      <span style={{ color: c.punct }}>([])</span>
    </span>
  );
}

function UseStateLine2() {
  return (
    <span style={mono}>
      <span style={{ color: c.variable }}>setTodos</span>
      <span style={{ color: c.punct }}>(</span>
      <span style={{ color: c.punct }}>[...</span>
      <span style={{ color: c.variable }}>todos</span>
      <span style={{ color: c.punct }}>, </span>
      <span style={{ color: c.variable }}>newTodo</span>
      <span style={{ color: c.punct }}>])</span>
    </span>
  );
}

function UseStateLine3() {
  return (
    <span style={mono}>
      <span style={{ color: c.keyword }}>return</span>{' '}
      <span style={{ color: c.punct }}>{'<'}</span>
      <span style={{ color: c.fn }}>TodoList</span>{' '}
      <span style={{ color: c.variable }}>items</span>
      <span style={{ color: c.punct }}>={'{'}</span>
      <span style={{ color: c.variable }}>todos</span>
      <span style={{ color: c.punct }}>{'}'}</span>{' '}
      <span style={{ color: c.punct }}>/{'>'}</span>
    </span>
  );
}

function UseQueryLine1() {
  return (
    <span style={mono}>
      <span style={{ color: c.keyword }}>const</span>{' '}
      <span style={{ color: c.punct }}>{'{ '}</span>
      <span style={{ color: c.variable }}>data</span>
      <span style={{ color: c.punct }}>{' } = '}</span>
      <span style={{ color: c.variable }}>db</span>
      <span style={{ color: c.punct }}>.</span>
      <span style={{ color: c.fn }}>useQuery</span>
      <span style={{ color: c.punct }}>({'{ '}</span>
      <span style={{ color: c.prop }}>todos</span>
      <span style={{ color: c.punct }}>{': {} })'}</span>
    </span>
  );
}

function UseQueryLine2() {
  return (
    <span style={mono}>
      <span style={{ color: c.variable }}>db</span>
      <span style={{ color: c.punct }}>.</span>
      <span style={{ color: c.fn }}>transact</span>
      <span style={{ color: c.punct }}>(</span>
      <span style={{ color: c.variable }}>db</span>
      <span style={{ color: c.punct }}>.</span>
      <span style={{ color: c.fn }}>tx</span>
      <span style={{ color: c.punct }}>.</span>
      <span style={{ color: c.prop }}>todos</span>
      <span style={{ color: c.punct }}>...</span>
      <span style={{ color: c.punct }}>)</span>
    </span>
  );
}

function UseQueryLine3() {
  return (
    <span style={mono}>
      <span style={{ color: c.keyword }}>return</span>{' '}
      <span style={{ color: c.punct }}>{'<'}</span>
      <span style={{ color: c.fn }}>TodoList</span>{' '}
      <span style={{ color: c.variable }}>items</span>
      <span style={{ color: c.punct }}>={'{'}</span>
      <span style={{ color: c.variable }}>data</span>
      <span style={{ color: c.punct }}>.</span>
      <span style={{ color: c.prop }}>todos</span>
      <span style={{ color: c.punct }}>{'}'}</span>{' '}
      <span style={{ color: c.punct }}>/{'>'}</span>
    </span>
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

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CloudIcon() {
  return (
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
  );
}

// ─── Types ───────────────────────────────────────────────

type TodoItem = { id: number; text: string };

type CodeStripState =
  | 'collapsed-usestate'
  | 'expanding'
  | 'showing-old'
  | 'swapping'
  | 'showing-new'
  | 'collapsing'
  | 'collapsed-usequery';

const COLLAPSED_HEIGHT = 44;
const EXPANDED_HEIGHT = 108;

const INITIAL_TODOS = ['Buy groceries', 'Walk the dog', 'Ship v2'];

// ─── Code Strip Component ────────────────────────────────

function CodeStrip({ state }: { state: CodeStripState }) {
  const isExpanded =
    state === 'expanding' ||
    state === 'showing-old' ||
    state === 'swapping' ||
    state === 'showing-new';

  const targetHeight = isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;

  const showOldCode =
    state === 'showing-old' || state === 'expanding';
  const showNewCode =
    state === 'swapping' || state === 'showing-new';

  const highlightBg = showOldCode
    ? 'rgba(239, 68, 68, 0.08)'
    : showNewCode
      ? 'rgba(34, 197, 94, 0.08)'
      : 'transparent';

  return (
    <motion.div
      className="overflow-hidden border-b border-gray-200/60"
      style={{ backgroundColor: '#faf8f5' }}
      animate={{ height: targetHeight }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
      }}
    >
      <div className="px-4" style={{ paddingTop: 12, paddingBottom: 12 }}>
        <AnimatePresence mode="wait">
          {!isExpanded && state === 'collapsed-usestate' && (
            <motion.div
              key="collapsed-usestate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="truncate"
            >
              <UseStateLine1 />
            </motion.div>
          )}

          {!isExpanded && state === 'collapsed-usequery' && (
            <motion.div
              key="collapsed-usequery"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="truncate"
            >
              <UseQueryLine1 />
            </motion.div>
          )}

          {!isExpanded && state === 'collapsing' && (
            <motion.div
              key="collapsing-usequery"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="truncate"
            >
              <UseQueryLine1 />
            </motion.div>
          )}

          {isExpanded && (
            <motion.div
              key="expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div
                className="flex flex-col gap-1 rounded-md px-2 py-1"
                style={{
                  backgroundColor: highlightBg,
                  transition: 'background-color 0.4s ease',
                }}
              >
                <AnimatePresence mode="wait">
                  {showOldCode && (
                    <motion.div
                      key="old-code"
                      className="flex flex-col gap-1"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <UseStateLine1 />
                      <UseStateLine2 />
                      <UseStateLine3 />
                    </motion.div>
                  )}
                  {showNewCode && (
                    <motion.div
                      key="new-code"
                      className="flex flex-col gap-1"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <UseQueryLine1 />
                      <UseQueryLine2 />
                      <UseQueryLine3 />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Todo Card Component ─────────────────────────────────

function TodoCard({
  todos,
  borderColor,
  showEmpty,
  emptyMessage,
  typingText,
  typingActive,
  label,
  codeState,
  overlay,
  confettiRef,
}: {
  todos: TodoItem[];
  borderColor: string;
  showEmpty: boolean;
  emptyMessage?: string;
  typingText: string;
  typingActive: boolean;
  label?: string;
  codeState: CodeStripState;
  overlay?: React.ReactNode;
  confettiRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={confettiRef}
      className="relative overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-200/60"
      style={{
        border: `2px solid ${borderColor}`,
        transition: 'border-color 0.6s ease',
      }}
    >
      <CodeStrip state={codeState} />

      <div className="p-5">
        {label && (
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
            {label}
          </div>
        )}
        <h2 className="mb-3 text-lg font-semibold text-gray-900">My Todos</h2>

        <div className="mb-4" style={{ minHeight: 160 }}>
          <AnimatePresence mode="popLayout">
            {todos.map((todo) => (
              <motion.div
                key={todo.id}
                initial={{ opacity: 0, y: 8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, x: -20, height: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 300,
                  damping: 25,
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
              className="flex flex-col items-center justify-center py-10 text-gray-400"
            >
              <span className="text-sm">
                {emptyMessage || 'No todos yet'}
              </span>
            </motion.div>
          )}
        </div>

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
  label,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {icon}
      {label}
    </motion.div>
  );
}

// ─── Main Demo Component ─────────────────────────────────

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

  // ─── Todo State ────────────────────────────────────────
  const [leftTodos, setLeftTodos] = useState<TodoItem[]>([]);
  const [rightTodos, setRightTodos] = useState<TodoItem[]>([]);

  // ─── UI State ──────────────────────────────────────────
  const [codeState, setCodeState] = useState<CodeStripState>(
    'collapsed-usestate',
  );
  const [borderColor, setBorderColor] = useState('#e5e7eb');
  const [showRefresh, setShowRefresh] = useState(false);
  const [refreshSpin, setRefreshSpin] = useState(false);
  const [showSecondCard, setShowSecondCard] = useState(false);
  const [typingText, setTypingText] = useState('');
  const [typingActive, setTypingActive] = useState(false);
  const [rightTypingText, setRightTypingText] = useState('');
  const [rightTypingActive, setRightTypingActive] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);

  // ─── Feature Indicators ────────────────────────────────
  const [activePill, setActivePill] = useState<
    'none' | 'lost' | 'persist' | 'realtime' | 'offline'
  >('none');

  // ─── Refs ──────────────────────────────────────────────
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasStarted = useRef(false);
  const confettiRef = useRef<HTMLDivElement>(null);

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

  // ─── Orchestration ─────────────────────────────────────

  const runCycle = useCallback(() => {
    clear();

    // Reset everything
    setPhase('usestate-add');
    setLeftTodos([]);
    setRightTodos([]);
    setCodeState('collapsed-usestate');
    setBorderColor('#e5e7eb');
    setShowRefresh(false);
    setRefreshSpin(false);
    setShowSecondCard(false);
    setTypingText('');
    setTypingActive(false);
    setRightTypingText('');
    setRightTypingActive(false);
    setShowEmpty(false);
    setActivePill('none');

    let t = 600;
    let nextId = 1;

    // ─── Phase 1: useState (add todos) ~5s ───────────────
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

    // ─── Phase 2: The Refresh ~2s ────────────────────────
    t += 400;
    sched(() => {
      setPhase('usestate-refresh');
      setShowRefresh(true);
      setRefreshSpin(true);
    }, t);

    t += 800;
    sched(() => {
      setBorderColor('#ef4444');
      setLeftTodos([]);
      setRefreshSpin(false);
    }, t);

    t += 400;
    sched(() => {
      setShowRefresh(false);
      setPhase('usestate-empty');
      setShowEmpty(true);
      setActivePill('lost');
    }, t);

    t += 1200;

    // ─── Phase 3: The Transformation ~2.5s ───────────────
    sched(() => {
      setPhase('transform');
      setActivePill('none');
      setShowEmpty(false);
    }, t);

    // Expand the code strip
    t += 100;
    sched(() => setCodeState('expanding'), t);

    t += 400;
    sched(() => setCodeState('showing-old'), t);

    // Swap old code for new code
    t += 800;
    sched(() => {
      setCodeState('swapping');
      setBorderColor('#f97316');
    }, t);

    t += 500;
    sched(() => setCodeState('showing-new'), t);

    // Confetti + green
    t += 500;
    sched(() => {
      setBorderColor('#22c55e');
      if (confettiRef.current) spawnConfetti(confettiRef.current);
    }, t);

    t += 300;
    sched(() => {
      if (confettiRef.current) spawnConfetti(confettiRef.current);
    }, t);

    // Collapse back
    t += 500;
    sched(() => setCodeState('collapsing'), t);

    t += 500;
    sched(() => setCodeState('collapsed-usequery'), t);

    t += 300;

    // ─── Phase 4: Persistence ~3s ────────────────────────
    sched(() => {
      setPhase('instant-add');
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
    sched(() => setRefreshSpin(false), t);

    t += 400;
    sched(() => {
      setShowRefresh(false);
      setPhase('instant-persist');
      setActivePill('persist');
    }, t);

    t += 2200;

    // ─── Phase 5: Real-time ~3s ──────────────────────────
    sched(() => {
      setPhase('realtime');
      setActivePill('none');
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
      setActivePill('realtime');
    }, t);

    t += 2500;

    // ─── Phase 6: Offline ~3s ────────────────────────────
    sched(() => {
      setPhase('offline');
      setActivePill('none');
    }, t);

    t += 200;

    const offlineTodo = 'Read book';
    const offlineId = nextId++;

    // Type on right card while "offline"
    t += 800;
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
      setActivePill('offline');
    }, t);

    t += 2500;

    // ─── Phase 7: Finale ~2s, loop ──────────────────────
    sched(() => {
      setPhase('finale');
      setActivePill('none');
    }, t);

    t += 2000;
    sched(() => runCycle(), t);
  }, [clear, sched, typeText]);

  // ─── Start ─────────────────────────────────────────────

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      runCycle();
    }
    return () => clear();
  }, [runCycle, clear]);

  // ─── Derived State ─────────────────────────────────────

  const isOfflinePhase = phase === 'offline';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#FFF5F5] to-[#FFF0E5] px-8">
      {/* Refresh indicator - absolutely positioned */}
      <div className="relative mb-4" style={{ height: 28 }}>
        <AnimatePresence>
          {showRefresh && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 25,
              }}
              className="absolute left-1/2 top-0 flex -translate-x-1/2 items-center gap-2 text-sm text-gray-500"
            >
              <RefreshIcon spinning={refreshSpin} />
              <span>Refreshing...</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Cards container - fixed width for 2 cards */}
      <div className="flex gap-6" style={{ width: 760 }}>
        {/* Card 1 */}
        <div style={{ width: 360 }}>
          <TodoCard
            todos={leftTodos}
            borderColor={borderColor}
            showEmpty={showEmpty}
            emptyMessage="No todos yet"
            typingText={typingText}
            typingActive={typingActive}
            label={showSecondCard ? 'Device A' : undefined}
            codeState={codeState}
            confettiRef={confettiRef}
          />
        </div>

        {/* Card 2 - always present, fades in */}
        <motion.div
          style={{ width: 360 }}
          animate={{ opacity: showSecondCard ? 1 : 0 }}
          transition={{
            duration: 0.5,
            type: 'spring',
            stiffness: 200,
            damping: 25,
          }}
          className={showSecondCard ? '' : 'pointer-events-none'}
        >
          <TodoCard
            todos={rightTodos}
            borderColor={borderColor}
            showEmpty={false}
            typingText={rightTypingText}
            typingActive={rightTypingActive}
            label="Device B"
            codeState={
              codeState === 'collapsed-usequery' ||
              codeState === 'collapsing'
                ? 'collapsed-usequery'
                : 'collapsed-usestate'
            }
            overlay={
              isOfflinePhase ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-gray-900/70"
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
      <div className="relative mt-6" style={{ height: 40 }}>
        <AnimatePresence mode="wait">
          {activePill === 'lost' && (
            <motion.div
              key="lost"
              className="absolute left-1/2 top-0 -translate-x-1/2"
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
                label="Data lost on refresh"
                color="#ef4444"
              />
            </motion.div>
          )}

          {activePill === 'persist' && (
            <motion.div
              key="persist"
              className="absolute left-1/2 top-0 -translate-x-1/2"
            >
              <FeaturePill
                icon={<CheckIcon />}
                label="Data persists!"
                color="#22c55e"
              />
            </motion.div>
          )}

          {activePill === 'realtime' && (
            <motion.div
              key="realtime"
              className="absolute left-1/2 top-0 -translate-x-1/2"
            >
              <FeaturePill
                icon={<LightningIcon />}
                label="Real-time sync"
                color="#f97316"
              />
            </motion.div>
          )}

          {activePill === 'offline' && (
            <motion.div
              key="offline"
              className="absolute left-1/2 top-0 -translate-x-1/2"
            >
              <FeaturePill
                icon={<CloudIcon />}
                label="Offline support"
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

export default function TodoDemo4Page() {
  return <TodoDemo />;
}
