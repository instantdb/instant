import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LogoIcon } from '@/components/ui';
import { WalkthroughShell } from './WalkthroughShell';

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
  pendingMuts: ShapeState[];
}

interface IdbState {
  serverResult: ShapeState | null;
  pendingMuts: ShapeState[];
}

interface Step {
  title: string;
  description: string;
  client: ClientState;
  serverShape: ShapeState;
  offline: boolean;
  idb: IdbState;
  dotToIdb: ShapeState | null;
  syncDots: ShapeState[];
  dotServerToClient: boolean;
}

function shapeDisplay(c: ClientState): ShapeState {
  return c.pendingMuts.length > 0
    ? c.pendingMuts[c.pendingMuts.length - 1]
    : (c.serverUpdate ?? GRAY_CIRCLE);
}

// -- Steps -------------------------------------------------------------------

const STEPS: Step[] = [
  {
    title: 'Alyssa is online',
    description:
      'Alyssa is online and sees her gray circle. Both the query result and her pending mutations are saved in IndexedDB. What happens when the network drops?',
    client: { serverUpdate: GRAY_CIRCLE, pendingMuts: [] },
    serverShape: GRAY_CIRCLE,
    offline: false,
    idb: { serverResult: GRAY_CIRCLE, pendingMuts: [] },
    dotToIdb: null,
    syncDots: [],
    dotServerToClient: false,
  },
  {
    title: 'Alyssa goes offline',
    description:
      'Even if the network drops, Alyssa can continue working. She can see the last server result thanks to IndexedDB, and all her mutations are saved too.',
    client: { serverUpdate: GRAY_CIRCLE, pendingMuts: [] },
    serverShape: GRAY_CIRCLE,
    offline: true,
    idb: { serverResult: GRAY_CIRCLE, pendingMuts: [] },
    dotToIdb: null,
    syncDots: [],
    dotServerToClient: false,
  },
  {
    title: 'Alyssa paints blue',
    description:
      "If Alyssa changes the color offline, that change will get saved into a pending mutation, and she'll see the update even without the server.",
    client: { serverUpdate: GRAY_CIRCLE, pendingMuts: [BLUE_CIRCLE] },
    serverShape: GRAY_CIRCLE,
    offline: true,
    idb: { serverResult: GRAY_CIRCLE, pendingMuts: [BLUE_CIRCLE] },
    dotToIdb: BLUE_CIRCLE,
    syncDots: [],
    dotServerToClient: false,
  },
  {
    title: 'Alyssa makes the circle a square',
    description:
      'She can keep going. As she makes more transactions, we grow the pending mutations queue and persist that to IndexedDB.',
    client: {
      serverUpdate: GRAY_CIRCLE,
      pendingMuts: [BLUE_CIRCLE, BLUE_SQUARE],
    },
    serverShape: GRAY_CIRCLE,
    offline: true,
    idb: {
      serverResult: GRAY_CIRCLE,
      pendingMuts: [BLUE_CIRCLE, BLUE_SQUARE],
    },
    dotToIdb: BLUE_SQUARE,
    syncDots: [],
    dotServerToClient: false,
  },
  {
    title: 'Back online, and the mutations sync',
    description:
      "When she's back online, we send off Alyssa's mutations to the server. The server confirms it and broadcasts the result to relevant users.",
    client: { serverUpdate: BLUE_SQUARE, pendingMuts: [] },
    serverShape: BLUE_SQUARE,
    offline: false,
    idb: { serverResult: BLUE_SQUARE, pendingMuts: [] },
    syncDots: [BLUE_CIRCLE, BLUE_SQUARE],
    dotToIdb: null,
    dotServerToClient: true,
  },
];

// -- Layout constants --------------------------------------------------------

const DESIGN_W = 540;
const COL_W = 130;
const BAR_H = 20;
const BOX_H = 110;
const GAP = 10;

const IDB_LEFT = 20;
const IDB_W = 80;
const IDB_ITEM_H = 28;

const BAR1_TOP = 24;
const BAR1_CY = BAR1_TOP + BAR_H / 2;
const BAR2_TOP = BAR1_TOP + BAR_H + 28;
const BAR2_CY = BAR2_TOP + BAR_H / 2;
const BOX_TOP = BAR2_TOP + BAR_H + GAP;

