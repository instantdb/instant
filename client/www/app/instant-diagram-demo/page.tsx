'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Confetti ───────────────────────────────────────────

function spawnConfetti(
  container: HTMLDivElement,
  originX: string,
  originY: string,
) {
  const count = 16;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    const isLogo = i % 4 === 0;

    if (isLogo) {
      const img = document.createElement('img');
      img.src = '/img/icon/favicon-96x96.svg';
      img.style.width = '28px';
      img.style.height = '28px';
      el.appendChild(img);
    } else {
      const items = ['✨', '⚡', '💫', '🎉', '🚀'];
      el.innerText = items[Math.floor(Math.random() * items.length)];
    }

    container.appendChild(el);
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const dist = 120 + Math.random() * 100;
    const xDrift = Math.cos(angle) * dist;
    const yDrift = Math.sin(angle) * dist;
    const delay = i * 40;
    const duration = 1200 + Math.random() * 500;
    const rotation = (Math.random() - 0.5) * 80;
    const scale = 0.8 + Math.random() * 0.5;
    Object.assign(el.style, {
      position: 'absolute',
      left: originX,
      top: originY,
      fontSize: isLogo ? '0' : '26px',
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

// ─── Shared ─────────────────────────────────────────────

const BG = '#faf8f5';

const S = {
  stroke: '#1d1d1d',
  strokeWidth: 2,
  fill: '#fcfffe',
  strokeLinejoin: 'round' as const,
};

const CONVERGE = { x: 280, y: 190 };

// ─── Steps ──────────────────────────────────────────────

const STEPS = [
  'This is how you would have to do it without Instant. First you ask them to add a database to store all the data.',
  'Next you tell them to layer websockets so everything is real-time.',
  'If you want to support offline mode, you need to ask them to add IndexedDB.',
  "And to make things feel fast you tell them write optimistic updates. Your agents shouldn't need to write this for every app you build. This should be infrastructure.",
  "And that's what Instant is for. Instant abstracts all this infra into one box.",
];

// ─── SVG pieces ─────────────────────────────────────────

function DBCylinder() {
  return (
    <>
      <rect
        x={35}
        y={135}
        width={110}
        height={130}
        fill={S.fill}
        stroke="none"
      />
      <line
        x1={35}
        y1={135}
        x2={35}
        y2={265}
        stroke={S.stroke}
        strokeWidth={S.strokeWidth}
      />
      <line
        x1={145}
        y1={135}
        x2={145}
        y2={265}
        stroke={S.stroke}
        strokeWidth={S.strokeWidth}
      />
      <ellipse cx={90} cy={265} rx={55} ry={20} {...S} />
      <ellipse cx={90} cy={135} rx={55} ry={20} {...S} />
      <text
        x={90}
        y={210}
        textAnchor="middle"
        fill="#1d1d1d"
        fontSize={22}
        fontFamily="sans-serif"
      >
        DB
      </text>
    </>
  );
}

function WALBox() {
  return (
    <>
      <rect x={190} y={22} width={240} height={55} rx={10} {...S} />
      <text
        x={310}
        y={57}
        textAnchor="middle"
        fill="#1d1d1d"
        fontSize={20}
        fontFamily="sans-serif"
      >
        WAL
      </text>
    </>
  );
}

function WebSocketsBox() {
  return (
    <>
      <rect x={230} y={130} width={160} height={110} rx={12} {...S} />
      <text
        x={310}
        y={192}
        textAnchor="middle"
        fill="#1d1d1d"
        fontSize={18}
        fontFamily="sans-serif"
      >
        WebSockets
      </text>
    </>
  );
}

function AppScreen() {
  return (
    <>
      <rect x={545} y={115} width={160} height={195} rx={12} {...S} />
      <circle cx={563} cy={132} r={3.5} fill="#ddd" stroke="none" />
      <circle cx={574} cy={132} r={3.5} fill="#ddd" stroke="none" />
      <circle cx={585} cy={132} r={3.5} fill="#ddd" stroke="none" />
      <line
        x1={545}
        y1={143}
        x2={705}
        y2={143}
        stroke="#e0e0e0"
        strokeWidth={1}
      />
      <circle
        cx={566}
        cy={165}
        r={6}
        fill="none"
        stroke="#ccc"
        strokeWidth={1.5}
      />
      <rect
        x={580}
        y={161}
        width={100}
        height={7}
        rx={3.5}
        fill="#ddd"
        stroke="none"
      />
      <circle
        cx={566}
        cy={190}
        r={6}
        fill="none"
        stroke="#ccc"
        strokeWidth={1.5}
      />
      <rect
        x={580}
        y={186}
        width={80}
        height={7}
        rx={3.5}
        fill="#ddd"
        stroke="none"
      />
      <circle
        cx={566}
        cy={215}
        r={6}
        fill="none"
        stroke="#ccc"
        strokeWidth={1.5}
      />
      <rect
        x={580}
        y={211}
        width={110}
        height={7}
        rx={3.5}
        fill="#ddd"
        stroke="none"
      />
      <circle
        cx={566}
        cy={240}
        r={6}
        fill="none"
        stroke="#ccc"
        strokeWidth={1.5}
      />
      <rect
        x={580}
        y={236}
        width={70}
        height={7}
        rx={3.5}
        fill="#ddd"
        stroke="none"
      />
      <rect
        x={556}
        y={268}
        width={138}
        height={28}
        rx={8}
        fill="#f0f0f0"
        stroke="#ddd"
        strokeWidth={1}
      />
      <rect
        x={566}
        y={278}
        width={65}
        height={7}
        rx={3.5}
        fill="#ccc"
        stroke="none"
      />
    </>
  );
}

function OptimisticUpdates() {
  return (
    <>
      <rect x={545} y={55} width={160} height={42} rx={10} {...S} />
      <text
        x={625}
        y={82}
        textAnchor="middle"
        fill="#1d1d1d"
        fontSize={15}
        fontFamily="sans-serif"
      >
        Optimistic Updates
      </text>
    </>
  );
}

function IndexedDBCylinder() {
  return (
    <>
      <rect
        x={765}
        y={120}
        width={90}
        height={80}
        fill={S.fill}
        stroke="none"
      />
      <line
        x1={765}
        y1={120}
        x2={765}
        y2={200}
        stroke={S.stroke}
        strokeWidth={S.strokeWidth}
      />
      <line
        x1={855}
        y1={120}
        x2={855}
        y2={200}
        stroke={S.stroke}
        strokeWidth={S.strokeWidth}
      />
      <ellipse cx={810} cy={200} rx={45} ry={14} {...S} />
      <ellipse cx={810} cy={120} rx={45} ry={14} {...S} />
      <text
        x={810}
        y={166}
        textAnchor="middle"
        fill="#1d1d1d"
        fontSize={13}
        fontFamily="sans-serif"
      >
        IndexedDB
      </text>
    </>
  );
}

// ─── Infra pieces with step visibility ──────────────────

const infraPieces = [
  { key: 'db', render: DBCylinder, cx: 90, cy: 200, showAt: 1 },
  { key: 'wal', render: WALBox, cx: 310, cy: 50, showAt: 2 },
  { key: 'websockets', render: WebSocketsBox, cx: 310, cy: 185, showAt: 2 },
  { key: 'indexeddb', render: IndexedDBCylinder, cx: 810, cy: 160, showAt: 3 },
  { key: 'optimistic', render: OptimisticUpdates, cx: 625, cy: 76, showAt: 4 },
];

// ─── Connection lines grouped by step ───────────────────

// Lines grouped by the step they appear at (matches showAt values)
const stepLines: { showAt: number; paths: string[] }[] = [
  // step 2: WAL + WebSockets lines
  {
    showAt: 2,
    paths: [
      'M 90 115 L 90 50 L 190 50',
      'M 310 77 L 310 130',
      'M 390 175 L 545 175',
      'M 390 205 L 545 205',
    ],
  },
  // step 3: IndexedDB connects to app
  {
    showAt: 3,
    paths: ['M 765 160 L 705 160'],
  },
  // step 4: Optimistic Updates lines
  {
    showAt: 4,
    paths: ['M 705 76 L 810 76 L 810 120', 'M 625 97 L 625 115'],
  },
];

const instantToAppLines: string[] = [
  'M 325 175 L 545 175',
  'M 325 205 L 545 205',
];

// ─── Convergence sub-phases for step 4 ──────────────────

type ConvergePhase =
  | 'idle'
  | 'lines-out'
  | 'converge'
  | 'instant'
  | 'instant-lines';

// ─── Component ──────────────────────────────────────────

export default function Box7Page() {
  const [step, setStep] = useState(0);
  const [convergePhase, setConvergePhase] = useState<ConvergePhase>('idle');
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const clearTimeouts = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timeouts.current.push(id);
  }, []);

  // Run convergence sequence when entering final step
  useEffect(() => {
    if (step !== STEPS.length) {
      setConvergePhase('idle');
      clearTimeouts();
      return;
    }

    let t = 0;
    schedule(() => setConvergePhase('lines-out'), (t += 200));
    schedule(() => setConvergePhase('converge'), (t += 700));
    schedule(
      () => {
        setConvergePhase('instant');
        if (containerRef.current) {
          const pctX = `${(CONVERGE.x / 920) * 100}%`;
          const pctY = `${(CONVERGE.y / 400) * 100}%`;
          spawnConfetti(containerRef.current, pctX, pctY);
        }
      },
      (t += 900),
    );
    schedule(() => setConvergePhase('instant-lines'), (t += 400));

    return clearTimeouts;
  }, [step, clearTimeouts, schedule]);

  // Arrow key navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setStep((s) => Math.min(s + 1, STEPS.length));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setStep((s) => Math.max(s - 1, 0));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Derived state
  const isLastStep = step === STEPS.length;
  const linesOut = isLastStep && convergePhase !== 'idle';
  const isConverging =
    isLastStep &&
    ['converge', 'instant', 'instant-lines'].includes(convergePhase);
  const showInstant =
    isLastStep && ['instant', 'instant-lines'].includes(convergePhase);
  const showInstantLines = isLastStep && convergePhase === 'instant-lines';

  const showAtStep = (showAt: number) => step >= showAt && !showInstant;
  const showLineAtStep = (showAt: number) => step >= showAt && !linesOut;

  return (
    <div
      className="flex min-h-screen w-screen flex-col"
      style={{ background: BG }}
    >
      {/* ── Top bar (fixed height to prevent layout shift) ── */}
      <div className="flex h-14 flex-shrink-0 items-center px-6">
        {/* Step label */}
        <div className="relative min-w-0 flex-1 pr-4" style={{ height: 20 }}>
          <AnimatePresence mode="wait">
            {step > 0 && (
              <motion.p
                key={step}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 truncate text-center text-sm text-gray-500"
              >
                {STEPS[step - 1]}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Step buttons */}
        <div className="flex flex-shrink-0 gap-1.5">
          {STEPS.map((_, i) => {
            const s = i + 1;
            return (
              <button
                key={s}
                onClick={() => setStep(s)}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  step === s
                    ? 'bg-gray-800 text-white'
                    : step > s
                      ? 'bg-gray-300 text-white'
                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Diagram ── */}
      <div className="flex flex-1 items-center justify-center">
        <div
          ref={containerRef}
          className="relative w-full"
          style={{ maxWidth: 960, overflow: 'visible' }}
        >
          <svg viewBox="0 0 920 400" width="100%" style={{ display: 'block' }}>
            {/* ── Connection lines by step ── */}
            {stepLines.map((group) =>
              group.paths.map((d, li) => (
                <motion.path
                  key={`step-line-${group.showAt}-${li}`}
                  d={d}
                  fill="none"
                  stroke="#1d1d1d"
                  strokeWidth={1.5}
                  strokeDasharray="8 5"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={
                    linesOut
                      ? { pathLength: 0, opacity: 0 }
                      : showLineAtStep(group.showAt)
                        ? { pathLength: 1, opacity: 1 }
                        : { pathLength: 0, opacity: 0 }
                  }
                  transition={
                    linesOut
                      ? { duration: 0.5, ease: 'easeIn' }
                      : { duration: 0.6, ease: 'easeOut', delay: li * 0.1 }
                  }
                />
              )),
            )}

            {/* ── Infra pieces ── */}
            <AnimatePresence>
              {infraPieces.map((piece) => {
                if (!showAtStep(piece.showAt)) return null;
                const dx = CONVERGE.x - piece.cx;
                const dy = CONVERGE.y - piece.cy;
                return (
                  <motion.g
                    key={piece.key}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{
                      opacity: isConverging ? 0 : 1,
                      scale: isConverging ? 0.15 : 1,
                      x: isConverging ? dx : 0,
                      y: isConverging ? dy : 0,
                    }}
                    exit={{ opacity: 0 }}
                    transition={
                      isConverging
                        ? {
                            type: 'spring',
                            stiffness: 100,
                            damping: 14,
                            mass: 0.7,
                          }
                        : { duration: 0.4, ease: 'easeOut' }
                    }
                  >
                    {piece.render()}
                  </motion.g>
                );
              })}
            </AnimatePresence>

            {/* ── App screen (always visible) ── */}
            <AppScreen />

            {/* ── Instant logo ── */}
            <AnimatePresence>
              {showInstant && (
                <motion.g
                  key="instant-logo"
                  initial={{ opacity: 0, scale: 0.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 20,
                    mass: 0.4,
                  }}
                  style={{ transformOrigin: `${CONVERGE.x}px ${CONVERGE.y}px` }}
                >
                  <rect
                    x={CONVERGE.x - 40}
                    y={CONVERGE.y - 40}
                    width={80}
                    height={80}
                    fill="black"
                  />
                  <rect
                    x={CONVERGE.x - 40 + 15.2}
                    y={CONVERGE.y - 40 + 14.3}
                    width={21.9}
                    height={51.6}
                    fill="white"
                  />
                </motion.g>
              )}
            </AnimatePresence>

            {/* ── Lines from Instant to app ── */}
            {instantToAppLines.map((d, i) => (
              <motion.path
                key={`instant-line-${i}`}
                d={d}
                fill="none"
                stroke="#1d1d1d"
                strokeWidth={1.5}
                strokeDasharray="8 5"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={
                  showInstantLines
                    ? { pathLength: 1, opacity: 1 }
                    : { pathLength: 0, opacity: 0 }
                }
                transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.1 }}
              />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
