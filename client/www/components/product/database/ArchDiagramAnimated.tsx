'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Shared ─────────────────────────────────────────────

const STROKE = {
  stroke: '#1d1d1d',
  strokeWidth: 2,
  strokeLinejoin: 'round' as const,
};

const CONVERGE = { x: 280, y: 172 };

// ─── SVG pieces ─────────────────────────────────────────

function DBCylinder() {
  return (
    <>
      <rect
        x={35}
        y={135}
        width={110}
        height={130}
        fill="white"
        stroke="none"
      />
      <line x1={35} y1={135} x2={35} y2={265} {...STROKE} />
      <line x1={145} y1={135} x2={145} y2={265} {...STROKE} />
      <ellipse cx={90} cy={265} rx={55} ry={20} fill="white" {...STROKE} />
      <ellipse cx={90} cy={135} rx={55} ry={20} fill="white" {...STROKE} />
      <text
        x={90}
        y={210}
        textAnchor="middle"
        fill="#1d1d1d"
        fontSize={18}
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
      <rect
        x={190}
        y={22}
        width={240}
        height={55}
        rx={10}
        fill="white"
        {...STROKE}
      />
      <text
        x={310}
        y={57}
        textAnchor="middle"
        fill="#1d1d1d"
        fontSize={18}
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
      <rect
        x={230}
        y={130}
        width={160}
        height={110}
        rx={12}
        fill="white"
        {...STROKE}
      />
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
      <rect
        x={545}
        y={75}
        width={160}
        height={195}
        rx={12}
        fill="white"
        {...STROKE}
      />
      <circle cx={563} cy={92} r={3.5} fill="#ddd" stroke="none" />
      <circle cx={574} cy={92} r={3.5} fill="#ddd" stroke="none" />
      <circle cx={585} cy={92} r={3.5} fill="#ddd" stroke="none" />
      <line
        x1={545}
        y1={103}
        x2={705}
        y2={103}
        stroke="#e0e0e0"
        strokeWidth={1}
      />
      <circle
        cx={566}
        cy={125}
        r={6}
        fill="none"
        stroke="#ccc"
        strokeWidth={1.5}
      />
      <rect
        x={580}
        y={121}
        width={100}
        height={7}
        rx={3.5}
        fill="#ddd"
        stroke="none"
      />
      <circle
        cx={566}
        cy={150}
        r={6}
        fill="none"
        stroke="#ccc"
        strokeWidth={1.5}
      />
      <rect
        x={580}
        y={146}
        width={80}
        height={7}
        rx={3.5}
        fill="#ddd"
        stroke="none"
      />
      <circle
        cx={566}
        cy={175}
        r={6}
        fill="none"
        stroke="#ccc"
        strokeWidth={1.5}
      />
      <rect
        x={580}
        y={171}
        width={110}
        height={7}
        rx={3.5}
        fill="#ddd"
        stroke="none"
      />
      <circle
        cx={566}
        cy={200}
        r={6}
        fill="none"
        stroke="#ccc"
        strokeWidth={1.5}
      />
      <rect
        x={580}
        y={196}
        width={70}
        height={7}
        rx={3.5}
        fill="#ddd"
        stroke="none"
      />
      <rect
        x={556}
        y={228}
        width={138}
        height={28}
        rx={8}
        fill="#f0f0f0"
        stroke="#ddd"
        strokeWidth={1}
      />
      <rect
        x={566}
        y={238}
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
      <rect
        x={520}
        y={15}
        width={210}
        height={42}
        rx={10}
        fill="white"
        {...STROKE}
      />
      <text
        x={625}
        y={42}
        textAnchor="middle"
        fill="#1d1d1d"
        fontSize={18}
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
      <rect x={755} y={80} width={110} height={80} fill="white" stroke="none" />
      <line x1={755} y1={80} x2={755} y2={160} {...STROKE} />
      <line x1={865} y1={80} x2={865} y2={160} {...STROKE} />
      <ellipse cx={810} cy={160} rx={55} ry={17} fill="white" {...STROKE} />
      <ellipse cx={810} cy={80} rx={55} ry={17} fill="white" {...STROKE} />
      <text
        x={810}
        y={126}
        textAnchor="middle"
        fill="#1d1d1d"
        fontSize={18}
        fontFamily="sans-serif"
      >
        IndexedDB
      </text>
    </>
  );
}

// ─── Layout data ────────────────────────────────────────

const infraPieces = [
  { key: 'db', render: DBCylinder, cx: 90, cy: 200 },
  { key: 'wal', render: WALBox, cx: 310, cy: 50 },
  { key: 'websockets', render: WebSocketsBox, cx: 310, cy: 185 },
  { key: 'indexeddb', render: IndexedDBCylinder, cx: 810, cy: 120 },
  { key: 'optimistic', render: OptimisticUpdates, cx: 625, cy: 36 },
];

const connectionLines = [
  'M 90 115 L 90 50 L 190 50',
  'M 310 77 L 310 130',
  'M 390 165 L 545 165',
  'M 390 180 L 545 180',
  'M 755 120 L 705 120',
  'M 730 36 L 810 36 L 810 63',
  'M 625 57 L 625 75',
];

