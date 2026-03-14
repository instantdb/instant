import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { LogoIcon } from '@/components/ui';

// -- Types & constants -------------------------------------------------------

type ShapeColor = '#d1d5db' | '#3b82f6';
type ShapeForm = 'circle' | 'square';

const GRAY: ShapeColor = '#d1d5db';
const BLUE: ShapeColor = '#3b82f6';

interface ShapeState {
  color: ShapeColor;
  form: ShapeForm;
}

const GRAY_CIRCLE: ShapeState = { color: GRAY, form: 'circle' };
const BLUE_CIRCLE: ShapeState = { color: BLUE, form: 'circle' };
const BLUE_SQUARE: ShapeState = { color: BLUE, form: 'square' };

interface ClientState {
  serverUpdate: ShapeState | null;
  pendingMut: ShapeState | null;
}

interface IdbEntry {
  id: string;
  label: string;
  color: ShapeColor;
  form: ShapeForm;
}

interface Step {
  title: string;
  description: string;
  client: ClientState;
  serverShape: ShapeState;
  offline: boolean;
  idbEntries: IdbEntry[];
  /** Color of dot traveling Client → IDB (null = no dot) */
  dotToIdb: ShapeColor | null;
  /** Two dots travel Client → Server on reconnect */
  syncDots: boolean;
  /** Broadcast dot travels Server → Client */
  dotServerToClient: boolean;
}

function shapeDisplay(c: ClientState): ShapeState {
  return c.pendingMut ?? c.serverUpdate ?? GRAY_CIRCLE;
}

// -- Steps -------------------------------------------------------------------

const STEPS: Step[] = [
  {
    title: 'Client is online',
    description: 'The client sees a gray circle, connected to the server.',
    client: { serverUpdate: GRAY_CIRCLE, pendingMut: null },
    serverShape: GRAY_CIRCLE,
    offline: false,
    idbEntries: [],
    dotToIdb: null,
    syncDots: false,
    dotServerToClient: false,
  },
  {
    title: 'Client goes offline',
    description:
      'The network drops. The client can no longer reach the server.',
    client: { serverUpdate: GRAY_CIRCLE, pendingMut: null },
    serverShape: GRAY_CIRCLE,
    offline: true,
    idbEntries: [],
    dotToIdb: null,
    syncDots: false,
    dotServerToClient: false,
  },
  {
    title: 'User paints blue',
    description:
      'The user changes the color to blue. It shows instantly via the pending mutation and is persisted to IndexedDB.',
    client: { serverUpdate: GRAY_CIRCLE, pendingMut: BLUE_CIRCLE },
    serverShape: GRAY_CIRCLE,
    offline: true,
    idbEntries: [{ id: 'color', label: 'color', color: BLUE, form: 'circle' }],
    dotToIdb: BLUE,
    syncDots: false,
    dotServerToClient: false,
  },
  {
    title: 'User changes to square',
    description:
      'The user changes the shape to a square. Another pending mutation is queued and persisted to IndexedDB.',
    client: { serverUpdate: GRAY_CIRCLE, pendingMut: BLUE_SQUARE },
    serverShape: GRAY_CIRCLE,
    offline: true,
    idbEntries: [
      { id: 'color', label: 'color', color: BLUE, form: 'circle' },
      { id: 'shape', label: 'shape', color: GRAY, form: 'square' },
    ],
    dotToIdb: GRAY,
    syncDots: false,
    dotServerToClient: false,
  },
  {
    title: 'Back online — mutations sync',
    description:
      'Connection restored. Both mutations fly to the server. The server confirms and broadcasts the result back.',
    client: { serverUpdate: BLUE_SQUARE, pendingMut: null },
    serverShape: BLUE_SQUARE,
    offline: false,
    idbEntries: [],
    syncDots: true,
    dotToIdb: null,
    dotServerToClient: true,
  },
];

// -- Design-size layout constants (px at 540px design width) -----------------

const DESIGN_W = 540;
const COL_W = 130;
const BAR_H = 20;
const BOX_H = 110;
const GAP = 10;
const IDB_W = 110;

// Vertical positions
const BAR1_TOP = 24;
const BAR1_CY = BAR1_TOP + BAR_H / 2;
const BAR2_TOP = BAR1_TOP + BAR_H + 28;
const BAR2_CY = BAR2_TOP + BAR_H / 2;
const BOX_TOP = BAR2_TOP + BAR_H + GAP;

// Horizontal positions
const IDB_LEFT = 10;
const CLIENT_LEFT = IDB_LEFT + IDB_W + 30;
const SERVER_LEFT = DESIGN_W - COL_W - 20;

// IDB box at same vertical level as Client shape box
const IDB_TOP = BOX_TOP;

const DESIGN_H = BOX_TOP + BOX_H + 28;

