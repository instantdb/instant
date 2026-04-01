'use client';

// V3: Retro green-on-black terminal. Diff lines appear one by one with a scan-line effect.
// Push triggers a fast "deploying" sequence, ends with a big ASCII-art checkmark.

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';

const c = {
  bg: '#0a0a0a',
  text: '#33ff33',
  dim: '#1a8c1a',
  yellow: '#cccc00',
  border: '#1a1a1a',
};

const COMMAND = 'npx instant-cli push schema';

const diffLines = [
  '+ CREATE NAMESPACE todos',
  '  + ATTR todos.id',
  '  + ATTR todos.text      (string)',
  '  + ATTR todos.done      (boolean)',
  '  + ATTR todos.createdAt (date)',
];

export default function CLIDemo3Page() {
  const [phase, setPhase] = useState<
    'idle' | 'typing' | 'found' | 'diff' | 'pushing' | 'done'
  >('idle');
  const [typingIndex, setTypingIndex] = useState(0);
  const [visibleDiffLines, setVisibleDiffLines] = useState(0);
  const [deployStep, setDeployStep] = useState(0);
  const hasStarted = useRef(false);

  const deployMessages = [
    'Connecting to Instant...',
    'Validating schema...',
    'Applying migrations...',
    'Updating indexes...',
    'Done!',
  ];

  const runCycle = useCallback(() => {
    setPhase('idle');
    setTypingIndex(0);
    setVisibleDiffLines(0);
    setDeployStep(0);

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
      if (visibleDiffLines < diffLines.length) {
        const timeout = setTimeout(
          () => setVisibleDiffLines((n) => n + 1),
          200,
        );
        return () => clearTimeout(timeout);
      }
      const timeout = setTimeout(() => setPhase('pushing'), 1000);
      return () => clearTimeout(timeout);
    }
    if (phase === 'pushing') {
      if (deployStep < deployMessages.length) {
        const timeout = setTimeout(
          () => setDeployStep((s) => s + 1),
          400,
        );
        return () => clearTimeout(timeout);
      }
      const timeout = setTimeout(() => setPhase('done'), 300);
      return () => clearTimeout(timeout);
    }
    if (phase === 'done') {
      const timeout = setTimeout(() => runCycle(), 3000);
      return () => clearTimeout(timeout);
    }
  }, [phase, visibleDiffLines, deployStep, runCycle]);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      runCycle();
    }
  }, [runCycle]);

  const showFound = !['idle', 'typing'].includes(phase);

  return (
    <div
      className="flex min-h-screen flex-col font-mono"
      style={{ backgroundColor: c.bg }}
    >
      <div
        className="flex items-center border-b px-6 py-3"
        style={{ borderColor: c.border }}
      >
        <span className="text-sm" style={{ color: c.dim }}>
          instant-cli v2.0.0
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-2xl space-y-3 text-lg">
          {/* Command */}
          <div>
            <span style={{ color: c.dim }}>$ </span>
            <span style={{ color: c.text }}>
              {phase === 'typing' ? (
                <>
                  {COMMAND.slice(0, typingIndex)}
                  <span
                    className="inline-block h-[1em] w-[0.6em] translate-y-[2px] animate-pulse"
                    style={{ backgroundColor: c.text }}
                  />
                </>
              ) : phase === 'idle' ? (
                <span
                  className="inline-block h-[1em] w-[0.6em] translate-y-[2px] animate-pulse"
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
              ▸ Found app: a1b2c3d4-e5f6
            </motion.div>
          )}

          {/* Diff lines appearing one by one */}
          {visibleDiffLines > 0 && (
            <div
              className="rounded border p-4"
              style={{ borderColor: `${c.dim}40` }}
            >
              {diffLines.slice(0, visibleDiffLines).map((line, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ color: c.text }}
                >
                  {line}
                </motion.div>
              ))}
            </div>
          )}

          {/* Deploy steps */}
          {phase === 'pushing' && (
            <div className="space-y-1">
              {deployMessages.slice(0, deployStep).map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    color:
                      i === deployStep - 1 ? c.yellow : c.dim,
                  }}
                >
                  {i < deployStep - 1 ? '✓' : '▸'} {msg}
                </motion.div>
              ))}
            </div>
          )}

          {/* Done */}
          {phase === 'done' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-1"
            >
              {deployMessages.map((msg, i) => (
                <div key={i} style={{ color: c.dim }}>
                  ✓ {msg}
                </div>
              ))}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="mt-4 text-center text-3xl font-bold"
                style={{ color: c.text }}
              >
                ████ SCHEMA PUSHED ████
              </motion.div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
