import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LogoIcon } from '@/components/ui';
import {
  type BallColor,
  type ClientState,
  type MutDot,
  GRAY,
  BLUE,
  RED,
  COL_W,
  BAR_H,
  BOX_H,
  GAP,
  ClientColumn,
  MutationDot,
  TravelingDot,
} from './walkthrough-utils';
import { WalkthroughShell } from './WalkthroughShell';

// -- Step definitions --------------------------------------------------------

interface Step {
  title: string;
  description: string;
  client: ClientState;
  serverBall: BallColor;
  mutDot: MutDot | null;
  dotServerToClient: BallColor | null;
  rejection: boolean;
}

const STEPS: Step[] = [
  {
    title: 'Alyssa sees a grey ball',
    description:
      'Alyssa has a browser open and sees a grey ball. What happens when she changes the color?',
    client: { serverUpdate: GRAY, pendingMut: null },
    serverBall: GRAY,
    mutDot: null,
    dotServerToClient: null,
    rejection: false,
  },
  {
    title: 'Alyssa paints blue',
    description:
      "If Alyssa changes the color we'll immediately add a pending mutation. Alyssa sees the ball become blue without having to wait for the server.",
    client: { serverUpdate: GRAY, pendingMut: BLUE },
    serverBall: GRAY,
    mutDot: { color: BLUE, position: 'waiting' },
    dotServerToClient: null,
    rejection: false,
  },
  {
    title: 'Server accepts blue',
    description:
      'When the server accepts, it will send a new "blue" result back. The pending mutation will clear and the ball says blue, this time backed by the server.',
    client: { serverUpdate: BLUE, pendingMut: null },
    serverBall: BLUE,
    mutDot: { color: BLUE, position: 'server' },
    dotServerToClient: BLUE,
    rejection: false,
  },
  {
    title: 'Alyssa paints red',
    description:
      'Now Alyssa changes the color to red. She sees it right away, sends it to the server...but the server rejects it. What happens?',
    client: { serverUpdate: BLUE, pendingMut: RED },
    serverBall: BLUE,
    mutDot: { color: RED, position: 'waiting' },
    dotServerToClient: null,
    rejection: false,
  },
  {
    title: 'Server rejects',
    description:
      'If the server rejects the mutation, we can remove it from Alyssa\'s pending queue. Alyssa will then see blue (the last confirmed color) automaticaly.',
    client: { serverUpdate: BLUE, pendingMut: null },
    serverBall: BLUE,
    mutDot: { color: RED, position: 'gone' },
    dotServerToClient: null,
    rejection: true,
  },
];

// -- Layout constants --------------------------------------------------------

const DESIGN_W = 400;

const BAR1_TOP = 24;
const BAR1_CY = BAR1_TOP + BAR_H / 2;
const BAR2_TOP = BAR1_TOP + BAR_H + 28;
const BAR2_CY = BAR2_TOP + BAR_H / 2;
const BOX_TOP = BAR2_TOP + BAR_H + GAP;

const CLIENT_LEFT = 20;
const SERVER_LEFT = DESIGN_W - COL_W - 20;
const SERVER_CX = SERVER_LEFT + COL_W / 2;
const SERVER_BALL_CY = BOX_TOP + BOX_H / 2 + 10;

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
const EDGE_REJECTION = {
  x1: EDGE_MUT.x2,
  y1: EDGE_MUT.y2,
  x2: EDGE_MUT.x1,
  y2: EDGE_MUT.y1,
};
const CLIENT_PENDING_POS = { cx: EDGE_MUT.x1, cy: EDGE_MUT.y1 };
const CLIENT_WAIT_POS = { cx: EDGE_MUT.x2, cy: EDGE_MUT.y2 };

// -- Sub-components ----------------------------------------------------------

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
  const hasDotEntering =
    step.mutDot?.position === 'server' || step.mutDot?.position === 'gone';
  const hasBroadcast = step.dotServerToClient != null || step.rejection;

  const [serverBallVisual, setServerBallVisual] = useState(step.serverBall);
  const [clientVisual, setClientVisual] = useState(step.client);
  const [serverRejecting, setServerRejecting] = useState(false);

  useEffect(() => {
    setServerRejecting(false);

    if (!hasDotEntering) {
      setServerBallVisual(step.serverBall);
      setClientVisual(step.client);
      return;
    }

    setServerBallVisual(prevStep.serverBall);
    setClientVisual(prevStep.client);

    const t1 = setTimeout(() => {
      setServerBallVisual(step.serverBall);
      if (step.rejection) {
        setServerRejecting(true);
      }
      if (!hasBroadcast) {
        setClientVisual(step.client);
      }
    }, 800);

    const tReject = step.rejection
      ? setTimeout(() => {
          setServerRejecting(false);
        }, 1000)
      : undefined;

    const t2 = hasBroadcast
      ? setTimeout(() => {
          setClientVisual(step.client);
        }, 1600)
      : undefined;

    return () => {
      clearTimeout(t1);
      if (tReject) clearTimeout(tReject);
      if (t2) clearTimeout(t2);
    };
  }, [stepIdx]);

  return (
    <>
      {/* Alyssa */}
      <div className="absolute" style={{ left: CLIENT_LEFT, top: 0 }}>
        <ClientColumn name="Alyssa" state={clientVisual} />
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
            animate={{
              backgroundColor: serverRejecting ? RED : serverBallVisual,
              x: serverRejecting ? [0, -3, 3, -3, 0] : 0,
            }}
            transition={serverRejecting ? { duration: 0.2 } : { duration: 0.4 }}
          />
        </div>
      </div>

      {/* SVG overlay for edges + animated dots */}
      <svg
        className="pointer-events-none absolute inset-0"
        width={DESIGN_W}
        height={DESIGN_H}
      >
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

        {step.mutDot && (
          <MutationDot
            key={`mut-${step.mutDot.color}`}
            dot={step.mutDot}
            pendingPos={CLIENT_PENDING_POS}
            waitPos={CLIENT_WAIT_POS}
            serverPos={{ cx: SERVER_CX, cy: SERVER_BALL_CY }}
          />
        )}

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
    </>
  );
}

// -- Main component ----------------------------------------------------------

export function OptimisticUpdateDiagram() {
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