// Edge endpoints (in design-px, used by SVG overlay)
const EDGE_MUT = {
  x1: CLIENT_LEFT + COL_W,
  y1: BAR2_CY,
  x2: SERVER_LEFT,
  y2: BOX_TOP + BOX_H / 3,
};
const EDGE_BROADCAST = {
  x1: SERVER_LEFT,
  y1: BOX_TOP + BOX_H / 5,
  x2: CLIENT_LEFT + COL_W,
  y2: BAR1_CY,
};
const EDGE_TO_IDB = {
  x1: CLIENT_LEFT,
  y1: BAR2_CY,
  x2: IDB_LEFT + IDB_W,
  y2: IDB_TOP + BOX_H / 2,
};

const MUT_EDGE_MID_X = (EDGE_MUT.x1 + EDGE_MUT.x2) / 2;
const MUT_EDGE_MID_Y = (EDGE_MUT.y1 + EDGE_MUT.y2) / 2;

// -- Sub-components ----------------------------------------------------------

function ShapeLayerBar({ shape }: { shape: ShapeState | null }) {
  return (
    <div
      className="flex items-center justify-center rounded border border-gray-300 bg-white"
      style={{ height: BAR_H, width: COL_W }}
    >
      <AnimatePresence>
        {shape && (
          <motion.div
            key={`${shape.color}-${shape.form}`}
            style={{
              width: BAR_H - 8,
              height: BAR_H - 8,
              backgroundColor: shape.color,
              borderRadius: shape.form === 'circle' ? '50%' : '2px',
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ClientColumn({ state }: { state: ClientState }) {
  const shape = shapeDisplay(state);
  return (
    <div className="flex flex-col items-center" style={{ width: COL_W }}>
      <p className="mb-1 self-start text-sm text-gray-500">Server Result</p>
      <ShapeLayerBar shape={state.serverUpdate} />
      <p className="mt-2 mb-1 self-start text-sm text-gray-500">
        Pending Mutations
      </p>
      <ShapeLayerBar shape={state.pendingMut} />
      <div
        className="mt-2 flex items-center justify-center rounded-lg border border-gray-200 bg-white"
        style={{ width: COL_W, height: BOX_H }}
      >
        <motion.div
          style={{ width: 44, height: 44 }}
          animate={{
            backgroundColor: shape.color,
            borderRadius: shape.form === 'circle' ? '50%' : '4px',
          }}
          transition={{ duration: 0.4 }}
        />
      </div>
      <p className="mt-2 text-base text-gray-500">Client</p>
    </div>
  );
}

function IdbBox({ entries }: { entries: IdbEntry[] }) {
  return (
    <div
      className="flex flex-col rounded-lg border border-gray-200 bg-white"
      style={{ width: IDB_W, height: BOX_H }}
    >
      <p className="px-2 pt-2 text-xs font-medium text-gray-400">IndexedDB</p>
      <div className="flex flex-1 flex-col justify-center gap-2 px-3">
        <AnimatePresence>
          {entries.map((entry) => (
            <motion.div
              key={entry.id}
              className="flex items-center gap-2"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  backgroundColor: entry.color,
                  borderRadius: entry.form === 'circle' ? '50%' : '2px',
                  flexShrink: 0,
                }}
              />
              <span className="text-xs text-gray-500">{entry.label}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TravelingDot({
  x1,
  y1,
  x2,
  y2,
  color,
  delay = 0,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  delay?: number;
}) {
  return (
    <motion.circle
      r={5}
      fill={color}
      initial={{ cx: x1, cy: y1, opacity: 0 }}
      animate={{ cx: x2, cy: y2, opacity: [0, 1, 1, 0] }}
      transition={{ duration: 0.8, delay, ease: 'easeInOut' }}
    />
  );
}

// -- Main component ----------------------------------------------------------

export function OfflinePersistenceWalkthrough() {
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];
  const prevStep = STEPS[Math.max(0, stepIdx - 1)];

  // Delayed visual state: updates lag behind animations
  const [serverShapeVisual, setServerShapeVisual] = useState(step.serverShape);
  const [clientVisual, setClientVisual] = useState(step.client);
  const [idbVisual, setIdbVisual] = useState(step.idbEntries);

  useEffect(() => {
    const hasIdbDot = step.dotToIdb != null;
    const hasSyncDots = step.syncDots;

    if (!hasIdbDot && !hasSyncDots) {
      setServerShapeVisual(step.serverShape);
      setClientVisual(step.client);
      setIdbVisual(step.idbEntries);
      return;
    }

    if (hasIdbDot) {
      // User action is instant; IDB update waits for dot to arrive
      setClientVisual(step.client);
      setServerShapeVisual(step.serverShape);
      setIdbVisual(prevStep.idbEntries);

      const t1 = setTimeout(() => {
        setIdbVisual(step.idbEntries);
      }, 800);

      return () => clearTimeout(t1);
    }

    // Sync step: everything delayed until animations complete
    setServerShapeVisual(prevStep.serverShape);
    setClientVisual(prevStep.client);
    setIdbVisual(prevStep.idbEntries);

    // After sync dots arrive at server (0.8s)
    const t1 = setTimeout(() => {
      setServerShapeVisual(step.serverShape);
    }, 800);

    // After broadcast arrives back at client (0.8s delay + 0.8s travel)
    const t2 = step.dotServerToClient
      ? setTimeout(() => {
          setClientVisual(step.client);
          setIdbVisual(step.idbEntries);
        }, 1600)
      : undefined;

    return () => {
      clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [stepIdx]);

  // Responsive scaling
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / DESIGN_W));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="mt-4 rounded-lg border bg-gray-50 p-5">
      {/* Scaled diagram */}
      <div
        ref={outerRef}
        className="flex justify-center"
        style={{ height: DESIGN_H * scale }}
      >
        <div
          className="relative"
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transformOrigin: 'top center',
            transform: `scale(${scale})`,
          }}
        >
          {/* IndexedDB box */}
          <div className="absolute" style={{ left: IDB_LEFT, top: IDB_TOP }}>
            <IdbBox entries={idbVisual} />
          </div>

          {/* Client */}
          <div className="absolute" style={{ left: CLIENT_LEFT, top: 0 }}>
            <ClientColumn state={clientVisual} />
          </div>

          {/* Server */}
          <div
            className="absolute flex flex-col items-center"
            style={{ left: SERVER_LEFT, top: BOX_TOP - 24, width: COL_W }}
          >
            <div className="mb-1 flex items-center gap-1">
              <LogoIcon size="mini" />
              <p className="text-sm text-gray-500">Server</p>
            </div>
            <div
              className="flex items-center justify-center rounded-lg border border-gray-200 bg-white"
              style={{ width: COL_W, height: BOX_H }}
            >
              <motion.div
                style={{ width: 36, height: 36 }}
                animate={{
                  backgroundColor: serverShapeVisual.color,
                  borderRadius:
                    serverShapeVisual.form === 'circle' ? '50%' : '4px',
                }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </div>

          {/* SVG overlay for edges + animated dots */}
          <svg
            className="pointer-events-none absolute inset-0"
            width={DESIGN_W}
            height={DESIGN_H}
          >
            {/* Client → Server edges (red when offline) */}
            <line
              {...EDGE_MUT}
              stroke={step.offline ? '#ef4444' : '#d1d5db'}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <line
              {...EDGE_BROADCAST}
              stroke={step.offline ? '#ef4444' : '#d1d5db'}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            {/* Client → IndexedDB edge */}
            <line
              {...EDGE_TO_IDB}
              stroke="#d1d5db"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />

            {/* Offline ✗ at mutation edge midpoint */}
            {step.offline && (
              <text
                x={MUT_EDGE_MID_X}
                y={MUT_EDGE_MID_Y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#ef4444"
                fontSize={14}
                fontWeight="bold"
              >
                ✗
              </text>
            )}

            {/* Dot: Client → IndexedDB (steps 3, 4) */}
            <AnimatePresence>
              {step.dotToIdb && (
                <TravelingDot
                  key={`idb-${stepIdx}`}
                  {...EDGE_TO_IDB}
                  color={step.dotToIdb}
                />
              )}
            </AnimatePresence>

            {/* Sync dots: Client → Server (step 5) */}
            <AnimatePresence>
              {step.syncDots && (
                <TravelingDot
                  key={`sync1-${stepIdx}`}
                  {...EDGE_MUT}
                  color={BLUE}
                />
              )}
              {step.syncDots && (
                <TravelingDot
                  key={`sync2-${stepIdx}`}
                  {...EDGE_MUT}
                  color={BLUE}
                  delay={0.15}
                />
              )}
            </AnimatePresence>

            {/* Broadcast dot: Server → Client (step 5) */}
            <AnimatePresence>
              {step.dotServerToClient && (
                <TravelingDot
                  key={`bc-${stepIdx}`}
                  {...EDGE_BROADCAST}
                  color={BLUE}
                  delay={0.8}
                />
              )}
            </AnimatePresence>
          </svg>
        </div>
      </div>

      {/* Step indicator + nav */}
      <div className="mt-4 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
        <button
          onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
          disabled={stepIdx === 0}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-700 active:scale-95 disabled:opacity-30"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStepIdx(i)}
              className={`h-3 w-3 rounded-full transition-colors duration-300 ${
                i === stepIdx ? 'bg-orange-500' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
        <button
          onClick={() => setStepIdx((s) => Math.min(STEPS.length - 1, s + 1))}
          disabled={stepIdx === STEPS.length - 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white shadow-sm transition-all hover:bg-orange-600 active:scale-95 disabled:opacity-30"
        >
          <ChevronRightIcon className="h-4 w-4" strokeWidth={3} />
        </button>
      </div>

      {/* Step text */}
      <div className="mt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={stepIdx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <p className="text-base font-medium text-gray-900">{step.title}</p>
            <p className="mt-0.5 text-base text-gray-500">
              {step.description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
