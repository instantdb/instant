'use client';

import { useEffect, useRef } from 'react';

// --- Types ---

interface TrailPoint {
  x: number;
  y: number;
  time: number;
  isTurn?: boolean;
}

interface Agent {
  x: number;
  y: number;
  dx: number;
  dy: number;
  trail: TrailPoint[];
  nextTurn: number;
  steps: number;
  isUser?: boolean;
}

// --- Constants ---

const NUM_AGENTS = 20;
const SPEED = 0.8;
const TRAIL_LIFETIME = 18_000;
const TURN_MIN = 50;
const TURN_MAX = 180;
const CURSOR_RADIUS = 300;
const CURSOR_ATTRACT = 0.12;

// --- Helpers ---

const DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

function randomDir(): [number, number] {
  return DIRS[Math.floor(Math.random() * 4)];
}

function perpendicularDir(dx: number, dy: number): [number, number] {
  if (dx !== 0) return Math.random() < 0.5 ? [0, 1] : [0, -1];
  return Math.random() < 0.5 ? [1, 0] : [-1, 0];
}

function createAgent(w: number, h: number, side: 'left' | 'right'): Agent {
  const [dx, dy] = randomDir();
  // Spawn agents on their assigned side (outer 40% of each half)
  const edgeZone = w * 0.4;
  const x =
    side === 'left'
      ? Math.random() * edgeZone
      : w - Math.random() * edgeZone;
  return {
    x,
    y: Math.random() * h,
    dx,
    dy,
    trail: [],
    nextTurn: TURN_MIN + Math.random() * (TURN_MAX - TURN_MIN),
    steps: 0,
  };
}

// User agent color (blue/indigo)
const USER_COLOR = [99, 102, 241] as const; // indigo-500
const AGENT_COLOR = [234, 88, 12] as const; // orange-600

function stepAgent(agent: Agent, cw: number, ch: number) {
  const speed = agent.isUser ? SPEED * 1.15 : SPEED;
  agent.x += agent.dx * speed;
  agent.y += agent.dy * speed;
  agent.steps++;

  if (agent.x < -60) agent.x += cw + 120;
  if (agent.x > cw + 60) agent.x -= cw + 120;
  if (agent.y < -60) agent.y += ch + 120;
  if (agent.y > ch + 60) agent.y -= ch + 120;

  if (agent.steps >= agent.nextTurn) {
    if (agent.trail.length > 0) {
      agent.trail[agent.trail.length - 1].isTurn = true;
    }
    const [ndx, ndy] =
      Math.random() < 0.85 ? perpendicularDir(agent.dx, agent.dy) : randomDir();
    agent.dx = ndx;
    agent.dy = ndy;
    agent.steps = 0;
    agent.nextTurn = TURN_MIN + Math.random() * (TURN_MAX - TURN_MIN);
  }
}

/** Like stepAgent but biases turns toward the mouse cursor */
function stepUserAgent(
  agent: Agent,
  cw: number,
  ch: number,
  mx: number,
  my: number,
  hasMouse: boolean,
) {
  const speed = SPEED * 1.15;
  agent.x += agent.dx * speed;
  agent.y += agent.dy * speed;
  agent.steps++;

  if (agent.x < -60) agent.x += cw + 120;
  if (agent.x > cw + 60) agent.x -= cw + 120;
  if (agent.y < -60) agent.y += ch + 120;
  if (agent.y > ch + 60) agent.y -= ch + 120;

  if (agent.steps >= agent.nextTurn) {
    if (agent.trail.length > 0) {
      agent.trail[agent.trail.length - 1].isTurn = true;
    }

    if (hasMouse) {
      // Pick the perpendicular direction that moves closer to cursor
      const perps: [number, number][] =
        agent.dx !== 0
          ? [
              [0, 1],
              [0, -1],
            ]
          : [
              [1, 0],
              [-1, 0],
            ];

      const LOOK_AHEAD = 60;
      let bestDir = perps[0];
      let bestDist = Infinity;
      for (const [pdx, pdy] of perps) {
        const d = Math.sqrt(
          (agent.x + pdx * LOOK_AHEAD - mx) ** 2 +
            (agent.y + pdy * LOOK_AHEAD - my) ** 2,
        );
        if (d < bestDist) {
          bestDist = d;
          bestDir = [pdx, pdy];
        }
      }

      agent.dx = bestDir[0];
      agent.dy = bestDir[1];
    } else {
      const [ndx, ndy] =
        Math.random() < 0.85
          ? perpendicularDir(agent.dx, agent.dy)
          : randomDir();
      agent.dx = ndx;
      agent.dy = ndy;
    }

    agent.steps = 0;
    // Turn more frequently so it tracks the cursor responsively
    agent.nextTurn =
      TURN_MIN * 0.5 + Math.random() * (TURN_MAX - TURN_MIN) * 0.5;
  }
}

