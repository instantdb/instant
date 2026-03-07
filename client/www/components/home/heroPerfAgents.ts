'use client';

export interface TrailPoint {
  x: number;
  y: number;
  time: number;
  isTurn?: boolean;
}

export interface Agent {
  x: number;
  y: number;
  dx: number;
  dy: number;
  trail: TrailPoint[];
  nextTurn: number;
  steps: number;
  isUser?: boolean;
  justTurned?: boolean;
}

export const NUM_AGENTS = 20;
export const SPEED = 0.45;
export const TRAIL_LIFETIME = 18_000;
export const TURN_MIN = 50;
export const TURN_MAX = 180;
export const CURSOR_RADIUS = 300;
export const CURSOR_ATTRACT = 0.12;

export const USER_COLOR = [99, 102, 241] as const;
export const AGENT_COLOR = [234, 88, 12] as const;

const DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

function randomDir(): [number, number] {
  return DIRS[Math.floor(Math.random() * DIRS.length)];
}

function perpendicularDir(dx: number, dy: number): [number, number] {
  if (dx !== 0) return Math.random() < 0.5 ? [0, 1] : [0, -1];
  return Math.random() < 0.5 ? [1, 0] : [-1, 0];
}

export function centerFade(x: number, width: number): number {
  const centerDist = Math.abs(x - width / 2) / (width / 2);
  if (centerDist < 0.55) return 0;
  const t = Math.min(1, (centerDist - 0.55) / 0.25);
  return t * t * (3 - 2 * t);
}

export function createAgent(
  width: number,
  height: number,
  side: 'left' | 'right',
): Agent {
  const [dx, dy] = randomDir();
  const edgeZone = width * 0.4;
  const x =
    side === 'left'
      ? Math.random() * edgeZone
      : width - Math.random() * edgeZone;

  return {
    x,
    y: Math.random() * height,
    dx,
    dy,
    trail: [],
    nextTurn: TURN_MIN + Math.random() * (TURN_MAX - TURN_MIN),
    steps: 0,
    justTurned: false,
  };
}

function wrapAgent(agent: Agent, width: number, height: number) {
  if (agent.x < -60) agent.x += width + 120;
  if (agent.x > width + 60) agent.x -= width + 120;
  if (agent.y < -60) agent.y += height + 120;
  if (agent.y > height + 60) agent.y -= height + 120;
}

export function stepAgent(agent: Agent, width: number, height: number) {
  const speed = agent.isUser ? SPEED * 1.15 : SPEED;
  agent.justTurned = false;
  agent.x += agent.dx * speed;
  agent.y += agent.dy * speed;
  agent.steps += 1;

  wrapAgent(agent, width, height);

  if (agent.steps >= agent.nextTurn) {
    const [nextDx, nextDy] =
      Math.random() < 0.85 ? perpendicularDir(agent.dx, agent.dy) : randomDir();

    agent.dx = nextDx;
    agent.dy = nextDy;
    agent.steps = 0;
    agent.nextTurn = TURN_MIN + Math.random() * (TURN_MAX - TURN_MIN);
    agent.justTurned = true;
  }
}

export function stepUserAgent(
  agent: Agent,
  width: number,
  height: number,
  mouseX: number,
  mouseY: number,
  hasMouse: boolean,
) {
  const speed = SPEED * 1.15;
  agent.justTurned = false;
  agent.x += agent.dx * speed;
  agent.y += agent.dy * speed;
  agent.steps += 1;

  wrapAgent(agent, width, height);

  if (agent.steps < agent.nextTurn) return;

  if (hasMouse) {
    const options: [number, number][] =
      agent.dx !== 0
        ? [
            [0, 1],
            [0, -1],
          ]
        : [
            [1, 0],
            [-1, 0],
          ];

    const lookAhead = 60;
    let best = options[0];
    let bestDistance = Infinity;

    for (const [dx, dy] of options) {
      const distance = Math.hypot(
        agent.x + dx * lookAhead - mouseX,
        agent.y + dy * lookAhead - mouseY,
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        best = [dx, dy];
      }
    }

    agent.dx = best[0];
    agent.dy = best[1];
  } else {
    const [nextDx, nextDy] =
      Math.random() < 0.85 ? perpendicularDir(agent.dx, agent.dy) : randomDir();

    agent.dx = nextDx;
    agent.dy = nextDy;
  }

  agent.steps = 0;
  agent.nextTurn = TURN_MIN * 0.5 + Math.random() * (TURN_MAX - TURN_MIN) * 0.5;
  agent.justTurned = true;
}

export function applyCursorAttraction(
  agent: Agent,
  mouseX: number,
  mouseY: number,
  hasMouse: boolean,
) {
  if (!hasMouse) return;

  const dx = mouseX - agent.x;
  const dy = mouseY - agent.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= CURSOR_RADIUS || distance <= 1) return;

  const pull = (1 - distance / CURSOR_RADIUS) * CURSOR_ATTRACT;
  agent.x += (dx / distance) * pull;
  agent.y += (dy / distance) * pull;
}

export function initAgents(
  width: number,
  height: number,
  preFrames = 220,
): Agent[] {
  const agents = Array.from({ length: NUM_AGENTS }, (_, index) =>
    createAgent(width, height, index % 2 === 0 ? 'left' : 'right'),
  );
  agents[0].isUser = true;

  const now = performance.now();
  for (let frame = 0; frame < preFrames; frame += 1) {
    const time = now - (preFrames - frame) * 33;
    for (const agent of agents) {
      stepAgent(agent, width, height);
      agent.trail.push({
        x: agent.x,
        y: agent.y,
        time,
        isTurn: agent.justTurned,
      });
    }
  }

  return agents;
}

export function trimTrail(
  trail: TrailPoint[],
  now: number,
  maxPoints: number,
  lifetime = TRAIL_LIFETIME,
) {
  let cutoff = 0;
  while (cutoff < trail.length && now - trail[cutoff].time > lifetime) {
    cutoff += 1;
  }

  if (cutoff > 0) {
    trail.splice(0, cutoff);
  }

  if (trail.length > maxPoints) {
    trail.splice(0, trail.length - maxPoints);
  }
}
