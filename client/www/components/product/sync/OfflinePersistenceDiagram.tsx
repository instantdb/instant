import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

// -- Step definitions --------------------------------------------------------

interface Step {
  title: string;
  description: string;
  /** Store rows visible (number of filled rows, 0-3) */
  storeRows: number;
  /** Pending mutation labels shown */
  pendingTxs: string[];
  /** Whether pending txs are being cleared (strikethrough) */
  pendingClearing: boolean;
  /** Server status */
  server: 'active' | 'offline' | 'ack';
  /** Traveling dot: server → store */
  dotServerToStore: boolean;
  /** Traveling dot: store → app (upward, from IDB to UI) */
  dotStoreToApp: boolean;
  /** Traveling dot: app → pending (downward, user action) */
  dotAppToPending: boolean;
  /** Traveling dot: pending → server (replay) */
  dotPendingToServer: boolean;
  /** Traveling dot: server → pending (ack) */
  dotServerToPending: boolean;
}

const STEPS: Step[] = [
  {
    title: 'Queries are cached',
    description:
      'Query results from the server are stored in IndexedDB — both the store and pending queue persist locally.',
    storeRows: 3,
    pendingTxs: [],
    pendingClearing: false,
    server: 'active',
    dotServerToStore: true,
    dotStoreToApp: false,
    dotAppToPending: false,
    dotPendingToServer: false,
    dotServerToPending: false,
  },
  {
    title: 'Instant load from cache',
    description:
      'On next visit the UI renders instantly from the cached store — no server round-trip needed.',
    storeRows: 3,
    pendingTxs: [],
    pendingClearing: false,
    server: 'offline',
    dotServerToStore: false,
    dotStoreToApp: true,
    dotAppToPending: false,
    dotPendingToServer: false,
    dotServerToPending: false,
  },
  {
    title: 'Mutations queue up offline',
    description:
      'While offline, mutations are saved to the pending queue in IndexedDB. The store updates optimistically.',
    storeRows: 3,
    pendingTxs: ['tx 1', 'tx 2', 'tx 3'],
    pendingClearing: false,
    server: 'offline',
    dotServerToStore: false,
    dotStoreToApp: false,
    dotAppToPending: true,
    dotPendingToServer: false,
    dotServerToPending: false,
  },
  {
    title: 'Reconnect & sync',
    description:
      'When the connection returns, queued mutations replay to the server. Once acknowledged, the queue clears.',
    storeRows: 3,
    pendingTxs: ['tx 1', 'tx 2', 'tx 3'],
    pendingClearing: true,
    server: 'ack',
    dotServerToStore: false,
    dotStoreToApp: false,
    dotAppToPending: false,
    dotPendingToServer: true,
    dotServerToPending: true,
  },
];

// -- Layout constants --------------------------------------------------------

const VB_W = 460;
const VB_H = 220;

// App UI strip at top of client
const APP_X = 20;
const APP_Y = 10;
const APP_W = 250;
const APP_H = 30;

// IndexedDB container (holds store + pending)
const IDB_X = 20;
const IDB_Y = 52;
const IDB_W = 250;
const IDB_H = 155;

// Store box (inside IDB)
const STORE_X = IDB_X + 10;
const STORE_Y = IDB_Y + 24;
const STORE_W = (IDB_W - 30) / 2;
const STORE_H = 115;

// Pending queue box (inside IDB)
const PEND_X = STORE_X + STORE_W + 10;
const PEND_Y = STORE_Y;
const PEND_W = STORE_W;
const PEND_H = STORE_H;

// Server box
const SVR_X = 330;
const SVR_Y = 60;
const SVR_W = 110;
const SVR_H = 140;
const SVR_CX = SVR_X + SVR_W / 2;
const SVR_CY = SVR_Y + SVR_H / 2;

// Edge from IDB to server
const EDGE_Y = SVR_CY;
const EDGE_X1 = IDB_X + IDB_W;
const EDGE_X2 = SVR_X;

// -- Traveling dot -----------------------------------------------------------

function TravelingDot({
  x1,
  y1,
  x2,
  y2,
  color = '#f97316',
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
}) {
  return (
    <motion.circle
      r={4}
      fill={color}
      initial={{ cx: x1, cy: y1, opacity: 0 }}
      animate={{ cx: x2, cy: y2, opacity: [0, 1, 1, 0] }}
      transition={{ duration: 0.8, ease: 'easeInOut' }}
    />
  );
}

// -- Main component ----------------------------------------------------------

