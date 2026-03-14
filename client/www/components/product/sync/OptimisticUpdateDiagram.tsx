import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { LogoIcon } from '@/components/ui';

// -- Step definitions --------------------------------------------------------

type BallColor = '#d1d5db' | '#3b82f6' | '#ef4444';

const GRAY: BallColor = '#d1d5db';
const BLUE: BallColor = '#3b82f6';
const RED: BallColor = '#ef4444';

interface ClientState {
  serverUpdate: BallColor | null;
  pendingMut: BallColor | null;
}

type DotPosition = 'pending' | 'waiting' | 'server' | 'gone';

interface MutDot {
  color: BallColor;
  position: DotPosition;
}

interface Step {
  title: string;
  description: string;
  client: ClientState;
  serverBall: BallColor;
  mutDot: MutDot | null;
  /** Colored dot traveling server → client (acceptance) */
  dotServerToClient: BallColor | null;
  /** Red ✗ traveling server → client (rejection) */
  rejection: boolean;
}

function ballColor(c: ClientState): BallColor {
  return c.pendingMut ?? c.serverUpdate ?? GRAY;
}

const STEPS: Step[] = [
  {
    title: 'One client, one ball',
    description: 'The client sees a gray ball, connected to the server.',
    client: { serverUpdate: GRAY, pendingMut: null },
    serverBall: GRAY,
    mutDot: null,
    dotServerToClient: null,
    rejection: false,
  },
  {
    title: 'Client paints blue',
    description:
      'The user paints the ball blue. It shows up instantly as a pending mutation — no waiting for the server.',
    client: { serverUpdate: GRAY, pendingMut: BLUE },
    serverBall: GRAY,
    mutDot: { color: BLUE, position: 'waiting' },
    dotServerToClient: null,
    rejection: false,
  },
  {
    title: 'Server accepts',
    description:
      'The server confirms blue. It sends the new result back. The pending mutation clears — the ball stays blue, now backed by the server.',
    client: { serverUpdate: BLUE, pendingMut: null },
    serverBall: BLUE,
    mutDot: { color: BLUE, position: 'server' },
    dotServerToClient: BLUE,
    rejection: false,
  },
  {
    title: 'Client paints red',
    description:
      'The user paints red. It shows up instantly via the pending mutation. The mutation flies to the server…',
    client: { serverUpdate: BLUE, pendingMut: RED },
    serverBall: BLUE,
    mutDot: { color: RED, position: 'waiting' },
    dotServerToClient: null,
    rejection: false,
  },
  {
    title: 'Server rejects',
    description:
      'The server rejects the mutation and sends back an ✗. The pending mutation is removed and the ball reverts to blue — the last confirmed color.',
    client: { serverUpdate: BLUE, pendingMut: null },
    serverBall: BLUE,
    mutDot: { color: RED, position: 'gone' },
    dotServerToClient: null,
    rejection: true,
  },
];

// -- Design-size layout constants (px at 400px design width) -----------------

const DESIGN_W = 400;
const COL_W = 130;
const BAR_H = 20;
const BOX_H = 110;
const GAP = 10;

// Vertical positions
const BAR1_TOP = 24;
const BAR1_CY = BAR1_TOP + BAR_H / 2;
const BAR2_TOP = BAR1_TOP + BAR_H + 28;
const BAR2_CY = BAR2_TOP + BAR_H / 2;
const BOX_TOP = BAR2_TOP + BAR_H + GAP;

// Horizontal positions
const CLIENT_LEFT = 20;
const SERVER_LEFT = DESIGN_W - COL_W - 20;
const SERVER_CX = SERVER_LEFT + COL_W / 2;
const SERVER_BALL_CY = BOX_TOP + BOX_H / 2 + 10;

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
// Rejection edge: server → pending mutations bar (reverse of mutation path)
const EDGE_REJECTION = {
  x1: EDGE_MUT.x2,
  y1: EDGE_MUT.y2,
  x2: EDGE_MUT.x1,
  y2: EDGE_MUT.y1,
};
const CLIENT_PENDING_POS = { cx: EDGE_MUT.x1, cy: EDGE_MUT.y1 };
const CLIENT_WAIT_POS = { cx: EDGE_MUT.x2, cy: EDGE_MUT.y2 };

// -- Sub-components ----------------------------------------------------------

