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
  alyssa: ClientState;
  louis: ClientState;
  serverBall: BallColor;
  alyssaDot: MutDot | null;
  louisDot: MutDot | null;
  dotServerToAlyssa: BallColor | null;
  dotServerToLouis: BallColor | null;
}

const STEPS: Step[] = [
  {
    title: 'Alyssa and Louis see a gray ball',
    description:
      "Alyssa and Louis both see the same gray ball, connected to the server. Let's see what happens if they change the color at the same time.",
    alyssa: { serverUpdate: GRAY, pendingMut: null },
    louis: { serverUpdate: GRAY, pendingMut: null },
    serverBall: GRAY,
    alyssaDot: null,
    louisDot: null,
    dotServerToAlyssa: null,
    dotServerToLouis: null,
  },
  {
    title: 'A conflict arises',
    description:
      'Alyssa paints blue, Louis paints red. Thanks to optimistic updates, both see their own color instantly. In the background their changes are sent over to the server. Now the question is who wins?',
    alyssa: { serverUpdate: GRAY, pendingMut: BLUE },
    louis: { serverUpdate: GRAY, pendingMut: RED },
    serverBall: GRAY,
    alyssaDot: { color: BLUE, position: 'waiting' },
    louisDot: { color: RED, position: 'waiting' },
    dotServerToAlyssa: null,
    dotServerToLouis: null,
  },
  {
    title: "Louis's red arrives first",
    description:
      "The server accepts red and broadcasts it. Alyssa receives the update, but notice how she still sees her ball as blue. The server hasn't accepted her pending mutation yet, so it sits on top of the server result.",
    alyssa: { serverUpdate: RED, pendingMut: BLUE },
    louis: { serverUpdate: RED, pendingMut: null },
    serverBall: RED,
    alyssaDot: { color: BLUE, position: 'waiting' },
    louisDot: { color: RED, position: 'server' },
    dotServerToAlyssa: RED,
    dotServerToLouis: RED,
  },
  {
    title: 'Conflict resolved',
    description:
      "Alyssa's blue arrives. The server applies last-write-wins, and the blue replaces red. Both Alyssa and Louis converge on blue. The conflict is resolved automatically.",
    alyssa: { serverUpdate: BLUE, pendingMut: null },
    louis: { serverUpdate: BLUE, pendingMut: null },
    serverBall: BLUE,
    alyssaDot: { color: BLUE, position: 'server' },
    louisDot: null,
    dotServerToAlyssa: BLUE,
    dotServerToLouis: BLUE,
  },
];

// -- Layout constants --------------------------------------------------------

const DESIGN_W = 520;

const BAR1_TOP = 24;
const BAR1_CY = BAR1_TOP + BAR_H / 2;
const BAR2_TOP = BAR1_TOP + BAR_H + 28;
const BAR2_CY = BAR2_TOP + BAR_H / 2;
const BOX_TOP = BAR2_TOP + BAR_H + GAP;

const A_LEFT = 10;
const S_LEFT = (DESIGN_W - COL_W) / 2;
const B_LEFT = DESIGN_W - COL_W - 10;
const S_CX = S_LEFT + COL_W / 2;
const SERVER_BALL_CY = BOX_TOP + BOX_H / 2 + 10;

const DESIGN_H = BOX_TOP + BOX_H + 28;

