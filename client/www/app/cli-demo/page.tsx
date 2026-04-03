'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';

const c = {
  bg: '#faf8f5',
  text: '#575279',
  dim: '#797593',
  keyword: '#286983',
  string: '#ea9d34',
  border: '#dfdad9',
};

const COMMAND = 'npx instant-cli push schema';

function spawnConfetti(container: HTMLDivElement) {
  const count = 18;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const isLogo = i % 3 === 0;

    if (isLogo) {
      const img = document.createElement('img');
      img.src = '/img/icon/favicon-96x96.svg';
      img.style.width = '32px';
      img.style.height = '32px';
      el.appendChild(img);
    } else {
      const items = ['✨', '⚡', '💫', '🎉', '✓', '🚀'];
      el.innerText = items[Math.floor(Math.random() * items.length)];
    }

    container.appendChild(el);

    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const dist = 140 + Math.random() * 160;
    const xDrift = Math.cos(angle) * dist;
    const yDrift = Math.sin(angle) * dist;
    const delay = i * 40;
    const duration = 1200 + Math.random() * 500;
    const rotation = (Math.random() - 0.5) * 80;
    const scale = 0.8 + Math.random() * 0.6;

    Object.assign(el.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      fontSize: isLogo ? '0' : '28px',
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
          transform: `translate(calc(-50% + ${xDrift}px), calc(-50% + ${yDrift}px)) scale(${scale}) rotate(${rotation}deg)`,
          opacity: '0',
        });
      });
    });

    setTimeout(() => el.remove(), duration + delay + 50);
  }
}

export default function CLIDemoPage() {
  const [phase, setPhase] = useState<
    'idle' | 'typing' | 'found' | 'diff' | 'result'
  >('idle');
  const [typingIndex, setTypingIndex] = useState(0);
  const confettiRef = useRef<HTMLDivElement>(null);

  const runCycle = useCallback(() => {
    setPhase('idle');
    setTypingIndex(0);
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
      const timeout = setTimeout(() => setPhase('result'), 2000);
      return () => clearTimeout(timeout);
    }
    if (phase === 'result') {
      if (confettiRef.current) spawnConfetti(confettiRef.current);
      const timeout = setTimeout(() => runCycle(), 3000);
      return () => clearTimeout(timeout);
    }
  }, [phase, runCycle]);

  useEffect(() => {
    runCycle();
    return () => {
      setPhase('idle');
      setTypingIndex(0);
    };
  }, [runCycle]);

  const showFound = !['idle', 'typing'].includes(phase);
  const showDiff = !['idle', 'typing', 'found'].includes(phase);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-white p-8">
      <a
        href="/demos"
        className="absolute top-4 left-4 z-50 text-xs text-gray-400 hover:text-gray-600"
      >
        &larr; All Demos
      </a>
      <div
        className="relative w-full max-w-3xl rounded-xl border shadow-lg"
        style={{ borderColor: c.border, overflow: 'visible' }}
      >
        {/* Title bar */}
        <div
          className="flex items-center gap-3 rounded-t-xl border-b px-4 py-2.5"
          style={{ borderColor: c.border, backgroundColor: c.bg }}
        >
          <div className="flex gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: '#d7827e' }}
            />
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: '#ea9d34' }}
            />
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: '#56949f' }}
            />
          </div>
          <span className="flex-1 text-center text-xs" style={{ color: c.dim }}>
            Terminal
          </span>
          <div className="w-[46px]" />
        </div>

        {/* Terminal body */}
        <div
          className="relative rounded-b-xl px-8 py-8 font-mono"
          style={{ backgroundColor: c.bg, overflow: 'visible', minHeight: 500 }}
          ref={confettiRef}
        >
          <div className="space-y-2 text-2xl leading-relaxed">
            {/* Command line */}
            <div>
              <span style={{ color: c.keyword }}>$ </span>
              <span style={{ color: c.text }}>
                {phase === 'typing' ? (
                  <>
                    {COMMAND.slice(0, typingIndex)}
                    <span
                      className="inline-block h-[0.85em] w-[0.55em] translate-y-[1px] animate-pulse"
                      style={{ backgroundColor: c.text }}
                    />
                  </>
                ) : phase === 'idle' ? (
                  <span
                    className="inline-block h-[0.85em] w-[0.55em] translate-y-[1px] animate-pulse"
                    style={{ backgroundColor: c.text }}
                  />
                ) : (
                  COMMAND
                )}
              </span>
            </div>

            {/* Found app ID */}
            {showFound && (
              <div style={{ color: c.dim }}>
                Found{' '}
                <span
                  className="rounded px-0.5"
                  style={{
                    backgroundColor: `${c.keyword}20`,
                    color: c.keyword,
                  }}
                >
                  NEXT_PUBLIC_INSTANT_APP_ID
                </span>
              </div>
            )}

            {/* Schema diff */}
            {showDiff && (
              <div
                className="border px-4 py-3"
                style={{ borderColor: `${c.dim}40` }}
              >
                <div>
                  <span
                    className="px-1.5 py-px text-white"
                    style={{ backgroundColor: c.keyword }}
                  >
                    + CREATE NAMESPACE
                  </span>
                  <span className="ml-2" style={{ color: c.text }}>
                    todos
                  </span>
                </div>
                <div className="mt-1 space-y-0.5 pl-3">
                  <div style={{ color: c.keyword }}>+ CREATE ATTR todos.id</div>
                  <div style={{ color: c.keyword }}>
                    + CREATE ATTR todos.text
                  </div>
                  <div className="pl-8" style={{ color: c.dim }}>
                    DATA TYPE: string
                  </div>
                </div>
              </div>
            )}

            {/* Push prompt */}
            {phase === 'diff' && (
              <div className="space-y-2">
                <div style={{ color: c.text }}>Push these changes?</div>
                <div className="flex gap-4">
                  <span
                    className="px-4 py-0.5 text-white"
                    style={{ backgroundColor: c.string }}
                  >
                    Push
                  </span>
                  <span
                    className="border px-4 py-0.5"
                    style={{ borderColor: `${c.dim}60`, color: c.dim }}
                  >
                    Cancel
                  </span>
                </div>
              </div>
            )}

            {/* Result */}
            {phase === 'result' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div style={{ color: c.keyword }}>Schema updated!</div>
                <div style={{ color: c.keyword }}>✓ Done</div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
