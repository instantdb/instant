'use client';

// V5: Dark terminal, minimal. Diff lines type out one at a time (like a real terminal printing).
// Push auto-fires. Each attr gets a green checkmark ticked off one by one during push.
// Ends with a bold "All done" and the prompt returns.

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';

const c = {
  bg: '#1a1b26',
  text: '#a9b1d6',
  dim: '#565f89',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  red: '#f7768e',
  surface: '#24283b',
  border: '#3b4261',
};

const COMMAND = 'npx instant-cli push schema';

const attrs = [
  { name: 'todos.id', type: '' },
  { name: 'todos.text', type: 'string' },
  { name: 'todos.done', type: 'boolean' },
  { name: 'todos.createdAt', type: 'date' },
];

export default function CLIDemo5Page() {
  const [phase, setPhase] = useState<
    'idle' | 'typing' | 'found' | 'diff' | 'push-ticking' | 'done'
  >('idle');
  const [typingIndex, setTypingIndex] = useState(0);
  const [visibleAttrs, setVisibleAttrs] = useState(0);
  const [tickedAttrs, setTickedAttrs] = useState(0);
  const hasStarted = useRef(false);

  const runCycle = useCallback(() => {
    setPhase('idle');
    setTypingIndex(0);
    setVisibleAttrs(0);
    setTickedAttrs(0);

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
      const timeout = setTimeout(() => setPhase('diff'), 500);
      return () => clearTimeout(timeout);
    }
    if (phase === 'diff') {
      if (visibleAttrs < attrs.length) {
        const timeout = setTimeout(
          () => setVisibleAttrs((n) => n + 1),
          250,
        );
        return () => clearTimeout(timeout);
      }
      const timeout = setTimeout(() => setPhase('push-ticking'), 800);
      return () => clearTimeout(timeout);
    }
    if (phase === 'push-ticking') {
      if (tickedAttrs < attrs.length) {
        const timeout = setTimeout(
          () => setTickedAttrs((n) => n + 1),
          350,
        );
        return () => clearTimeout(timeout);
      }
      const timeout = setTimeout(() => setPhase('done'), 500);
      return () => clearTimeout(timeout);
    }
    if (phase === 'done') {
      const timeout = setTimeout(() => runCycle(), 3000);
      return () => clearTimeout(timeout);
    }
  }, [phase, visibleAttrs, tickedAttrs, runCycle]);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      runCycle();
    }
  }, [runCycle]);

  const showFound = !['idle', 'typing'].includes(phase);
  const showAttrs = visibleAttrs > 0;
  const isPushing = phase === 'push-ticking' || phase === 'done';

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
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: c.red }} />
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: c.yellow }} />
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: c.green }} />
        </div>
        <span className="flex-1 text-center text-sm" style={{ color: c.dim }}>
          bash
        </span>
        <div className="w-[52px]" />
      </div>

      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-2xl space-y-3 text-lg">
          {/* Command */}
          <div>
            <span style={{ color: c.blue }}>→ </span>
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
              ● Connected to{' '}
              <span style={{ color: c.blue }}>my-app</span>
            </motion.div>
          )}

          {/* Namespace header */}
          {showAttrs && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-bold"
              style={{ color: c.green }}
            >
              + CREATE NAMESPACE{' '}
              <span style={{ color: c.text }}>todos</span>
            </motion.div>
          )}

          {/* Attrs with tick-off animation */}
          {showAttrs && (
            <div className="space-y-1 pl-2">
              {attrs.slice(0, visibleAttrs).map((attr, i) => {
                const isTicked = isPushing && i < tickedAttrs;
                const isTicking =
                  phase === 'push-ticking' && i === tickedAttrs - 1;
                return (
                  <motion.div
                    key={attr.name}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3"
                  >
                    {isPushing ? (
                      <motion.span
                        initial={isTicking ? { scale: 0 } : false}
                        animate={{ scale: 1 }}
                        transition={{
                          type: 'spring',
                          stiffness: 500,
                          damping: 15,
                        }}
                        style={{
                          color: isTicked ? c.green : c.dim,
                        }}
                      >
                        {isTicked ? '✓' : '○'}
                      </motion.span>
                    ) : (
                      <span style={{ color: c.green }}>+</span>
                    )}
                    <span
                      style={{
                        color: isTicked ? c.dim : c.text,
                        textDecoration: isTicked ? 'none' : 'none',
                      }}
                    >
                      {attr.name}
                    </span>
                    {attr.type && (
                      <span style={{ color: c.dim }}>{attr.type}</span>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Done */}
          {phase === 'done' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-4 space-y-2"
            >
              <div className="text-2xl font-bold" style={{ color: c.green }}>
                All done!
              </div>
              <div style={{ color: c.dim }}>
                <span style={{ color: c.blue }}>→ </span>
                <span
                  className="inline-block h-[1em] w-[0.5em] translate-y-[2px] animate-pulse"
                  style={{ backgroundColor: c.text }}
                />
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
