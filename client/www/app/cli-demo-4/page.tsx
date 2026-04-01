'use client';

// V4: Rose Pine Dawn theme (light terminal, matching the site).
// Diff box has colored badges. Push button gets a satisfying scale-bounce on auto-click.
// Success shows a big checkmark circle that scales in.

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';

const c = {
  bg: '#faf8f5',
  text: '#575279',
  dim: '#9893a5',
  green: '#286983',
  greenBg: '#28698320',
  orange: '#ea9d34',
  surface: '#f2ede9',
  border: '#dfdad9',
};

const COMMAND = 'npx instant-cli push schema';

export default function CLIDemo4Page() {
  const [phase, setPhase] = useState<
    'idle' | 'typing' | 'found' | 'diff' | 'pushing' | 'done'
  >('idle');
  const [typingIndex, setTypingIndex] = useState(0);
  const [pushDots, setPushDots] = useState(0);
  const [buttonClicked, setButtonClicked] = useState(false);
  const hasStarted = useRef(false);

  const runCycle = useCallback(() => {
    setPhase('idle');
    setTypingIndex(0);
    setPushDots(0);
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
      const timeout = setTimeout(() => {
        setButtonClicked(true);
        setTimeout(() => setPhase('pushing'), 400);
      }, 1500);
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
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: '#d7827e' }} />
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: '#ea9d34' }} />
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: '#56949f' }} />
        </div>
        <span className="flex-1 text-center text-sm" style={{ color: c.dim }}>
          Terminal
        </span>
        <div className="w-[52px]" />
      </div>

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

          {showFound && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ color: c.dim }}
            >
              Found{' '}
              <span
                className="rounded px-1.5 py-0.5"
                style={{ backgroundColor: c.greenBg, color: c.green }}
              >
                NEXT_PUBLIC_INSTANT_APP_ID
              </span>
            </motion.div>
          )}

          {showDiff && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border p-5"
              style={{ borderColor: c.border, backgroundColor: c.surface }}
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded px-2 py-0.5 text-sm font-bold text-white"
                    style={{ backgroundColor: c.green }}
                  >
                    + NEW
                  </span>
                  <span className="font-bold" style={{ color: c.text }}>
                    todos
                  </span>
                </div>
                <div className="space-y-1 pl-4">
                  {['id', 'text (string)', 'done (boolean)', 'createdAt (date)'].map(
                    (attr) => (
                      <div key={attr} style={{ color: c.green }}>
                        + {attr}
                      </div>
                    ),
                  )}
                </div>
              </div>

              {phase === 'diff' && (
                <div className="mt-5 flex gap-3">
                  <motion.div
                    className="rounded-lg px-6 py-2 text-base font-bold text-white"
                    style={{ backgroundColor: c.orange }}
                    animate={
                      buttonClicked
                        ? { scale: [1, 0.85, 1.1, 1] }
                        : {}
                    }
                    transition={{ duration: 0.3 }}
                  >
                    Push
                  </motion.div>
                  <div
                    className="rounded-lg border px-6 py-2 text-base"
                    style={{ borderColor: c.border, color: c.dim }}
                  >
                    Cancel
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {phase === 'pushing' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ color: c.orange }}
            >
              Pushing schema{'.'.repeat(pushDots)}
            </motion.div>
          )}

          {phase === 'done' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-4"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                className="flex h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: c.greenBg }}
              >
                <svg
                  className="h-8 w-8"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke={c.green}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
              </motion.div>
              <div>
                <div
                  className="text-2xl font-bold"
                  style={{ color: c.green }}
                >
                  Schema updated!
                </div>
                <div style={{ color: c.dim }}>
                  4 attributes pushed
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