function LayerBar({ color }: { color: BallColor | null }) {
  return (
    <div
      className="flex items-center justify-center rounded border border-gray-300 bg-white"
      style={{ height: BAR_H, width: COL_W }}
    >
      <AnimatePresence>
        {color && (
          <motion.div
            key="dot"
            className="rounded-full"
            style={{
              width: BAR_H - 8,
              height: BAR_H - 8,
              backgroundColor: color,
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

function ClientColumn({ name, state }: { name: string; state: ClientState }) {
  const ball = ballColor(state);
  return (
    <div className="flex flex-col items-center" style={{ width: COL_W }}>
      <p className="mb-1 self-start text-sm text-gray-500">Server Result</p>
      <LayerBar color={state.serverUpdate} />
      <p className="mt-2 mb-1 self-start text-sm text-gray-500">
        Pending Mutations
      </p>
      <LayerBar color={state.pendingMut} />
      <div
        className="mt-2 flex items-center justify-center rounded-lg border border-gray-200 bg-white"
        style={{ width: COL_W, height: BOX_H }}
      >
        <motion.div
          className="rounded-full"
          style={{ width: 44, height: 44 }}
          animate={{ backgroundColor: ball }}
          transition={{ duration: 0.4 }}
        />
      </div>
      <p className="mt-2 text-base text-gray-500">{name}</p>
    </div>
  );
}

function MutationDot({
  dot,
  pendingPos,
  waitPos,
  serverPos,
}: {
  dot: MutDot;
  pendingPos: { cx: number; cy: number };
  waitPos: { cx: number; cy: number };
  serverPos: { cx: number; cy: number };
}) {
  const pos =
    dot.position === 'pending'
      ? pendingPos
      : dot.position === 'waiting'
        ? waitPos
        : dot.position === 'server'
          ? serverPos
          : serverPos; // 'gone': travel to server then fade out

  return (
    <motion.circle
      r={5}
      fill={dot.color}
      initial={{ cx: pendingPos.cx, cy: pendingPos.cy, opacity: 0 }}
      animate={{
        cx: pos.cx,
        cy: pos.cy,
        opacity: dot.position === 'gone' ? 0 : 1,
      }}
      transition={{ duration: 0.8, ease: 'easeInOut' }}
    />
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
  color: BallColor;
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

function RejectionDot({
  x1,
  y1,
  x2,
  y2,
  delay = 0,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  delay?: number;
}) {
  return (
    <motion.g>
      <motion.circle
        r={7}
        fill="#ef4444"
        initial={{ cx: x1, cy: y1, opacity: 0 }}
        animate={{ cx: x2, cy: y2, opacity: [0, 1, 1, 0] }}
        transition={{ duration: 0.8, delay, ease: 'easeInOut' }}
      />
      <motion.text
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize={10}
        fontWeight="bold"
        initial={{ x: x1, y: y1, opacity: 0 }}
        animate={{ x: x2, y: y2, opacity: [0, 1, 1, 0] }}
        transition={{ duration: 0.8, delay, ease: 'easeInOut' }}
      >
        ✗
      </motion.text>
    </motion.g>
  );
}

// -- Main component ----------------------------------------------------------

export function OptimisticUpdateDiagram() {
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];
  const prevStep = STEPS[Math.max(0, stepIdx - 1)];

  // Delayed visual state: server ball and client state wait for dots to arrive
  const hasDotEntering =
    step.mutDot?.position === 'server' || step.mutDot?.position === 'gone';
  const hasBroadcast = step.dotServerToClient != null || step.rejection;

  const [serverBallVisual, setServerBallVisual] = useState(step.serverBall);
  const [clientVisual, setClientVisual] = useState(step.client);

  useEffect(() => {
    if (!hasDotEntering) {
      setServerBallVisual(step.serverBall);
      setClientVisual(step.client);
      return;
    }

    // Start with previous step's state
    setServerBallVisual(prevStep.serverBall);
    setClientVisual(prevStep.client);

    // After dot enters server (0.8s), update server ball
    const t1 = setTimeout(() => {
      setServerBallVisual(step.serverBall);
      if (!hasBroadcast) {
        setClientVisual(step.client);
      }
    }, 800);

    // After broadcast/rejection arrives (0.8s delay + 0.8s travel), update client
    const t2 = hasBroadcast
      ? setTimeout(() => {
          setClientVisual(step.client);
        }, 1600)
      : undefined;

    return () => {
      clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [stepIdx]);

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
          {/* Client */}
          <div className="absolute" style={{ left: CLIENT_LEFT, top: 0 }}>
            <ClientColumn name="Client" state={clientVisual} />
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
                className="rounded-full"
                style={{ width: 36, height: 36 }}
                animate={{ backgroundColor: serverBallVisual }}
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
            {/* Edge lines */}
            <line
              {...EDGE_MUT}
              stroke="#d1d5db"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <line
              {...EDGE_BROADCAST}
              stroke="#d1d5db"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />

            {/* Mutation dot (keyed by color so a new dot mounts per mutation) */}
            {step.mutDot && (
              <MutationDot
                key={`mut-${step.mutDot.color}`}
                dot={step.mutDot}
                pendingPos={CLIENT_PENDING_POS}
                waitPos={CLIENT_WAIT_POS}
                serverPos={{ cx: SERVER_CX, cy: SERVER_BALL_CY }}
              />
            )}

            {/* Broadcast / rejection dots from server */}
            <AnimatePresence>
              {step.dotServerToClient && (
                <TravelingDot
                  key={`sc-${stepIdx}`}
                  {...EDGE_BROADCAST}
                  color={step.dotServerToClient}
                  delay={0.8}
                />
              )}
              {step.rejection && (
                <RejectionDot
                  key={`rej-${stepIdx}`}
                  {...EDGE_REJECTION}
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
            <p className="mt-0.5 text-base text-gray-500">{step.description}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
