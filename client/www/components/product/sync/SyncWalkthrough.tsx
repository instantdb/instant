import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

// -- Step definitions --------------------------------------------------------

type BallColor = '#d1d5db' | '#3b82f6' | '#ef4444';

const GRAY: BallColor = '#d1d5db';
const BLUE: BallColor = '#3b82f6';
const RED: BallColor = '#ef4444';

interface ClientState {
  serverUpdate: BallColor | null;
  pendingMut: BallColor | null;
}

interface Step {
  title: string;
  description: string;
  alice: ClientState;
  bob: ClientState;
  serverBall: BallColor;
  /** Dot traveling from Alice's pending bar toward server edge */
  dotAliceToServer: BallColor | null;
  /** Dot traveling from Bob's pending bar toward server edge */
  dotBobToServer: BallColor | null;
  /** Circles waiting at the server edge (parked, not yet accepted) */
  aliceWaiting: BallColor | null;
  bobWaiting: BallColor | null;
  /** Dot entering server from left (Alice's mutation accepted) */
  dotEnterFromAlice: BallColor | null;
  /** Dot entering server from right (Bob's mutation accepted) */
  dotEnterFromBob: BallColor | null;
  /** Dot from server → Alice's server-result bar */
  dotServerToAlice: BallColor | null;
  /** Dot from server → Bob's server-result bar */
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
    dotAliceToServer: null,
    dotBobToServer: null,
    aliceWaiting: null,
    bobWaiting: null,
    dotEnterFromAlice: null,
    dotEnterFromBob: null,
    dotServerToAlice: null,
    dotServerToBob: null,
  },
  {
    title: 'Both paint at the same time',
    description:
      'Alice paints blue, Bob paints red. Both see their color instantly via pending mutations. Both changes fly to the server.',
    alice: { serverUpdate: GRAY, pendingMut: BLUE },
    bob: { serverUpdate: GRAY, pendingMut: RED },
    serverBall: GRAY,
    dotAliceToServer: BLUE,
    dotBobToServer: RED,
    aliceWaiting: BLUE,
    bobWaiting: RED,
    dotEnterFromAlice: null,
    dotEnterFromBob: null,
    dotServerToAlice: null,
    dotServerToBob: null,
  },
  {
    title: "Bob's red arrives first",
    description:
      "Red enters the server. Server turns red and broadcasts to both. Alice's server-result turns red — but her pending blue sits on top, so her ball stays blue.",
    alice: { serverUpdate: RED, pendingMut: BLUE },
    bob: { serverUpdate: RED, pendingMut: null },
    serverBall: RED,
    dotAliceToServer: null,
    dotBobToServer: null,
    aliceWaiting: BLUE,
    bobWaiting: null,
    dotEnterFromAlice: null,
    dotEnterFromBob: RED,
    dotServerToAlice: RED,
    dotServerToBob: null,
  },
  {
    title: "Alice's blue arrives",
    description:
      "Blue enters the server. Server turns blue (last-write-wins) and broadcasts to Bob. Both clients converge on blue.",
    alice: { serverUpdate: BLUE, pendingMut: null },
    bob: { serverUpdate: BLUE, pendingMut: null },
    serverBall: BLUE,
    dotAliceToServer: null,
    dotBobToServer: null,
    aliceWaiting: null,
    bobWaiting: null,
    dotEnterFromAlice: BLUE,
    dotEnterFromBob: null,
    dotServerToAlice: null,
    dotServerToBob: BLUE,
  },
];

// -- Layout constants --------------------------------------------------------

const VB_W = 520;

// Client column dimensions
const COL_W = 130;
const BAR_H = 18;
const BAR_RX = 4;
const BOX_H = 110;
const BALL_R = 22;

// Vertical positions (shared by Alice & Bob columns)
const LABEL1_Y = 10;
const BAR1_Y = 20;
const BAR1_CY = BAR1_Y + BAR_H / 2;
const LABEL2_Y = BAR1_Y + BAR_H + 14;
const BAR2_Y = LABEL2_Y + 10;
const BAR2_CY = BAR2_Y + BAR_H / 2;
const BOX_Y = BAR2_Y + BAR_H + 10;
const BALL_CY = BOX_Y + BOX_H / 2;
const NAME_Y = BOX_Y + BOX_H + 14;
const VB_H = NAME_Y + 8;