// Centered at app vertical center (y=172)
const instantToAppLines = ['M 325 165 L 545 165', 'M 325 180 L 545 180'];

// ─── Component ──────────────────────────────────────────

type Phase = 'idle' | 'lines-out' | 'converge' | 'instant' | 'instant-lines';

export function ArchDiagramAnimated() {
  const [phase, setPhase] = useState<Phase>('idle');
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timeoutsRef.current.push(id);
  }, []);

  useEffect(() => () => clearTimeouts(), [clearTimeouts]);

  const activate = useCallback(() => {
    if (phase !== 'idle') return;
    let t = 0;
    schedule(() => setPhase('lines-out'), (t += 100));
    schedule(() => setPhase('converge'), (t += 400));
    schedule(() => setPhase('instant'), (t += 600));
    schedule(() => setPhase('instant-lines'), (t += 300));
  }, [phase, schedule]);

  const reset = useCallback(() => {
    clearTimeouts();
    setPhase('idle');
  }, [clearTimeouts]);

  const isIdle = phase === 'idle';
  const linesOut = !isIdle;
  const isConverging = ['converge', 'instant', 'instant-lines'].includes(phase);
  const showInstant = ['instant', 'instant-lines'].includes(phase);
  const showInstantLines = phase === 'instant-lines';

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Button - stays mounted, morphs content */}
      <div className="relative flex h-12 items-center">
        <div className="absolute -inset-3 rounded-full bg-gradient-to-b from-orange-300/30 via-orange-200/20 to-transparent blur-lg" />
        <motion.button
          onClick={isIdle ? activate : linesOut ? reset : undefined}
          animate={
            showInstantLines
              ? { rotate: [0, -4, 4, -2, 2, 0], scale: [1, 1.08, 1] }
              : isIdle
                ? { rotate: [0, -1.5, 1.5, -0.5, 0], scale: 1 }
                : { rotate: 0, scale: 1 }
          }
          transition={
            showInstantLines
              ? { duration: 0.6, ease: 'easeOut' }
              : isIdle
                ? {
                    rotate: {
                      duration: 4,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    },
                  }
                : { duration: 0.3 }
          }
          whileHover={
            isIdle
              ? {
                  rotate: [0, -3, 3, -2, 2, -1, 0],
                  transition: {
                    rotate: { duration: 0.5, repeat: Infinity },
                  },
                }
              : {}
          }
          className="relative flex cursor-pointer items-center gap-2.5 rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-medium text-gray-900 shadow-sm transition-shadow hover:shadow-md"
        >
          <AnimatePresence mode="wait" initial={false}>
            {linesOut ? (
              <motion.span
                key="with"
                className="flex items-center gap-2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
              >
                <span>🎉</span>
                With Instant
              </motion.span>
            ) : (
              <motion.span
                key="add"
                className="flex items-center gap-2.5"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 80 80"
                  className="flex-shrink-0"
                >
                  <rect width="80" height="80" rx="8" fill="#1d1d1d" />
                  <rect
                    x="15.2"
                    y="14.3"
                    width="21.9"
                    height="51.6"
                    fill="white"
                  />
                </svg>
                Add Instant
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* SVG Diagram */}
      <svg viewBox="0 0 920 340" width="100%" style={{ display: 'block' }}>
        {/* Infra pieces (rendered first so lines draw on top) */}
        {infraPieces.map((piece) => {
          const dx = CONVERGE.x - piece.cx;
          const dy = CONVERGE.y - piece.cy;
          return (
            <motion.g
              key={piece.key}
              animate={{
                opacity: isConverging ? 0 : 1,
                scale: isConverging ? 0.15 : 1,
                x: isConverging ? dx : 0,
                y: isConverging ? dy : 0,
              }}
              transition={
                isConverging
                  ? {
                      type: 'spring',
                      stiffness: 100,
                      damping: 14,
                      mass: 0.7,
                    }
                  : { duration: 0.6, ease: 'easeOut' }
              }
            >
              {piece.render()}
            </motion.g>
          );
        })}

        {/* Connection lines (on top of infra pieces, plain CSS transitions) */}
        {connectionLines.map((d, i) => (
          <path
            key={`conn-${i}`}
            d={d}
            fill="none"
            stroke="#1d1d1d"
            strokeWidth={1.5}
            strokeLinejoin="round"
            style={{
              opacity: linesOut ? 0 : 1,
              transition: linesOut
                ? 'opacity 0.5s ease-in'
                : `opacity 0.6s ease-out ${i * 0.05}s`,
            }}
          />
        ))}

        {/* App screen (always visible) */}
        <AppScreen />

        {/* Instant logo */}
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
              style={{
                transformOrigin: `${CONVERGE.x}px ${CONVERGE.y}px`,
              }}
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

        {/* Lines from Instant to App */}
        {instantToAppLines.map((d, i) => (
          <path
            key={`instant-line-${i}`}
            d={d}
            fill="none"
            stroke="#1d1d1d"
            strokeWidth={1.5}
            strokeLinejoin="round"
            style={{
              opacity: showInstantLines ? 1 : 0,
              transition: showInstantLines
                ? `opacity 0.5s ease-out ${i * 0.1}s`
                : 'opacity 0.3s ease-in',
            }}
          />
        ))}
      </svg>
    </div>
  );
}