// Edge endpoints
const EDGE_AP = {
  x1: A_LEFT + COL_W,
  y1: BAR2_CY,
  x2: S_LEFT,
  y2: BOX_TOP + BOX_H / 3,
};
const EDGE_SA = {
  x1: S_LEFT,
  y1: BOX_TOP + BOX_H / 5,
  x2: A_LEFT + COL_W,
  y2: BAR1_CY,
};
const EDGE_BP = {
  x1: B_LEFT,
  y1: BAR2_CY,
  x2: S_LEFT + COL_W,
  y2: BOX_TOP + BOX_H / 3,
};
const EDGE_SB = {
  x1: S_LEFT + COL_W,
  y1: BOX_TOP + BOX_H / 5,
  x2: B_LEFT,
  y2: BAR1_CY,
};
const ALYSSA_PENDING = { cx: EDGE_AP.x1, cy: EDGE_AP.y1 };
const ALYSSA_WAIT = { cx: EDGE_AP.x2, cy: EDGE_AP.y2 };
const LOUIS_PENDING = { cx: EDGE_BP.x1, cy: EDGE_BP.y1 };
const LOUIS_WAIT = { cx: EDGE_BP.x2, cy: EDGE_BP.y2 };

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
    step.louisDot?.position === 'server' ||
    step.alyssaDot?.position === 'server';
  const hasBroadcast =
    step.dotServerToAlyssa != null || step.dotServerToLouis != null;

  const [serverBallVisual, setServerBallVisual] = useState(step.serverBall);
  const [alyssaVisual, setAlyssaVisual] = useState(step.alyssa);
  const [louisVisual, setLouisVisual] = useState(step.louis);

  useEffect(() => {
    if (!hasDotEntering) {
      setServerBallVisual(step.serverBall);
      setAlyssaVisual(step.alyssa);
      setLouisVisual(step.louis);
      return;
    }

    setServerBallVisual(prevStep.serverBall);
    setAlyssaVisual(prevStep.alyssa);
    setLouisVisual(prevStep.louis);

    const t1 = setTimeout(() => {
      setServerBallVisual(step.serverBall);
      if (!hasBroadcast) {
        setAlyssaVisual(step.alyssa);
        setLouisVisual(step.louis);
      }
    }, 800);

    const t2 = hasBroadcast
      ? setTimeout(() => {
          setAlyssaVisual(step.alyssa);
          setLouisVisual(step.louis);
        }, 1600)
      : undefined;

    return () => {
      clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [stepIdx]);

  return (
    <>
      {/* Alyssa */}
      <div className="absolute" style={{ left: A_LEFT, top: 0 }}>
        <ClientColumn name="Alyssa" state={alyssaVisual} />
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

      {/* Louis */}
      <div className="absolute" style={{ left: B_LEFT, top: 0 }}>
        <ClientColumn name="Louis" state={louisVisual} />
      </div>

      {/* SVG overlay for edges + animated dots */}
      <svg
        className="pointer-events-none absolute inset-0"
        width={DESIGN_W}
        height={DESIGN_H}
      >
        <line
          {...EDGE_AP}
          stroke="#d1d5db"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <line
          {...EDGE_SA}
          stroke="#d1d5db"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <line
          {...EDGE_BP}
          stroke="#d1d5db"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <line
          {...EDGE_SB}
          stroke="#d1d5db"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />

        {step.alyssaDot && (
          <MutationDot
            key="alyssa-dot"
            dot={step.alyssaDot}
            pendingPos={ALYSSA_PENDING}
            waitPos={ALYSSA_WAIT}
            serverPos={{ cx: S_CX, cy: SERVER_BALL_CY }}
          />
        )}
        {step.louisDot && (
          <MutationDot
            key="louis-dot"
            dot={step.louisDot}
            pendingPos={LOUIS_PENDING}
            waitPos={LOUIS_WAIT}
            serverPos={{ cx: S_CX, cy: SERVER_BALL_CY }}
          />
        )}

        <AnimatePresence>
          {step.dotServerToAlyssa && (
            <TravelingDot
              key={`sa-${stepIdx}`}
              {...EDGE_SA}
              color={step.dotServerToAlyssa}
              delay={0.8}
            />
          )}
          {step.dotServerToLouis && (
            <TravelingDot
              key={`sb-${stepIdx}`}
              {...EDGE_SB}
              color={step.dotServerToLouis}
              delay={0.8}
            />
          )}
        </AnimatePresence>
      </svg>
    </>
  );
}

// -- Main component ----------------------------------------------------------

export function ConflictResolutionWalkthrough() {
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