// Alice column
const AX = 10;

// Server
const SX = (VB_W - COL_W) / 2;
const SY = BOX_Y;
const SERVER_CX = SX + COL_W / 2;
const SERVER_BALL_CY = SY + BOX_H / 2 + 10;

// Bob column
const BX = VB_W - COL_W - 10;

// -- Edge endpoints ----------------------------------------------------------

// Alice pending bar → Server (outgoing mutation)
const EDGE_AP = {
  x1: AX + COL_W,
  y1: BAR2_CY,
  x2: SX,
  y2: SY + BOX_H / 3,
};

// Server → Alice server-result bar (incoming broadcast)
const EDGE_SA = {
  x1: SX,
  y1: SY + BOX_H / 5,
  x2: AX + COL_W,
  y2: BAR1_CY,
};

// Bob pending bar → Server (outgoing mutation)
const EDGE_BP = {
  x1: BX,
  y1: BAR2_CY,
  x2: SX + COL_W,
  y2: SY + BOX_H / 3,
};

// Server → Bob server-result bar (incoming broadcast)
const EDGE_SB = {
  x1: SX + COL_W,
  y1: SY + BOX_H / 5,
  x2: BX,
  y2: BAR1_CY,
};

// Waiting circle positions (at the server edge of each pending→server line)
const ALICE_WAIT = { cx: EDGE_AP.x2, cy: EDGE_AP.y2 };
const BOB_WAIT = { cx: EDGE_BP.x2, cy: EDGE_BP.y2 };

// -- Sub-components ----------------------------------------------------------

function TravelingDot({
  x1,
  y1,
  x2,
  y2,
  color,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: BallColor;
}) {
  return (
    <motion.circle
      r={5}
      fill={color}
      initial={{ cx: x1, cy: y1, opacity: 0 }}
      animate={{ cx: x2, cy: y2, opacity: [0, 1, 1, 0] }}
      transition={{ duration: 0.8, ease: 'easeInOut' }}
    />
  );
}

function WaitingDot({
  cx,
  cy,
  color,
}: {
  cx: number;
  cy: number;
  color: BallColor;
}) {
  return (
    <motion.circle
      r={5}
      fill={color}
      cx={cx}
      cy={cy}
      initial={{ opacity: 0, scale: 0.3 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.3 }}
      transition={{ duration: 0.3 }}
    />
  );
}

function EdgeLine({
  x1,
  y1,
  x2,
  y2,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="#d1d5db"
      strokeWidth={1.5}
      strokeDasharray="4 3"
    />
  );
}

