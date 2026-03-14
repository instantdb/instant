import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
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
  alice: ClientState;
  bob: ClientState;
  serverBall: BallColor;
  aliceDot: MutDot | null;
  bobDot: MutDot | null;
  dotServerToAlice: BallColor | null;
  dotServerToBob: BallColor | null;
}

function ballColor(c: ClientState): BallColor {
  return c.pendingMut ?? c.serverUpdate ?? GRAY;
}

const STEPS: Step[] = [
  {
    title: 'Two clients, one ball',
    description:
      'Alice and Bob both see the same gray ball, connected to the server.',
    alice: { serverUpdate: GRAY, pendingMut: null },
    bob: { serverUpdate: GRAY, pendingMut: null },
    serverBall: GRAY,
    aliceDot: null,
    bobDot: null,
    dotServerToAlice: null,
    dotServerToBob: null,
  },
  {
    title: 'A conflict arises',
    description:
      'Alice paints blue, Bob paints red — at the same time. Both see their own color instantly. Both changes fly to the server. Who wins?',
    alice: { serverUpdate: GRAY, pendingMut: BLUE },
    bob: { serverUpdate: GRAY, pendingMut: RED },
    serverBall: GRAY,
    aliceDot: { color: BLUE, position: 'waiting' },
    bobDot: { color: RED, position: 'waiting' },
    dotServerToAlice: null,
    dotServerToBob: null,
  },
  {
    title: "Bob's red arrives first",
    description:
      "The server accepts red and broadcasts it. Alice receives the update — but her pending blue sits on top, so she still sees blue.",
    alice: { serverUpdate: RED, pendingMut: BLUE },
    bob: { serverUpdate: RED, pendingMut: null },
    serverBall: RED,
    aliceDot: { color: BLUE, position: 'waiting' },
    bobDot: { color: RED, position: 'server' },
    dotServerToAlice: RED,
    dotServerToBob: RED,
  },
  {
    title: 'Conflict resolved',
    description:
      "Alice's blue arrives. The server applies last-write-wins — blue replaces red. Both clients converge on blue. The conflict is resolved automatically.",
    alice: { serverUpdate: BLUE, pendingMut: null },
    bob: { serverUpdate: BLUE, pendingMut: null },
    serverBall: BLUE,
    aliceDot: { color: BLUE, position: 'server' },
    bobDot: null,
    dotServerToAlice: BLUE,
    dotServerToBob: BLUE,
  },
];

// -- Design-size layout constants (px at 520px design width) -----------------

const DESIGN_W = 520;
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
const A_LEFT = 10;
const S_LEFT = (DESIGN_W - COL_W) / 2;
const B_LEFT = DESIGN_W - COL_W - 10;
const S_CX = S_LEFT + COL_W / 2;
const SERVER_BALL_CY = BOX_TOP + BOX_H / 2 + 10;

const DESIGN_H = BOX_TOP + BOX_H + 28;

// Edge endpoints (in design-px, used by SVG overlay)
const EDGE_AP = { x1: A_LEFT + COL_W, y1: BAR2_CY, x2: S_LEFT, y2: BOX_TOP + BOX_H / 3 };
const EDGE_SA = { x1: S_LEFT, y1: BOX_TOP + BOX_H / 5, x2: A_LEFT + COL_W, y2: BAR1_CY };
const EDGE_BP = { x1: B_LEFT, y1: BAR2_CY, x2: S_LEFT + COL_W, y2: BOX_TOP + BOX_H / 3 };
const EDGE_SB = { x1: S_LEFT + COL_W, y1: BOX_TOP + BOX_H / 5, x2: B_LEFT, y2: BAR1_CY };
const ALICE_PENDING = { cx: EDGE_AP.x1, cy: EDGE_AP.y1 };
const ALICE_WAIT = { cx: EDGE_AP.x2, cy: EDGE_AP.y2 };
const BOB_PENDING = { cx: EDGE_BP.x1, cy: EDGE_BP.y1 };
const BOB_WAIT = { cx: EDGE_BP.x2, cy: EDGE_BP.y2 };

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
            style={{ width: BAR_H - 8, height: BAR_H - 8, backgroundColor: color }}
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
      <p className="mb-1 self-start text-sm text-gray-500">
        Server Result
      </p>
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
  const pos = dot.position === 'pending' ? pendingPos
    : dot.position === 'waiting' ? waitPos
    : dot.position === 'server' ? serverPos
    : waitPos;

  return (
    <motion.circle
      r={5}
      fill={dot.color}
      initial={{ cx: pendingPos.cx, cy: pendingPos.cy, opacity: 0 }}
      animate={{ cx: pos.cx, cy: pos.cy, opacity: dot.position === 'gone' ? 0 : 1 }}
      transition={{ duration: 0.8, ease: 'easeInOut' }}
    />
  );
}

