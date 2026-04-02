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

// ─── Constants ───────────────────────────────────────────────

const INITIAL_TODOS = ['Buy groceries', 'Walk the dog', 'Ship v2'];

const USE_STATE_CODE = 'const [todos, setTodos] = useState([])';
const USE_QUERY_CODE = 'const { data } = db.useQuery({ todos: {} })';

// ─── Syntax Highlighting ─────────────────────────────────────

const COLORS = {
  keyword: '#286983',
  fn: '#d7827e',
  variable: '#56949f',
  string: '#ea9d34',
  punctuation: '#797593',
  text: '#575279',
};

function highlightCode(text: string) {
  const tokens: { text: string; color: string }[] = [];
  let i = 0;

  const keywords = ['const'];
  const functions = ['useState', 'useQuery'];
  const variables = ['todos', 'setTodos', 'data', 'db'];

  while (i < text.length) {
    let matched = false;

    for (const kw of keywords) {
      if (text.startsWith(kw, i) && (i === 0 || /[\s([{,=]/.test(text[i - 1]))) {
        const after = text[i + kw.length];
        if (!after || /[\s([{,=.]/.test(after)) {
          tokens.push({ text: kw, color: COLORS.keyword });
          i += kw.length;
          matched = true;
          break;
        }
      }
    }
    if (matched) continue;

    for (const fn of functions) {
      if (text.startsWith(fn, i)) {
        const after = text[i + fn.length];
        if (!after || /[\s(]/.test(after)) {
          tokens.push({ text: fn, color: COLORS.fn });
          i += fn.length;
          matched = true;
          break;
        }
      }
    }
    if (matched) continue;

    for (const v of variables) {
      if (text.startsWith(v, i)) {
        const before = i === 0 ? ' ' : text[i - 1];
        const after = text[i + v.length];
        if (/[\s([{,=]/.test(before) && (!after || /[\s)\]},=.]/.test(after))) {
          tokens.push({ text: v, color: COLORS.variable });
          i += v.length;
          matched = true;
          break;
        }
      }
    }
    if (matched) continue;

    if (text.startsWith('todos:', i)) {
      tokens.push({ text: 'todos', color: COLORS.string });
      i += 5;
      continue;
    }

    const punct = /^[[\](){}.,;:=<>!&|?]/;
    if (punct.test(text[i])) {
      tokens.push({ text: text[i], color: COLORS.punctuation });
      i++;
      continue;
    }

    if (text[i] === ' ') {
      tokens.push({ text: ' ', color: COLORS.text });
      i++;
      continue;
    }

    let word = '';
    while (i < text.length && !/[\s[\](){}.,;:=<>!&|?]/.test(text[i])) {
      word += text[i];
      i++;
    }
    if (word) {
      tokens.push({ text: word, color: COLORS.text });
    }
  }

  return tokens;
}

function HighlightedCode({ text }: { text: string }) {
  const tokens = highlightCode(text);
  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} style={{ color: token.color }}>
          {token.text}
        </span>
      ))}
    </>
  );
}

// ─── Icons ───────────────────────────────────────────────────

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

// ─── Todo Card ───────────────────────────────────────────────

type TodoItem = { id: number; text: string };

function TodoCard({
  todos,
  borderColor,
  showEmpty,
  emptyMessage,
  typingText,
  typingActive,
  label,
  overlay,
  redTinge,
}: {
  todos: TodoItem[];
  borderColor: string;
  showEmpty: boolean;
  emptyMessage?: string;
  typingText: string;
  typingActive: boolean;
  label?: string;
  overlay?: React.ReactNode;
  redTinge?: boolean;
}) {
  return (
    <div
      className="relative rounded-2xl bg-white shadow-lg ring-1 ring-gray-100"
      style={{
        width: 350,
        height: 380,
        overflow: 'visible',
      }}
    >
      {/* Orange header bar */}
      <div
        className="flex items-center justify-between rounded-t-2xl px-5 py-3"
        style={{
          backgroundColor: borderColor,
          transition: 'background-color 0.6s ease',
        }}
      >
        <div className="flex items-center gap-2">
          {label && (
            <span className="text-xs font-medium uppercase tracking-wider text-white/70">
              {label}
            </span>
          )}
          <h2 className="text-base font-semibold text-white">My Todos</h2>
        </div>
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-white/30" />
          <div className="h-2.5 w-2.5 rounded-full bg-white/30" />
          <div className="h-2.5 w-2.5 rounded-full bg-white/30" />
        </div>
      </div>

      {/* Red tinge overlay */}
      <AnimatePresence>
        {redTinge && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(239,68,68,0.08) 0%, transparent 70%)',
            }}
          />
        )}
      </AnimatePresence>

      {/* Todo list area */}
      <div className="px-5 pt-4">
        <div className="min-h-[180px]">
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