/** Sides-only fade: 0 in the center, 1 at the edges, smooth ramp between */
function centerFade(x: number, cw: number): number {
  const centerDist = Math.abs(x - cw / 2) / (cw / 2); // 0 at center, 1 at edges
  // Nothing in the center 55%, ramp up from 55-80%, full beyond 80%
  if (centerDist < 0.55) return 0;
  const t = Math.min(1, (centerDist - 0.55) / 0.25);
  // Smooth ease-in for a gentle appearance
  return t * t * (3 - 2 * t);
}

// --- Component ---

export function AgentPathsBgSoftCenter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let agents: Agent[] = [];
    const dpr = window.devicePixelRatio || 1;
    let cw = 0;
    let ch = 0;

    function resize() {
      const rect = container!.getBoundingClientRect();
      cw = rect.width;
      ch = rect.height;
      canvas!.width = cw * dpr;
      canvas!.height = ch * dpr;
      canvas!.style.width = cw + 'px';
      canvas!.style.height = ch + 'px';
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function init() {
      agents = Array.from({ length: NUM_AGENTS }, (_, i) =>
        createAgent(cw, ch, i % 2 === 0 ? 'left' : 'right'),
      );
      agents[0].isUser = true;

      // Pre-simulate so trails are visible on first paint
      const preFrames = 400;
      const now = performance.now();
      for (let f = 0; f < preFrames; f++) {
        const t = now - (preFrames - f) * 16;
        for (const agent of agents) {
          stepAgent(agent, cw, ch);
          agent.trail.push({ x: agent.x, y: agent.y, time: t });
        }
      }
    }

    function tick() {
      const now = performance.now();
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const hasMouse = mx > -1000;

      ctx!.clearRect(0, 0, cw, ch);

      // --- Atmospheric gradient wash (faded toward center) ---
      // Draw two side gradients instead of one centered one
      const sideWidth = cw * 0.4;

      // Left side wash
      const leftGrad = ctx!.createRadialGradient(
        0,
        ch * 0.35,
        0,
        0,
        ch * 0.35,
        sideWidth,
      );
      leftGrad.addColorStop(0, 'rgba(255, 237, 213, 0.35)');
      leftGrad.addColorStop(0.5, 'rgba(254, 215, 170, 0.12)');
      leftGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx!.fillStyle = leftGrad;
      ctx!.fillRect(0, 0, cw, ch);

      // Right side wash
      const rightGrad = ctx!.createRadialGradient(
        cw,
        ch * 0.35,
        0,
        cw,
        ch * 0.35,
        sideWidth,
      );
      rightGrad.addColorStop(0, 'rgba(255, 237, 213, 0.35)');
      rightGrad.addColorStop(0.5, 'rgba(254, 215, 170, 0.12)');
      rightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx!.fillStyle = rightGrad;
      ctx!.fillRect(0, 0, cw, ch);

      for (const agent of agents) {
        const [cr, cg2, cb] = agent.isUser ? USER_COLOR : AGENT_COLOR;

        // --- Move & turn ---
        if (agent.isUser) {
          stepUserAgent(agent, cw, ch, mx, my, hasMouse);
        } else {
          // Gentle cursor attraction for regular agents
          if (hasMouse) {
            const cdx = mx - agent.x;
            const cdy = my - agent.y;
            const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
            if (cdist < CURSOR_RADIUS && cdist > 1) {
              const pull = (1 - cdist / CURSOR_RADIUS) * CURSOR_ATTRACT;
              agent.x += (cdx / cdist) * pull;
              agent.y += (cdy / cdist) * pull;
            }
          }
          stepAgent(agent, cw, ch);
        }

        agent.trail.push({ x: agent.x, y: agent.y, time: now });
        agent.trail = agent.trail.filter((p) => now - p.time < TRAIL_LIFETIME);

        // --- Draw trail ---
        if (agent.trail.length < 2) continue;

        for (let i = 1; i < agent.trail.length; i++) {
          const p0 = agent.trail[i - 1];
          const p1 = agent.trail[i];

          if (Math.abs(p1.x - p0.x) > 100 || Math.abs(p1.y - p0.y) > 100)
            continue;

          const age = now - p1.time;
          const life = 1 - age / TRAIL_LIFETIME;

          // Boost near cursor
          const segX = (p0.x + p1.x) / 2;
          const segY = (p0.y + p1.y) / 2;
          const dCursor = hasMouse
            ? Math.sqrt((segX - mx) ** 2 + (segY - my) ** 2)
            : 9999;
          const cursorBoost =
            dCursor < CURSOR_RADIUS ? (1 - dCursor / CURSOR_RADIUS) * 0.35 : 0;

          const baseAlpha = agent.isUser ? 0.3 : 0.22;
          // Apply center fade to alpha
          const fade = centerFade(segX, cw);
          const alpha = life * baseAlpha * fade + cursorBoost;
          if (alpha < 0.002) continue;

          // Color: neutral gray → agent color based on recency + cursor
          const warmth = Math.min(1, life * 0.4 + cursorBoost * 1.5);
          const r = Math.round(175 + warmth * (cr - 175));
          const g = Math.round(175 + warmth * (cg2 - 175));
          const b = Math.round(185 + warmth * (cb - 185));

          ctx!.beginPath();
          ctx!.moveTo(p0.x, p0.y);
          ctx!.lineTo(p1.x, p1.y);
          ctx!.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          ctx!.lineWidth = (agent.isUser ? 1.6 : 1.2) + cursorBoost * 0.8;
          ctx!.stroke();
        }

        // --- Turn-point nodes (PCB vias) ---
        for (const p of agent.trail) {
          if (!p.isTurn) continue;
          const age = now - p.time;
          const life = 1 - age / TRAIL_LIFETIME;
          if (life < 0.05) continue;
          const dM = hasMouse
            ? Math.sqrt((p.x - mx) ** 2 + (p.y - my) ** 2)
            : 9999;
          const near = dM < CURSOR_RADIUS ? (1 - dM / CURSOR_RADIUS) * 0.8 : 0;
          const fade = centerFade(p.x, cw);
          const nodeAlpha = (life * 0.25 + near * 0.35) * fade;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, 2 + near * 2, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(${cr}, ${cg2}, ${cb}, ${nodeAlpha})`;
          ctx!.fill();
        }

        // --- Agent head ---
        const headFade = centerFade(agent.x, cw);
        const headSize = agent.isUser ? 3.5 : 3;
        const glowSize = agent.isUser ? 20 : 16;
        ctx!.beginPath();
        ctx!.arc(agent.x, agent.y, headSize, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${cr}, ${cg2}, ${cb}, ${0.75 * headFade})`;
        ctx!.fill();
        const hg = ctx!.createRadialGradient(
          agent.x,
          agent.y,
          0,
          agent.x,
          agent.y,
          glowSize,
        );
        hg.addColorStop(0, `rgba(${cr}, ${cg2}, ${cb}, ${0.3 * headFade})`);
        hg.addColorStop(1, `rgba(${cr}, ${cg2}, ${cb}, 0)`);
        ctx!.beginPath();
        ctx!.arc(agent.x, agent.y, glowSize, 0, Math.PI * 2);
        ctx!.fillStyle = hg;
        ctx!.fill();
      }

      // --- Intersection glows ---
      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          const dx = agents[i].x - agents[j].x;
          const dy = agents[i].y - agents[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 80) {
            const ix = (agents[i].x + agents[j].x) / 2;
            const iy = (agents[i].y + agents[j].y) / 2;
            const fade = centerFade(ix, cw);
            const strength = (1 - dist / 80) * 0.45 * fade;
            const ig = ctx!.createRadialGradient(ix, iy, 0, ix, iy, 50);
            ig.addColorStop(0, `rgba(234, 88, 12, ${strength})`);
            ig.addColorStop(1, 'rgba(234, 88, 12, 0)');
            ctx!.beginPath();
            ctx!.arc(ix, iy, 50, 0, Math.PI * 2);
            ctx!.fillStyle = ig;
            ctx!.fill();
          }
        }
      }

      animId = requestAnimationFrame(tick);
    }

    resize();
    init();
    animId = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    const onMouse = (e: MouseEvent) => {
      const rect = container!.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };
    const onLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    window.addEventListener('mousemove', onMouse);
    document.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      window.removeEventListener('mousemove', onMouse);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="pointer-events-none" />
    </div>
  );
}