function TravelingDot({
  x1, y1, x2, y2, color, delay = 0,
}: {
  x1: number; y1: number; x2: number; y2: number; color: BallColor; delay?: number;
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

export function ConflictResolutionWalkthrough() {
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];
  const prevStep = STEPS[Math.max(0, stepIdx - 1)];

  // Delayed visual state: server ball and client states wait for dots to arrive
  const hasDotEntering = step.bobDot?.position === 'server' || step.aliceDot?.position === 'server';
  const hasBroadcast = step.dotServerToAlice != null || step.dotServerToBob != null;

  const [serverBallVisual, setServerBallVisual] = useState(step.serverBall);
  const [aliceVisual, setAliceVisual] = useState(step.alice);
  const [bobVisual, setBobVisual] = useState(step.bob);

  useEffect(() => {
    if (!hasDotEntering) {
      // No dot entering server — apply immediately
      setServerBallVisual(step.serverBall);
      setAliceVisual(step.alice);
      setBobVisual(step.bob);
      return;
    }

    // Start with previous step's state
    setServerBallVisual(prevStep.serverBall);
    setAliceVisual(prevStep.alice);
    setBobVisual(prevStep.bob);

    // After dot enters server (0.8s), update server ball
    const t1 = setTimeout(() => {
      setServerBallVisual(step.serverBall);
      if (!hasBroadcast) {
        setAliceVisual(step.alice);
        setBobVisual(step.bob);
      }
    }, 800);

    // After broadcast arrives (0.8s delay + 0.8s travel), update client states
    const t2 = hasBroadcast
      ? setTimeout(() => {
          setAliceVisual(step.alice);
          setBobVisual(step.bob);
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
      <div ref={outerRef} className="flex justify-center" style={{ height: DESIGN_H * scale }}>
        <div
          className="relative"
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transformOrigin: 'top center',
            transform: `scale(${scale})`,
          }}
        >
          {/* Alice */}
          <div className="absolute" style={{ left: A_LEFT, top: 0 }}>
            <ClientColumn name="Alice" state={aliceVisual} />
          </div>

          {/* Server */}
          <div
            className="absolute flex flex-col items-center"
            style={{ left: S_LEFT, top: BOX_TOP - 24, width: COL_W }}
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

          {/* Bob */}
          <div className="absolute" style={{ left: B_LEFT, top: 0 }}>
            <ClientColumn name="Bob" state={bobVisual} />
          </div>

          {/* SVG overlay for edges + animated dots */}
          <svg
            className="pointer-events-none absolute inset-0"
            width={DESIGN_W}
            height={DESIGN_H}
          >
            {/* Edge lines */}
            <line {...EDGE_AP} stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="4 3" />
            <line {...EDGE_SA} stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="4 3" />
            <line {...EDGE_BP} stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="4 3" />
            <line {...EDGE_SB} stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="4 3" />

            {/* Mutation dots (persistent per side, animate between positions) */}
            {step.aliceDot && (
              <MutationDot
                key="alice-dot"
                dot={step.aliceDot}
                pendingPos={ALICE_PENDING}
                waitPos={ALICE_WAIT}
                serverPos={{ cx: S_CX, cy: SERVER_BALL_CY }}
              />
            )}
            {step.bobDot && (
              <MutationDot
                key="bob-dot"
                dot={step.bobDot}
                pendingPos={BOB_PENDING}
                waitPos={BOB_WAIT}
                serverPos={{ cx: S_CX, cy: SERVER_BALL_CY }}
              />
            )}

            {/* Dots broadcasting from server */}
            <AnimatePresence>
              {step.dotServerToAlice && (
                <TravelingDot key={`sa-${stepIdx}`} {...EDGE_SA} color={step.dotServerToAlice} delay={0.8} />
              )}
              {step.dotServerToBob && (
                <TravelingDot key={`sb-${stepIdx}`} {...EDGE_SB} color={step.dotServerToBob} delay={0.8} />
              )}
            </AnimatePresence>
          </svg>
        </div>
      </div>

      {/* Step indicator + nav */}
      <div className="mt-4 flex items-center justify-between rounded-lg bg-white px-3 py-2 border border-gray-200">
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
          onClick={() =>
            setStepIdx((s) => Math.min(STEPS.length - 1, s + 1))
          }
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