// ─── Feature Indicator Pills ─────────────────────────────────

function FeaturePill({
  label,
  color,
  icon,
}: {
  label: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-md"
      style={{ backgroundColor: color }}
    >
      {icon}
      {label}
    </motion.div>
  );
}

// ─── Main Component ──────────────────────────────────────────

function TodoDemo() {
  // ─── Todo State ──────────────────────────────────────────
  const [leftTodos, setLeftTodos] = useState<TodoItem[]>([]);
  const [rightTodos, setRightTodos] = useState<TodoItem[]>([]);

  // ─── Code Badge State ────────────────────────────────────
  const [codeText, setCodeText] = useState(USE_STATE_CODE);
  const [showCursor, setShowCursor] = useState(false);

  // ─── UI State ────────────────────────────────────────────
  const [borderColor, setBorderColor] = useState('#f97316');
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
  const [redTinge, setRedTinge] = useState(false);

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

  const typeText_ = useCallback(
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

  // ─── Code Morph: delete chars then type new ──────────────
  const morphCode = useCallback(
    (from: string, to: string, startMs: number): number => {
      const deleteSpeed = 30;
      const typeSpeed = 30;

      sched(() => setShowCursor(true), startMs);

      // Delete from right to left
      for (let i = from.length; i >= 0; i--) {
        const partial = from.slice(0, i);
        sched(() => setCodeText(partial), startMs + (from.length - i) * deleteSpeed);
      }

      const deleteEnd = startMs + from.length * deleteSpeed;
      const pauseEnd = deleteEnd + 200;

      // Type new text left to right
      for (let i = 0; i <= to.length; i++) {
        const partial = to.slice(0, i);
        sched(() => setCodeText(partial), pauseEnd + i * typeSpeed);
      }

      const typeEnd = pauseEnd + to.length * typeSpeed;

      // Fade cursor away after a beat
      sched(() => setShowCursor(false), typeEnd + 300);

      return typeEnd + 300;
    },
    [sched],
  );

  // ─── Animation Cycle ─────────────────────────────────────
  const runCycle = useCallback(() => {
    clear();

    // Reset everything
    setLeftTodos([]);
    setRightTodos([]);
    setCodeText(USE_STATE_CODE);
    setShowCursor(false);
    setBorderColor('#f97316');
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
    setRedTinge(false);

    let t = 600;
    let nextId = 1;

    // ─── Phase 1: useState (add todos) ~5s ─────────────
    for (let i = 0; i < INITIAL_TODOS.length; i++) {
      const todoText = INITIAL_TODOS[i];
      const id = nextId++;
      const typeEnd = typeText_(todoText, setTypingText, setTypingActive, t);
      t = typeEnd + 200;
      sched(() => {
        setTypingText('');
        setLeftTodos((prev) => [...prev, { id, text: todoText }]);
      }, t);
      t += 400;
    }

    // ─── Phase 2: The Refresh ~2s ──────────────────────
    t += 400;
    sched(() => {
      setShowRefresh(true);
      setRefreshSpin(true);
    }, t);

    t += 800;
    sched(() => {
      setBorderColor('#ef4444');
      setRedTinge(true);
      setLeftTodos([]);
      setRefreshSpin(false);
    }, t);

    t += 400;
    sched(() => {
      setShowRefresh(false);
      setShowEmpty(true);
    }, t);

    t += 1200;

    // ─── Phase 3: The Transformation ~2.5s ─────────────
    sched(() => {
      setRedTinge(false);
    }, t);

    // Start the typing morph
    const morphEnd = morphCode(USE_STATE_CODE, USE_QUERY_CODE, t);

    // Midway through morph, shift border to orange
    sched(() => {
      setBorderColor('#f97316');
    }, t + 800);

    // At morph completion, go green + confetti
    sched(() => {
      setBorderColor('#22c55e');
      if (confettiRef.current) spawnConfetti(confettiRef.current);
    }, morphEnd);

    t = morphEnd + 500;

    // Second confetti burst
    sched(() => {
      if (confettiRef.current) spawnConfetti(confettiRef.current);
    }, t);

    t += 700;

    // ─── Phase 4: Persistence ~3s ──────────────────────
    sched(() => {
      setShowEmpty(false);
    }, t);

    t += 300;
    for (let i = 0; i < INITIAL_TODOS.length; i++) {
      const todoText = INITIAL_TODOS[i];
      const id = nextId++;
      const typeEnd = typeText_(todoText, setTypingText, setTypingActive, t);
      t = typeEnd + 200;
      sched(() => {
        setTypingText('');
        setLeftTodos((prev) => [...prev, { id, text: todoText }]);
      }, t);
      t += 400;
    }

    t += 300;
    sched(() => {
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
      setShowPersistBadge(true);
    }, t);

    t += 2200;

    // ─── Phase 5: Real-time ~3s ────────────────────────
    sched(() => {
      setShowPersistBadge(false);
      setShowSecondCard(true);
      setRightTodos(
        INITIAL_TODOS.map((text, i) => ({ id: 100 + i, text })),
      );
    }, t);

    t += 1200;
    const realtimeTodo = 'Call mom';
    const realtimeId = nextId++;
    const rtTypeEnd = typeText_(
      realtimeTodo,
      setTypingText,
      setTypingActive,
      t,
    );
    t = rtTypeEnd + 200;
    sched(() => {
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

    // ─── Phase 6: Offline ~3s ──────────────────────────
    sched(() => {
      setShowRealtimeBadge(false);
      setOfflineOverlay(true);
    }, t);

    t += 1000;
    const offlineTodo = 'Read book';
    const offlineId = nextId++;
    const offTypeEnd = typeText_(
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

    // ─── Phase 7: Finale ~2s, then loop ────────────────
    sched(() => {
      setShowOfflineBadge(false);
    }, t);

    t += 2000;
    sched(() => runCycle(), t);
  }, [clear, sched, typeText_, morphCode]);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      runCycle();
    }
    return () => clear();
  }, [runCycle, clear]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white px-8">
      {/* ─── Code Badge ───────────────────────────────────── */}
      <div className="relative mb-8">
        <div
          ref={confettiRef}
          className="relative flex items-center justify-center rounded-xl border px-6 py-3.5"
          style={{
            backgroundColor: '#faf8f5',
            borderColor: '#e8e5e0',
            overflow: 'visible',
            width: 520,
            minHeight: 48,
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            fontSize: '16px',
          }}
        >
          <span className="whitespace-pre">
            <HighlightedCode text={codeText} />
          </span>
          <AnimatePresence>
            {showCursor && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="ml-px inline-block animate-pulse"
                style={{
                  width: 2,
                  height: 20,
                  backgroundColor: '#9ca3af',
                  verticalAlign: 'middle',
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ─── Refresh Indicator ────────────────────────────── */}
      <AnimatePresence>
        {showRefresh && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 flex items-center gap-2 text-sm text-gray-500"
          >
            <RefreshIcon spinning={refreshSpin} />
            <span>Refreshing...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Cards Area ───────────────────────────────────── */}
      <div className="relative">
        <div className="flex gap-6" style={{ width: 740 }}>
          {/* Card 1 */}
          <div style={{ width: 350 }}>
            <TodoCard
              todos={leftTodos}
              borderColor={borderColor}
              showEmpty={showEmpty}
              emptyMessage="No todos yet"
              typingText={typingText}
              typingActive={typingActive}
              label={showSecondCard ? 'Device A' : undefined}
              redTinge={redTinge}
            />
          </div>

          {/* Card 2 (always present, fades in/out) */}
          <motion.div
            style={{ width: 350 }}
            animate={{ opacity: showSecondCard ? 1 : 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={showSecondCard ? '' : 'pointer-events-none'}
          >
            <TodoCard
              todos={rightTodos}
              borderColor={borderColor}
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

        {/* ─── Feature Indicator Pills ──────────────────── */}
        <div className="absolute -bottom-14 left-1/2 flex -translate-x-1/2 items-center justify-center">
          <AnimatePresence mode="wait">
            {showPersistBadge && (
              <FeaturePill
                key="persist"
                label="Persists!"
                color="#22c55e"
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
              />
            )}
            {showRealtimeBadge && (
              <FeaturePill
                key="realtime"
                label="Real-time"
                color="#f97316"
                icon={<LightningIcon />}
              />
            )}
            {showOfflineBadge && (
              <FeaturePill
                key="offline"
                label="Offline mode"
                color="#3b82f6"
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
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                }
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default function TodoDemo2Page() {
  return <TodoDemo />;
}
