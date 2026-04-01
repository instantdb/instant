'use client';

// V1: Clean full-screen terminal. Auto-types command, shows diff, auto-pushes.
// Big "Schema updated!" with a green checkmark flash at the end.

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const c = {
  bg: '#1e1e2e',
  text: '#cdd6f4',
  dim: '#6c7086',
  green: '#a6e3a1',
  red: '#f38ba8',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  surface: '#313244',
  border: '#45475a',
};

const COMMAND = 'npx instant-cli push schema';

export default function CLIDemo1Page() {
  const [phase, setPhase] = useState<
    'idle' | 'typing' | 'found' | 'diff' | 'pushing' | 'done'
  >('idle');
  const [typingIndex, setTypingIndex] = useState(0);
  const [pushDots, setPushDots] = useState(0);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasStarted = useRef(false);

  const clear = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const sched = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeouts.current.push(t);
  }, []);

  const runCycle = useCallback(() => {
    clear();
    setPhase('idle');
    setTypingIndex(0);
    setPushDots(0);

    let t = 400;
    sched(() => setPhase('typing'), t);
  }, [clear, sched]);

  // Typing effect
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

  // Phase transitions
  useEffect(() => {
    if (phase === 'found') {
      const timeout = setTimeout(() => setPhase('diff'), 600);
      return () => clearTimeout(timeout);
    }
    if (phase === 'diff') {
      const timeout = setTimeout(() => setPhase('pushing'), 1500);
      return () => clearTimeout(timeout);
    }
    if (phase === 'pushing') {
      if (pushDots < 3) {
        const timeout = setTimeout(() => setPushDots((d) => d + 1), 500);
        return () => clearTimeout(timeout);
      }
      const timeout = setTimeout(() => setPhase('done'), 400);
      return () => clearTimeout(timeout);
    }
    if (phase === 'done') {
      const timeout = setTimeout(() => runCycle(), 3000);
      return () => clearTimeout(timeout);
    }
  }, [phase, pushDots, runCycle]);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      runCycle();
    }
    return () => clear();
  }, [runCycle, clear]);

  const showFound = !['idle', 'typing'].includes(phase);
  const showDiff = !['idle', 'typing', 'found'].includes(phase);

  return (
    <div
      className="flex min-h-screen flex-col font-mono"
      style={{ backgroundColor: c.bg }}
    >
      {/* Title bar */}
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
          Terminal
        </span>
        <div className="w-[52px]" />
      </div>

      {/* Terminal body */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-2xl space-y-4 text-lg">
          {/* Command */}
          <div className="flex items-center gap-3">
            <span style={{ color: c.green }}>$</span>
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

          {/* Found */}
          {showFound && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ color: c.dim }}
            >
              Found{' '}
              <span
                className="rounded px-1"
                style={{ backgroundColor: c.surface, color: c.blue }}
              >
                NEXT_PUBLIC_INSTANT_APP_ID
              </span>{' '}
              <span style={{ color: c.dim }}>: a1b2c3d4-e5f6</span>
            </motion.div>
          )}

          {/* Diff */}
          {showDiff && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-lg border p-5"
              style={{ borderColor: c.border, backgroundColor: c.surface }}
            >
              <div className="mb-3 text-base font-bold" style={{ color: c.dim }}>
                Schema changes:
              </div>
              <div className="space-y-1">
                <div style={{ color: c.green }}>
                  + CREATE NAMESPACE{' '}
                  <span style={{ color: c.text }}>todos</span>
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
                <div className="pl-4" style={{ color: c.green }}>
                  + ATTR todos.createdAt{' '}
                  <span style={{ color: c.dim }}>(date)</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Pushing */}
          {phase === 'pushing' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-lg"
              style={{ color: c.yellow }}
            >
              Pushing{'.'.repeat(pushDots)}
            </motion.div>
          )}

          {/* Done */}
          {phase === 'done' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <div
                className="text-2xl font-bold"
                style={{ color: c.green }}
              >
                ✓ Schema updated!
              </div>
              <div className="mt-1" style={{ color: c.dim }}>
                5 attributes pushed in 0.8s
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
