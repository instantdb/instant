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
    <span style={{ fontFamily: 'monospace', fontSize: '20px' }}>
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
    <span style={{ fontFamily: 'monospace', fontSize: '20px' }}>
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

// ─── Scene Definitions ──────────────────────────────────────────────────────

const SCENES = [
  {
    id: 'usestate',
    label: '1: useState',
    script:
      "This app just uses a useState hook. So if you add a message and you refresh, all that data will be gone. Without a backend, your data won't be saved anywhere.",
  },
  {
    id: 'transform',
    label: '2: Instant',
    script:
      "Let's go ahead and add it. With Instant, you can just replace useState with useQuery and transact. Just with this, the app gets persistence. Refresh the page, and the data lives on.",
  },
  {
    id: 'realtime',
    label: '3: Real-time',
    script: "It's also real-time. New todos show up instantly across clients.",
  },
  {
    id: 'offline',
    label: '4: Offline',
    script:
      "And it works offline. You can turn off the internet, still keep using the app, and everything will sync back once you're online.",
  },
] as const;

type SceneId = (typeof SCENES)[number]['id'];

// ─── Browser Chrome ─────────────────────────────────────────────────────────

function BrowserChrome({
  children,
  avatar,
  overlay,
}: {
  children: React.ReactNode;
  avatar: { src: string; alt: string };
  overlay?: React.ReactNode;
}) {
  return (
    <div className="relative flex h-[440px] w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Browser title bar */}
      <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <div className="flex-1" />
        <img
          src={avatar.src}
          alt={avatar.alt}
          className="h-6 w-6 rounded-full object-cover ring-2 ring-white"
        />
      </div>

      {/* App content */}
      <div className="flex flex-1 flex-col">{children}</div>

      {/* Overlay (for offline) */}
      <AnimatePresence>{overlay}</AnimatePresence>
    </div>
  );
}

// ─── Todo App Content ───────────────────────────────────────────────────────