export function OfflinePersistenceDiagram() {
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  const serverFill =
    step.server === 'offline' ? '#fef2f2' : 'white';
  const serverStroke =
    step.server === 'offline' ? '#fecaca' : '#e5e7eb';
  const serverDash =
    step.server === 'offline' ? '4 3' : undefined;
  const serverOpacity =
    step.server === 'offline' ? 0.6 : 1;

  return (
    <div className="mt-4 rounded-lg border bg-gray-50 p-5">
      {/* SVG diagram */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="mx-auto block w-full max-w-[460px]"
          role="img"
          aria-label="Offline persistence walkthrough diagram"
        >
          {/* ---- App UI bar ---- */}
          <rect
            x={APP_X}
            y={APP_Y}
            width={APP_W}
            height={APP_H}
            rx={6}
            fill="white"
            stroke="#e5e7eb"
            strokeWidth={1.5}
          />
          <text
            x={APP_X + 10}
            y={APP_Y + 19}
            className="text-[11px] font-medium"
            fill="#6b7280"
          >
            App UI
          </text>

          {/* status badge inside app bar */}
          <AnimatePresence>
            {step.dotStoreToApp && (
              <motion.text
                key="instant"
                x={APP_X + APP_W - 10}
                y={APP_Y + 19}
                textAnchor="end"
                className="text-[10px] font-medium"
                fill="#f97316"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                renders instantly
              </motion.text>
            )}
          </AnimatePresence>

          {/* ---- IndexedDB container ---- */}
          <rect
            x={IDB_X}
            y={IDB_Y}
            width={IDB_W}
            height={IDB_H}
            rx={8}
            fill="#fffbeb"
            stroke="#fde68a"
            strokeWidth={1.5}
            strokeDasharray="6 3"
          />
          <text
            x={IDB_X + 10}
            y={IDB_Y + 16}
            className="text-[10px] font-medium"
            fill="#d97706"
          >
            IndexedDB
          </text>

          {/* ---- Store box ---- */}
          <rect
            x={STORE_X}
            y={STORE_Y}
            width={STORE_W}
            height={STORE_H}
            rx={6}
            fill="white"
            stroke="#e5e7eb"
            strokeWidth={1.5}
          />
          <text
            x={STORE_X + STORE_W / 2}
            y={STORE_Y + 16}
            textAnchor="middle"
            className="text-[10px] font-medium"
            fill="#6b7280"
          >
            Store
          </text>

          {/* Store data rows */}
          {[0, 1, 2].map((i) => {
            const ry = STORE_Y + 28 + i * 24;
            const filled = i < step.storeRows;
            return (
              <g key={`row-${i}`}>
                <rect
                  x={STORE_X + 8}
                  y={ry}
                  width={STORE_W - 16}
                  height={16}
                  rx={3}
                  fill={filled ? '#fff7ed' : '#f9fafb'}
                  stroke={filled ? '#fdba74' : '#e5e7eb'}
                  strokeWidth={1}
                />
                <motion.text
                  x={STORE_X + 14}
                  y={ry + 11.5}
                  className="text-[9px]"
                  animate={{ fill: filled ? '#9a3412' : '#d1d5db' }}
                  transition={{ duration: 0.3 }}
                >
                  {filled
                    ? ['todos: [...]', 'users: [...]', 'goals: [...]'][i]
                    : '—'}
                </motion.text>
              </g>
            );
          })}

          {/* ---- Pending mutations box ---- */}
          <rect
            x={PEND_X}
            y={PEND_Y}
            width={PEND_W}
            height={PEND_H}
            rx={6}
            fill="white"
            stroke="#e5e7eb"
            strokeWidth={1.5}
          />
          <text
            x={PEND_X + PEND_W / 2}
            y={PEND_Y + 16}
            textAnchor="middle"
            className="text-[10px] font-medium"
            fill="#6b7280"
          >
            Pending Mut.
          </text>

          {/* Pending tx rows */}
          <AnimatePresence>
            {step.pendingTxs.map((tx, i) => {
              const ry = PEND_Y + 28 + i * 24;
              return (
                <motion.g
                  key={tx}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: step.pendingClearing ? 0.35 : 1, x: 0 }}
                  exit={{ opacity: 0, x: 4 }}
                  transition={{ duration: 0.25, delay: i * 0.08 }}
                >
                  <rect
                    x={PEND_X + 8}
                    y={ry}
                    width={PEND_W - 16}
                    height={16}
                    rx={3}
                    fill={step.pendingClearing ? '#f0fdf4' : '#fefce8'}
                    stroke={step.pendingClearing ? '#bbf7d0' : '#fde68a'}
                    strokeWidth={1}
                  />
                  <text
                    x={PEND_X + 14}
                    y={ry + 11.5}
                    className="text-[9px]"
                    fill={step.pendingClearing ? '#16a34a' : '#a16207'}
                  >
                    {step.pendingClearing ? `${tx} ✓` : tx}
                  </text>
                </motion.g>
              );
            })}
          </AnimatePresence>

          {/* Empty state for pending queue */}
          {step.pendingTxs.length === 0 && (
            <text
              x={PEND_X + PEND_W / 2}
              y={PEND_Y + PEND_H / 2 + 8}
              textAnchor="middle"
              className="text-[10px]"
              fill="#d1d5db"
            >
              empty
            </text>
          )}

          {/* ---- Edge from IDB to Server ---- */}
          <line
            x1={EDGE_X1}
            y1={EDGE_Y}
            x2={EDGE_X2}
            y2={EDGE_Y}
            stroke="#d1d5db"
            strokeWidth={2}
            strokeDasharray="4 3"
          />

          {/* ---- Server box ---- */}
          <motion.g animate={{ opacity: serverOpacity }} transition={{ duration: 0.3 }}>
            <rect
              x={SVR_X}
              y={SVR_Y}
              width={SVR_W}
              height={SVR_H}
              rx={8}
              fill={serverFill}
              stroke={serverStroke}
              strokeWidth={1.5}
              strokeDasharray={serverDash}
            />
            <text
              x={SVR_CX}
              y={SVR_Y + 20}
              textAnchor="middle"
              className="text-[11px] font-medium"
              fill="#6b7280"
            >
              Server
            </text>

            {/* Server status */}
            <AnimatePresence mode="wait">
              {step.server === 'active' && (
                <motion.text
                  key="active"
                  x={SVR_CX}
                  y={SVR_CY + 4}
                  textAnchor="middle"
                  className="text-[10px]"
                  fill="#6b7280"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  Connected
                </motion.text>
              )}
              {step.server === 'offline' && (
                <motion.g
                  key="offline"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <text
                    x={SVR_CX}
                    y={SVR_CY + 4}
                    textAnchor="middle"
                    className="text-[10px] font-medium"
                    fill="#ef4444"
                  >
                    Offline
                  </text>
                </motion.g>
              )}
              {step.server === 'ack' && (
                <motion.g
                  key="ack"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <circle
                    cx={SVR_CX}
                    cy={SVR_CY - 2}
                    r={10}
                    fill="#22c55e"
                  />
                  <text
                    x={SVR_CX}
                    y={SVR_CY + 2}
                    textAnchor="middle"
                    className="text-[9px]"
                    fill="white"
                  >
                    ✓
                  </text>
                  <text
                    x={SVR_CX}
                    y={SVR_CY + 18}
                    textAnchor="middle"
                    className="text-[10px] font-medium"
                    fill="#16a34a"
                  >
                    Synced
                  </text>
                </motion.g>
              )}
            </AnimatePresence>
          </motion.g>

          {/* ---- Traveling dots ---- */}
          <AnimatePresence>
            {/* Server → Store (caching query results) */}
            {step.dotServerToStore && (
              <TravelingDot
                key={`svr-store-${stepIdx}`}
                x1={EDGE_X2}
                y1={EDGE_Y}
                x2={STORE_X + STORE_W / 2}
                y2={STORE_Y + STORE_H / 2}
              />
            )}
            {/* Store → App UI (loading from cache) */}
            {step.dotStoreToApp && (
              <TravelingDot
                key={`store-app-${stepIdx}`}
                x1={STORE_X + STORE_W / 2}
                y1={STORE_Y}
                x2={APP_X + APP_W / 2}
                y2={APP_Y + APP_H}
              />
            )}
            {/* App → Pending (offline mutation) */}
            {step.dotAppToPending && (
              <TravelingDot
                key={`app-pend-${stepIdx}`}
                x1={APP_X + APP_W * 0.75}
                y1={APP_Y + APP_H}
                x2={PEND_X + PEND_W / 2}
                y2={PEND_Y}
              />
            )}
            {/* Pending → Server (replay) */}
            {step.dotPendingToServer && (
              <TravelingDot
                key={`pend-svr-${stepIdx}`}
                x1={EDGE_X1}
                y1={EDGE_Y - 6}
                x2={EDGE_X2}
                y2={EDGE_Y - 6}
              />
            )}
            {/* Server → Pending (ack) */}
            {step.dotServerToPending && (
              <TravelingDot
                key={`svr-pend-${stepIdx}`}
                x1={EDGE_X2}
                y1={EDGE_Y + 6}
                x2={EDGE_X1}
                y2={EDGE_Y + 6}
                color="#22c55e"
              />
            )}
          </AnimatePresence>
        </svg>
      </div>

      {/* Step text */}
      <div className="mt-5 min-h-[40px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={stepIdx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <p className="text-sm font-medium text-gray-900">{step.title}</p>
            <p className="mt-0.5 text-xs text-gray-500">{step.description}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Step indicator + nav */}
      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
          disabled={stepIdx === 0}
          className="rounded p-1 text-gray-400 transition-colors hover:text-gray-600 disabled:opacity-30"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStepIdx(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === stepIdx ? 'w-6 bg-orange-500' : 'w-1.5 bg-gray-300'
              }`}
            />
          ))}
        </div>
        <button
          onClick={() => setStepIdx((s) => Math.min(STEPS.length - 1, s + 1))}
          disabled={stepIdx === STEPS.length - 1}
          className="rounded p-1 text-gray-400 transition-colors hover:text-gray-600 disabled:opacity-30"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
