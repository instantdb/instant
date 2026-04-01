'use client';

// V2: Dark terminal with a highlighted "Push" button that auto-clicks with a ripple effect.
// Progress bar animates during push, celebratory sparkle burst on success.

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const c = {
  bg: '#0d1117',
  text: '#e6edf3',
  dim: '#7d8590',
  green: '#3fb950',
  red: '#f85149',
  yellow: '#d29922',
  blue: '#58a6ff',
  purple: '#bc8cff',
  surface: '#161b22',
  border: '#30363d',
};

const COMMAND = 'npx instant-cli push schema';

function spawnSparkles(container: HTMLDivElement) {
  const sparks = ['✨', '⚡', '🚀', '✓', '💫'];
  const count = 8;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.innerText = sparks[Math.floor(Math.random() * sparks.length)];
    container.appendChild(el);

    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const dist = 80 + Math.random() * 80;
    const xDrift = Math.cos(angle) * dist;
    const yDrift = Math.sin(angle) * dist;
    const delay = i * 50;
    const duration = 1000 + Math.random() * 300;
    const rotation = (Math.random() - 0.5) * 50;

    Object.assign(el.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      fontSize: '24px',
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

export default function CLIDemo2Page() {
  const [phase, setPhase] = useState<
    'idle' | 'typing' | 'found' | 'diff' | 'pushing' | 'done'
  >('idle');
  const [typingIndex, setTypingIndex] = useState(0);
  const [pushProgress, setPushProgress] = useState(0);
  const [buttonClicked, setButtonClicked] = useState(false);
  const sparkleRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);

  const clear = useCallback(() => {}, []);

  const runCycle = useCallback(() => {
    setPhase('idle');
    setTypingIndex(0);
    setPushProgress(0);
    setButtonClicked(false);

    setTimeout(() => setPhase('typing'), 400);
  }, []);

  useEffect(() => {
    if (phase !== 'typing') return;
    if (typingIndex < COMMAND.length) {
      const timeout = setTimeout(
        () => setTypingIndex((i) => i + 1),
        30 + Math.random() * 40,
      );
      return () => clearTimeout(timeout);
    }
    const timeout = setTimeout(() => setPhase('found'), 400);
    return () => clearTimeout(timeout);
  }, [phase, typingIndex]);

  useEffect(() => {
    if (phase === 'found') {
      const timeout = setTimeout(() => setPhase('diff'), 600);
      return () => clearTimeout(timeout);
    }
    if (phase === 'diff') {
      // Auto-click the push button after a beat
      const timeout = setTimeout(() => {
        setButtonClicked(true);
        setTimeout(() => setPhase('pushing'), 300);
      }, 1200);
      return () => clearTimeout(timeout);
    }
    if (phase === 'pushing') {
      if (pushProgress < 100) {
        const timeout = setTimeout(
          () => setPushProgress((p) => Math.min(p + 5, 100)),
          60,
        );
        return () => clearTimeout(timeout);
      }
      const timeout = setTimeout(() => {
        setPhase('done');
        if (sparkleRef.current) spawnSparkles(sparkleRef.current);
      }, 300);
      return () => clearTimeout(timeout);
    }
    if (phase === 'done') {
      const timeout = setTimeout(() => runCycle(), 3000);
      return () => clearTimeout(timeout);
    }
  }, [phase, pushProgress, runCycle]);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      runCycle();
    }
  }, [runCycle]);

  const showFound = !['idle', 'typing'].includes(phase);
  const showDiff = !['idle', 'typing', 'found'].includes(phase);

  return (
    <div
      className="flex min-h-screen flex-col font-mono"
      style={{ backgroundColor: c.bg }}
    >
      <div
        className="flex items-center gap-3 border-b px-6 py-3"
        style={{ borderColor: c.border }}
      >
        <div className="flex gap-2">
          <div className="h-3 w-3 rounded-full bg-red-500/80" />
          <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <div className="h-3 w-3 rounded-full bg-green-500/80" />
        </div>
        <span className="flex-1 text-center text-sm" style={{ color: c.dim }}>
          zsh
        </span>
        <div className="w-[52px]" />
      </div>

      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-2xl space-y-4 text-lg">
          {/* Command */}
          <div className="flex items-center gap-3">
            <span style={{ color: c.green }}>~</span>
            <span style={{ color: c.dim }}>$</span>
            <span style={{ color: c.text }}>
              {phase === 'typing' ? (
                <>
                  {COMMAND.slice(0, typingIndex)}
                  <span
                    className="inline-block h-[1em] w-[0.5em] translate-y-[2px] animate-pulse"
                    style={{ backgroundColor: c.text }}
                  />
                </>
              ) : phase === 'idle' ? (
                <span
                  className="inline-block h-[1em] w-[0.5em] translate-y-[2px] animate-pulse"
                  style={{ backgroundColor: c.text }}
                />
              ) : (
                COMMAND
              )}
            </span>
          </div>

          {showFound && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ color: c.dim }}
            >
              Found{' '}
              <span style={{ color: c.blue }}>NEXT_PUBLIC_INSTANT_APP_ID</span>
            </motion.div>
          )}

          {showDiff && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border p-5"
              style={{ borderColor: c.border, backgroundColor: c.surface }}
            >
              <div className="space-y-1">
                <div style={{ color: c.green }}>
                  + CREATE NAMESPACE{' '}
                  <span className="font-bold" style={{ color: c.text }}>
                    todos
                  </span>
                </div>
                <div className="pl-4" style={{ color: c.green }}>
                  + ATTR todos.id
                </div>
                <div className="pl-4" style={{ color: c.green }}>
                  + ATTR todos.text{' '}
                  <span style={{ color: c.dim }}>(string)</span>
                </div>
                <div className="pl-4" style={{ color: c.green }}>
                  + ATTR todos.done{' '}
                  <span style={{ color: c.dim }}>(boolean)</span>
                </div>
              </div>

              {phase === 'diff' && (
                <div className="mt-4 flex gap-4">
                  <motion.div
                    className="rounded px-5 py-1.5 text-base font-bold text-black"
                    style={{ backgroundColor: c.green }}
                    animate={
                      buttonClicked
                        ? { scale: [1, 0.9, 1] }
                        : { scale: [1, 1.05, 1] }
                    }
                    transition={
                      buttonClicked
                        ? { duration: 0.2 }
                        : { duration: 1.5, repeat: Infinity }
                    }
                  >
                    Push
                  </motion.div>
                  <div
                    className="rounded border px-5 py-1.5 text-base"
                    style={{ borderColor: c.border, color: c.dim }}
                  >
                    Cancel
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Pushing progress */}
          {phase === 'pushing' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-2"
            >
              <div style={{ color: c.yellow }}>
                Pushing schema...
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: c.border }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    width: `${pushProgress}%`,
                    backgroundColor: c.green,
                  }}
                />
              </div>
            </motion.div>
          )}

          {/* Done */}
          {phase === 'done' && (
            <div className="relative" style={{ overflow: 'visible' }}>
              <div ref={sparkleRef} style={{ overflow: 'visible' }}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  className="text-2xl font-bold"
                  style={{ color: c.green }}
                >
                  ✓ Schema updated!
                </motion.div>
              </div>
              <div className="mt-1" style={{ color: c.dim }}>
                4 attributes created in 1.2s
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