function TodoAppContent({
  todos,
  typingText,
  typingActive,
  showEmpty,
  emptyMessage,
  showRefresh,
  refreshSpin,
}: {
  todos: TodoItem[];
  typingText: string;
  typingActive: boolean;
  showEmpty: boolean;
  emptyMessage?: string;
  showRefresh: boolean;
  refreshSpin: boolean;
}) {
  return (
    <>
      {/* Refresh indicator */}
      <div className="flex items-center justify-end px-5 py-2">
        <div className="h-6">
          <AnimatePresence>
            {showRefresh && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-sm text-gray-400"
              >
                <RefreshIcon spinning={refreshSpin} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Todo list */}
      <div className="flex-1 overflow-hidden px-5">
        <AnimatePresence mode="popLayout">
          {todos.map((todo) => (
            <motion.div
              key={todo.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="flex items-center gap-3 border-b border-gray-50 py-3"
            >
              <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border-2 border-orange-300" />
              <span className="text-base text-gray-700">{todo.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        {showEmpty && todos.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-center py-20 text-gray-300"
          >
            <svg
              className="mb-3 h-12 w-12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
            </svg>
            <span className="text-base">{emptyMessage || 'No todos yet'}</span>
          </motion.div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg bg-gray-50 px-3 py-2.5">
            <span className="text-base">
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
          <button className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white">
            Add
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Todos Data ─────────────────────────────────────────────────────────────

const INITIAL_TODOS = ['Buy groceries', 'Walk the dog', 'Ship v2'];

// ─── Main Demo Component ────────────────────────────────────────────────────

export default function TodoDemo1Page() {
  const [scene, setScene] = useState<SceneId>('usestate');

  // Todo state
  const [leftTodos, setLeftTodos] = useState<TodoItem[]>([]);
  const [rightTodos, setRightTodos] = useState<TodoItem[]>([]);

  // UI state
  const [codeBadge, setCodeBadge] = useState<'usestate' | 'usequery'>(
    'usestate',
  );
  const [showRefresh, setShowRefresh] = useState(false);
  const [refreshSpin, setRefreshSpin] = useState(false);
  const [showSecondCard, setShowSecondCard] = useState(false);
  const [offlineOverlay, setOfflineOverlay] = useState(false);
  const [typingText, setTypingText] = useState('');
  const [typingActive, setTypingActive] = useState(false);
  const [rightTypingText, setRightTypingText] = useState('');
  const [rightTypingActive, setRightTypingActive] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const confettiRef = useRef<HTMLDivElement>(null);

  const clear = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const sched = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeouts.current.push(t);
  };

  const typeTextAnim = (
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

  // ─── Reset All State ───────────────────────────────────────────────────────

  const resetState = useCallback(() => {
    clear();
    setLeftTodos([]);
    setRightTodos([]);
    setCodeBadge('usestate');

    setShowRefresh(false);
    setRefreshSpin(false);
    setShowSecondCard(false);
    setOfflineOverlay(false);
    setTypingText('');
    setTypingActive(false);
    setRightTypingText('');
    setRightTypingActive(false);
    setShowEmpty(false);
  }, [clear]);

  // ─── Scene Runners ────────────────────────────────────────────────────────

  const runUseState = useCallback(() => {
    resetState();
    setCodeBadge('usestate');

    let t = 400;
    let nextId = 1;

    for (let i = 0; i < INITIAL_TODOS.length; i++) {
      const todoText = INITIAL_TODOS[i];
      const id = nextId++;
      const typeEnd = typeTextAnim(todoText, setTypingText, setTypingActive, t);
      t = typeEnd + 200;
      sched(() => {
        setTypingText('');
        setLeftTodos((prev) => [...prev, { id, text: todoText }]);
      }, t);
      t += 400;
    }

    t += 400;
    sched(() => {
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
      setShowEmpty(true);
    }, t);
  }, [resetState]);

  const runTransform = useCallback(() => {
    resetState();
    setCodeBadge('usestate');
    setShowEmpty(true);

    let t = 400;

    // Code crossfade
    sched(() => {
      setCodeBadge('usequery');
    }, t);

    t += 600;
    sched(() => {
      setShowEmpty(false);
      if (confettiRef.current) spawnConfetti(confettiRef.current);
    }, t);

    t += 800;
    sched(() => {
      if (confettiRef.current) spawnConfetti(confettiRef.current);
    }, t);

    // Now add the todos
    t += 600;
    let nextId = 10;
    for (let i = 0; i < INITIAL_TODOS.length; i++) {
      const todoText = INITIAL_TODOS[i];
      const id = nextId++;
      const typeEnd = typeTextAnim(todoText, setTypingText, setTypingActive, t);
      t = typeEnd + 200;
      sched(() => {
        setTypingText('');
        setLeftTodos((prev) => [...prev, { id, text: todoText }]);
      }, t);
      t += 400;
    }

    // Refresh: todos stay
    t += 300;
    sched(() => {
      setShowRefresh(true);
      setRefreshSpin(true);
    }, t);

    t += 800;
    sched(() => setRefreshSpin(false), t);

    t += 400;
    sched(() => {
      setShowRefresh(false);
    }, t);
  }, [resetState]);

  const runRealtime = useCallback(() => {
    clear();
    // Don't clear todos - set them directly to avoid enter animations
    setCodeBadge('usequery');
    setShowRefresh(false);
    setRefreshSpin(false);
    setOfflineOverlay(false);
    setTypingText('');
    setTypingActive(false);
    setRightTypingText('');
    setRightTypingActive(false);
    setShowEmpty(false);
    setLeftTodos(INITIAL_TODOS.map((text, i) => ({ id: 10 + i, text })));
    setShowSecondCard(true);
    setRightTodos(INITIAL_TODOS.map((text, i) => ({ id: 100 + i, text })));

    let t = 800;

    t += 1000;
    const realtimeTodo = 'Call mom';
    const rtTypeEnd = typeTextAnim(
      realtimeTodo,
      setTypingText,
      setTypingActive,
      t,
    );
    t = rtTypeEnd + 200;
    sched(() => {
      setTypingText('');
      setLeftTodos((prev) => [...prev, { id: 50, text: realtimeTodo }]);
    }, t);

    t += 300;
    sched(() => {
      setRightTodos((prev) => [...prev, { id: 150, text: realtimeTodo }]);
    }, t);
  }, [clear]);

  const runOffline = useCallback(() => {
    clear();
    setCodeBadge('usequery');
    setShowRefresh(false);
    setRefreshSpin(false);
    setTypingText('');
    setTypingActive(false);
    setRightTypingText('');
    setRightTypingActive(false);
    setShowEmpty(false);
    // Use same ids as runRealtime so "Call mom" doesn't re-animate
    const baseTodos = INITIAL_TODOS.map((text, i) => ({ id: 10 + i, text }));
    setLeftTodos([...baseTodos, { id: 50, text: 'Call mom' }]);
    setShowSecondCard(true);
    setRightTodos([
      ...INITIAL_TODOS.map((text, i) => ({ id: 100 + i, text })),
      { id: 150, text: 'Call mom' },
    ]);

    let t = 400;

    sched(() => setOfflineOverlay(true), t);

    t += 800;
    const offlineTodo = 'Read book';
    const offTypeEnd = typeTextAnim(
      offlineTodo,
      setRightTypingText,
      setRightTypingActive,
      t,
    );
    t = offTypeEnd + 200;
    sched(() => {
      setRightTypingText('');
      setRightTodos((prev) => [...prev, { id: 200, text: offlineTodo }]);
    }, t);

    t += 800;
    sched(() => setOfflineOverlay(false), t);

    t += 500;
    sched(() => {
      setLeftTodos((prev) => [...prev, { id: 60, text: offlineTodo }]);
    }, t);
  }, [clear]);

  // ─── Scene Navigation ─────────────────────────────────────────────────────

  const sceneIndex = SCENES.findIndex((s) => s.id === scene);

  const goToScene = useCallback((id: SceneId) => {
    setScene(id);
  }, []);

  const goNext = useCallback(() => {
    const idx = SCENES.findIndex((s) => s.id === scene);
    if (idx < SCENES.length - 1) {
      goToScene(SCENES[idx + 1].id);
    }
  }, [scene, goToScene]);

  const goPrev = useCallback(() => {
    const idx = SCENES.findIndex((s) => s.id === scene);
    if (idx > 0) {
      goToScene(SCENES[idx - 1].id);
    }
  }, [scene, goToScene]);

  // Run the appropriate animation when scene changes
  useEffect(() => {
    switch (scene) {
      case 'usestate':
        runUseState();
        break;
      case 'transform':
        runTransform();
        break;
      case 'realtime':
        runRealtime();
        break;
      case 'offline':
        runOffline();
        break;
    }
    return () => clear();
  }, [scene, runUseState, runTransform, runRealtime, runOffline, clear]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goNext();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      }
      // Number keys 1-5
      const num = parseInt(e.key);
      if (num >= 1 && num <= SCENES.length) {
        e.preventDefault();
        goToScene(SCENES[num - 1].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, goToScene]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const currentScene = SCENES[sceneIndex];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Script instructions: full width, fixed height to prevent layout shift */}
      <div
        className="flex items-center justify-center px-8 pt-4 pb-2"
        style={{ minHeight: 40 }}
      >
        <p className="w-full text-center text-sm leading-relaxed text-gray-400">
          {currentScene.script}
        </p>
      </div>

      {/* Scene navigation buttons */}
      <div className="flex items-center justify-center gap-1.5 px-8 pb-4">
        {SCENES.map((s, i) => (
          <button
            key={s.id}
            onClick={() => goToScene(s.id)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              scene === s.id
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {i + 1}
          </button>
        ))}
        <span className="ml-2 text-[10px] text-gray-300">
          arrows / number keys
        </span>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 flex-col items-center justify-center pb-16">
        {/* Code badge */}
        <div className="relative mb-8">
          <motion.div
            ref={confettiRef}
            className="relative rounded-xl border border-gray-200 px-10 py-4 whitespace-nowrap"
            style={{
              backgroundColor: '#faf8f5',
              overflow: 'visible',
            }}
          >
            {/* Both rendered, stacked. Only one visible at a time via opacity. */}
            <div className="relative">
              {/* Longer version sizes the container */}
              <span className="invisible">
                <UseQueryCode />
              </span>
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                animate={{
                  opacity: codeBadge === 'usestate' ? 1 : 0,
                  filter: codeBadge === 'usestate' ? 'blur(0px)' : 'blur(6px)',
                }}
                transition={{ duration: 1.0 }}
              >
                <UseStateCode />
              </motion.div>
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                animate={{
                  opacity: codeBadge === 'usequery' ? 1 : 0,
                  filter: codeBadge === 'usequery' ? 'blur(0px)' : 'blur(6px)',
                }}
                transition={{ duration: 1.0 }}
              >
                <UseQueryCode />
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Cards */}
        <div
          className="relative flex items-start justify-center"
          style={{ width: 780, height: 440 }}
        >
          {/* First card: centered when alone, slides left when second appears */}
          <motion.div
            style={{ width: 370, position: 'absolute', top: 0 }}
            animate={{
              x: showSecondCard ? -194 : 0,
            }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 25,
            }}
          >
            <BrowserChrome
              avatar={{ src: '/img/landing/stopa.jpg', alt: 'Stopa' }}
            >
              <TodoAppContent
                todos={leftTodos}
                typingText={typingText}
                typingActive={typingActive}
                showEmpty={showEmpty}
                emptyMessage="No todos yet"
                showRefresh={showRefresh}
                refreshSpin={refreshSpin}
              />
            </BrowserChrome>
          </motion.div>
          {/* Second card: fades in to the right */}
          <motion.div
            style={{ width: 370, position: 'absolute', top: 0 }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
              x: 194,
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
            <BrowserChrome
              avatar={{ src: '/img/landing/joe.jpg', alt: 'Joe' }}
              overlay={
                offlineOverlay ? (
                  <motion.div
                    key="offline-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.0 }}
                    className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-gray-900/50 backdrop-blur-sm"
                  >
                    <WifiOffIcon />
                    <span className="mt-2 text-sm font-medium text-white/90">
                      Offline
                    </span>
                  </motion.div>
                ) : undefined
              }
            >
              <TodoAppContent
                todos={rightTodos}
                typingText={rightTypingText}
                typingActive={rightTypingActive}
                showEmpty={false}
                showRefresh={false}
                refreshSpin={false}
              />
            </BrowserChrome>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