const IDB_CY1 = BAR1_CY + 8;
const IDB_CY2 = BAR2_CY - 8;
const IDB_TOP1 = IDB_CY1 - IDB_ITEM_H / 2;
const IDB_TOP2 = IDB_CY2 - IDB_ITEM_H / 2;

const CLIENT_LEFT = IDB_LEFT + IDB_W + 50;
const SERVER_LEFT = DESIGN_W - COL_W - 20;

const DESIGN_H = BOX_TOP + BOX_H + 28;

// Edge endpoints
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
const EDGE_TO_IDB_SR = {
  x1: CLIENT_LEFT,
  y1: BAR1_CY,
  x2: IDB_LEFT + IDB_W,
  y2: IDB_CY1,
};
const EDGE_TO_IDB_PM = {
  x1: CLIENT_LEFT,
  y1: BAR2_CY,
  x2: IDB_LEFT + IDB_W,
  y2: IDB_CY2,
};

const MUT_EDGE_MID_X = (EDGE_MUT.x1 + EDGE_MUT.x2) / 2;
const MUT_EDGE_MID_Y = (EDGE_MUT.y1 + EDGE_MUT.y2) / 2;

// -- Sub-components ----------------------------------------------------------

function SmallCylinder({
  width,
  height,
  shapes,
}: {
  width: number;
  height: number;
  shapes: ShapeState[];
}) {
  const ry = 4;
  const rx = width / 2 - 1;
  const cx = width / 2;
  const top = ry + 1;
  const bottom = height - ry - 1;
  return (
    <div className="relative" style={{ width, height }}>
      <svg
        width={width}
        height={height}
        className="absolute inset-0"
        fill="none"
      >
        <path
          d={`M ${cx - rx} ${top} L ${cx - rx} ${bottom} A ${rx} ${ry} 0 0 0 ${cx + rx} ${bottom} L ${cx + rx} ${top}`}
          fill="white"
          stroke="#e5e7eb"
        />
        <ellipse
          cx={cx}
          cy={top}
          rx={rx}
          ry={ry}
          fill="white"
          stroke="#e5e7eb"
        />
      </svg>
      <div
        className="relative z-10 flex items-center justify-center gap-1"
        style={{ height }}
      >
        <AnimatePresence>
          {shapes.map((s, i) => (
            <motion.div
              key={`${i}-${s.color}-${s.form}`}
              style={{
                width: BAR_H - 8,
                height: BAR_H - 8,
                backgroundColor: s.color,
                borderRadius: s.form === 'circle' ? '50%' : '2px',
              }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.3 }}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

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

function PendingMutsBar({ muts }: { muts: ShapeState[] }) {
  return (
    <div
      className="flex items-center justify-center gap-1 rounded border border-gray-300 bg-white"
      style={{ height: BAR_H, width: COL_W }}
    >
      <AnimatePresence>
        {muts.map((mut, i) => (
          <motion.div
            key={`${i}-${mut.color}-${mut.form}`}
            style={{
              width: BAR_H - 8,
              height: BAR_H - 8,
              backgroundColor: mut.color,
              borderRadius: mut.form === 'circle' ? '50%' : '2px',
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function OfflineClientColumn({ state }: { state: ClientState }) {
  const shape = shapeDisplay(state);
  return (
    <div className="flex flex-col items-center" style={{ width: COL_W }}>
      <p className="mb-1 self-start text-sm text-gray-500">Server Result</p>
      <ShapeLayerBar shape={state.serverUpdate} />
      <p className="mt-2 mb-1 self-start text-sm text-gray-500">
        Pending Mutations
      </p>
      <PendingMutsBar muts={state.pendingMuts} />
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
      <p className="mt-2 text-base text-gray-500">Alyssa</p>
    </div>
  );
}

function TravelingShape({
  x1,
  y1,
  x2,
  y2,
  color,
  form = 'circle',
  delay = 0,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  form?: ShapeForm;
  delay?: number;
}) {
  if (form === 'square') {
    return (
      <motion.rect
        width={10}
        height={10}
        rx={1}
        fill={color}
        initial={{ x: x1 - 5, y: y1 - 5, opacity: 0 }}
        animate={{ x: x2 - 5, y: y2 - 5, opacity: [0, 1, 1, 0] }}
        transition={{ duration: 0.8, delay, ease: 'easeInOut' }}
      />
    );
  }
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

// -- Diagram -----------------------------------------------------------------

function Diagram({
  step,
  prevStep,
  stepIdx,
}: {
  step: Step;
  prevStep: Step;
  stepIdx: number;
}) {
  const [serverShapeVisual, setServerShapeVisual] = useState(step.serverShape);
  const [clientVisual, setClientVisual] = useState(step.client);
  const [idbVisual, setIdbVisual] = useState(step.idb);

  useEffect(() => {
    const hasIdbDot = step.dotToIdb != null;
    const hasSyncDots = step.syncDots.length > 0;

    if (!hasIdbDot && !hasSyncDots) {
      setServerShapeVisual(step.serverShape);
      setClientVisual(step.client);
      setIdbVisual(step.idb);
      return;
    }

    if (hasIdbDot) {
      setClientVisual(step.client);
      setServerShapeVisual(step.serverShape);
      setIdbVisual(prevStep.idb);

      const t1 = setTimeout(() => {
        setIdbVisual(step.idb);
      }, 800);

      return () => clearTimeout(t1);
    }

    // Sync step: everything delayed until animations complete
    setServerShapeVisual(prevStep.serverShape);
    setClientVisual(prevStep.client);
    setIdbVisual(prevStep.idb);

    const t1 = setTimeout(() => {
      setServerShapeVisual(step.serverShape);
    }, 800);

    const t2 = step.dotServerToClient
      ? setTimeout(() => {
          setClientVisual(step.client);
          setIdbVisual(step.idb);
        }, 1600)
      : undefined;

    return () => {
      clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [stepIdx]);

  return (
    <>
      {/* IndexedDB label */}
      <p
        className="absolute text-sm text-gray-500"
        style={{
          left: IDB_LEFT,
          top: IDB_TOP1 - 24,
          width: IDB_W,
          textAlign: 'center',
        }}
      >
        IndexedDB
      </p>

      {/* IDB: server result cylinder */}
      <div className="absolute" style={{ left: IDB_LEFT, top: IDB_TOP1 }}>
        <SmallCylinder
          width={IDB_W}
          height={IDB_ITEM_H}
          shapes={idbVisual.serverResult ? [idbVisual.serverResult] : []}
        />
      </div>

      {/* IDB: pending mutations cylinder */}
      <div className="absolute" style={{ left: IDB_LEFT, top: IDB_TOP2 }}>
        <SmallCylinder
          width={IDB_W}
          height={IDB_ITEM_H}
          shapes={idbVisual.pendingMuts}
        />
      </div>

      {/* Client */}
      <div className="absolute" style={{ left: CLIENT_LEFT, top: 0 }}>
        <OfflineClientColumn state={clientVisual} />
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
              borderRadius: serverShapeVisual.form === 'circle' ? '50%' : '4px',
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
        {/* Client -> Server edges (red when offline) */}
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
        {/* Client -> IDB edges */}
        <line
          {...EDGE_TO_IDB_SR}
          stroke="#d1d5db"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <line
          {...EDGE_TO_IDB_PM}
          stroke="#d1d5db"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />

        {/* Offline x at mutation edge midpoint */}
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

        {/* Dot: Client -> IDB pending muts cylinder */}
        <AnimatePresence>
          {step.dotToIdb && (
            <TravelingShape
              key={`idb-${stepIdx}`}
              {...EDGE_TO_IDB_PM}
              color={step.dotToIdb.color}
              form={step.dotToIdb.form}
            />
          )}
        </AnimatePresence>

        {/* Sync dots: Client -> Server */}
        <AnimatePresence>
          {step.syncDots.map((dot, i) => (
            <TravelingShape
              key={`sync${i}-${stepIdx}`}
              {...EDGE_MUT}
              color={dot.color}
              form={dot.form}
              delay={i * 0.15}
            />
          ))}
        </AnimatePresence>

        {/* Broadcast dot: Server -> Client */}
        <AnimatePresence>
          {step.dotServerToClient && (
            <TravelingShape
              key={`bc-${stepIdx}`}
              {...EDGE_BROADCAST}
              color={BLUE}
              form="square"
              delay={0.8}
            />
          )}
        </AnimatePresence>
      </svg>
    </>
  );
}

// -- Main component ----------------------------------------------------------

export function OfflinePersistenceWalkthrough() {
  return (
    <WalkthroughShell
      steps={STEPS}
      designWidth={DESIGN_W}
      designHeight={DESIGN_H}
    >
      {(props) => <Diagram {...props} />}
    </WalkthroughShell>
  );
}