function LayerBar({
  x,
  y,
  color,
}: {
  x: number;
  y: number;
  color: BallColor | null;
}) {
  const circleR = BAR_H / 2 - 3;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={COL_W}
        height={BAR_H}
        rx={BAR_RX}
        fill="white"
        stroke="#d1d5db"
        strokeWidth={1.5}
        strokeDasharray="0"
      />
      <AnimatePresence>
        {color && (
          <motion.circle
            key="dot"
            cx={x + COL_W / 2}
            cy={y + BAR_H / 2}
            r={circleR}
            fill={color}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>
    </g>
  );
}

function ClientColumn({
  x,
  name,
  state,
}: {
  x: number;
  name: string;
  state: ClientState;
}) {
  const ball = ballColor(state);

  return (
    <g>
      {/* Server Result layer */}
      <text
        x={x}
        y={LABEL1_Y}
        className="text-[12px] font-medium"
        fill="#9ca3af"
      >
        Server Result
      </text>
      <LayerBar x={x} y={BAR1_Y} color={state.serverUpdate} />

      {/* Pending Mutations layer */}
      <text
        x={x}
        y={LABEL2_Y}
        className="text-[12px] font-medium"
        fill="#9ca3af"
      >
        Pending Mutations
      </text>
      <LayerBar x={x} y={BAR2_Y} color={state.pendingMut} />

      {/* Device box */}
      <rect
        x={x}
        y={BOX_Y}
        width={COL_W}
        height={BOX_H}
        rx={8}
        fill="white"
        stroke="#e5e7eb"
        strokeWidth={1.5}
      />

      {/* Ball */}
      <motion.circle
        cx={x + COL_W / 2}
        cy={BALL_CY}
        r={BALL_R}
        animate={{ fill: ball }}
        transition={{ duration: 0.4 }}
        stroke="#e5e7eb"
        strokeWidth={1}
      />

      {/* Name */}
      <text
        x={x + COL_W / 2}
        y={NAME_Y}
        textAnchor="middle"
        className="text-[13px] font-medium"
        fill="#6b7280"
      >
        {name}
      </text>
    </g>
  );
}

// -- Main component ----------------------------------------------------------

export function SyncWalkthrough() {
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  return (
    <div className="mt-4 rounded-lg border bg-gray-50 p-5">
      {/* SVG diagram */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="mx-auto block w-full max-w-[520px]"
          role="img"
          aria-label="Sync walkthrough diagram"
        >
          {/* Edges */}
          <EdgeLine {...EDGE_AP} />
          <EdgeLine {...EDGE_SA} />
          <EdgeLine {...EDGE_BP} />
          <EdgeLine {...EDGE_SB} />

          {/* Alice */}
          <ClientColumn x={AX} name="Alice" state={step.alice} />

          {/* Server */}
          <rect
            x={SX}
            y={SY}
            width={COL_W}
            height={BOX_H}
            rx={8}
            fill="white"
            stroke="#e5e7eb"
            strokeWidth={1.5}
          />
          <text
            x={SERVER_CX}
            y={SY + 18}
            textAnchor="middle"
            className="text-[13px] font-medium"
            fill="#6b7280"
          >
            Server
          </text>
          <motion.circle
            cx={SERVER_CX}
            cy={SERVER_BALL_CY}
            r={18}
            animate={{ fill: step.serverBall }}
            transition={{ duration: 0.4 }}
            stroke="#e5e7eb"
            strokeWidth={1}
          />

          {/* Bob */}
          <ClientColumn x={BX} name="Bob" state={step.bob} />

          {/* Dots traveling from pending bars to server edges */}
          <AnimatePresence>
            {step.dotAliceToServer && (
              <TravelingDot
                key={`ap-${stepIdx}`}
                {...EDGE_AP}
                color={step.dotAliceToServer}
              />
            )}
            {step.dotBobToServer && (
              <TravelingDot
                key={`bp-${stepIdx}`}
                {...EDGE_BP}
                color={step.dotBobToServer}
              />
            )}
          </AnimatePresence>

          {/* Waiting dots at server edges */}
          <AnimatePresence>
            {step.aliceWaiting && (
              <WaitingDot
                key="alice-wait"
                {...ALICE_WAIT}
                color={step.aliceWaiting}
              />
            )}
            {step.bobWaiting && (
              <WaitingDot
                key="bob-wait"
                {...BOB_WAIT}
                color={step.bobWaiting}
              />
            )}
          </AnimatePresence>

          {/* Dots entering server */}
          <AnimatePresence>
            {step.dotEnterFromAlice && (
              <TravelingDot
                key={`enter-a-${stepIdx}`}
                x1={ALICE_WAIT.cx}
                y1={ALICE_WAIT.cy}
                x2={SERVER_CX}
                y2={SERVER_BALL_CY}
                color={step.dotEnterFromAlice}
              />
            )}
            {step.dotEnterFromBob && (
              <TravelingDot
                key={`enter-b-${stepIdx}`}
                x1={BOB_WAIT.cx}
                y1={BOB_WAIT.cy}
                x2={SERVER_CX}
                y2={SERVER_BALL_CY}
                color={step.dotEnterFromBob}
              />
            )}
          </AnimatePresence>

          {/* Dots broadcasting from server to client server-result bars */}
          <AnimatePresence>
            {step.dotServerToAlice && (
              <TravelingDot
                key={`sa-${stepIdx}`}
                {...EDGE_SA}
                color={step.dotServerToAlice}
              />
            )}
            {step.dotServerToBob && (
              <TravelingDot
                key={`sb-${stepIdx}`}
                {...EDGE_SB}
                color={step.dotServerToBob}
              />
            )}
          </AnimatePresence>
        </svg>
      </div>

      {/* Step indicator + nav */}
      <div className="mt-4 flex items-center justify-between">
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
