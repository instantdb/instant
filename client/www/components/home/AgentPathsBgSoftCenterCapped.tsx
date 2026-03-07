'use client';

import { useEffect, useRef } from 'react';
import {
  AGENT_COLOR,
  Agent,
  CURSOR_RADIUS,
  TRAIL_LIFETIME,
  USER_COLOR,
  applyCursorAttraction,
  centerFade,
  initAgents,
  stepAgent,
  stepUserAgent,
  trimTrail,
} from './heroPerfAgents';

const TARGET_FPS = 30;
const MAX_TRAIL_POINTS = 220;

function drawWash(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);

  const sideWidth = width * 0.4;

  const left = ctx.createRadialGradient(
    0,
    height * 0.35,
    0,
    0,
    height * 0.35,
    sideWidth,
  );
  left.addColorStop(0, 'rgba(255, 237, 213, 0.35)');
  left.addColorStop(0.5, 'rgba(254, 215, 170, 0.12)');
  left.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, width, height);

  const right = ctx.createRadialGradient(
    width,
    height * 0.35,
    0,
    width,
    height * 0.35,
    sideWidth,
  );
  right.addColorStop(0, 'rgba(255, 237, 213, 0.35)');
  right.addColorStop(0.5, 'rgba(254, 215, 170, 0.12)');
  right.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = right;
  ctx.fillRect(0, 0, width, height);
}

function drawAgentTrail(
  ctx: CanvasRenderingContext2D,
  agent: Agent,
  mouseX: number,
  mouseY: number,
  hasMouse: boolean,
  width: number,
  now: number,
) {
  const [cr, cg, cb] = agent.isUser ? USER_COLOR : AGENT_COLOR;

  for (let i = 1; i < agent.trail.length; i += 1) {
    const p0 = agent.trail[i - 1];
    const p1 = agent.trail[i];

    if (Math.abs(p1.x - p0.x) > 100 || Math.abs(p1.y - p0.y) > 100) {
      continue;
    }

    const age = now - p1.time;
    const life = 1 - age / TRAIL_LIFETIME;
    if (life <= 0) continue;

    const segX = (p0.x + p1.x) / 2;
    const segY = (p0.y + p1.y) / 2;
    const cursorDistance = hasMouse
      ? Math.hypot(segX - mouseX, segY - mouseY)
      : Number.POSITIVE_INFINITY;
    const cursorBoost =
      cursorDistance < CURSOR_RADIUS
        ? (1 - cursorDistance / CURSOR_RADIUS) * 0.35
        : 0;

    const alpha =
      life * (agent.isUser ? 0.3 : 0.22) * centerFade(segX, width) +
      cursorBoost;
    if (alpha < 0.002) continue;

    const warmth = Math.min(1, life * 0.4 + cursorBoost * 1.5);
    const r = Math.round(175 + warmth * (cr - 175));
    const g = Math.round(175 + warmth * (cg - 175));
    const b = Math.round(185 + warmth * (cb - 185));

    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.lineWidth = (agent.isUser ? 1.6 : 1.2) + cursorBoost * 0.8;
    ctx.stroke();
  }

  for (const point of agent.trail) {
    if (!point.isTurn) continue;

    const life = 1 - (now - point.time) / TRAIL_LIFETIME;
    if (life < 0.05) continue;

    const distance = hasMouse
      ? Math.hypot(point.x - mouseX, point.y - mouseY)
      : Number.POSITIVE_INFINITY;
    const near =
      distance < CURSOR_RADIUS ? (1 - distance / CURSOR_RADIUS) * 0.8 : 0;
    const fade = centerFade(point.x, width);
    const alpha = (life * 0.25 + near * 0.35) * fade;
    if (alpha < 0.01) continue;

    ctx.beginPath();
    ctx.arc(point.x, point.y, 2 + near * 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
    ctx.fill();
  }
}

function drawAgentHead(
  ctx: CanvasRenderingContext2D,
  agent: Agent,
  width: number,
) {
  const [cr, cg, cb] = agent.isUser ? USER_COLOR : AGENT_COLOR;
  const fade = centerFade(agent.x, width);
  if (fade < 0.01) return;

  const headSize = agent.isUser ? 3.5 : 3;
  const glowSize = agent.isUser ? 20 : 16;

  ctx.beginPath();
  ctx.arc(agent.x, agent.y, headSize, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.75 * fade})`;
  ctx.fill();

  const glow = ctx.createRadialGradient(
    agent.x,
    agent.y,
    0,
    agent.x,
    agent.y,
    glowSize,
  );
  glow.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${0.3 * fade})`);
  glow.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
  ctx.beginPath();
  ctx.arc(agent.x, agent.y, glowSize, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();
}

function drawIntersections(
  ctx: CanvasRenderingContext2D,
  agents: Agent[],
  width: number,
) {
  for (let i = 0; i < agents.length; i += 1) {
    for (let j = i + 1; j < agents.length; j += 1) {
      const dx = agents[i].x - agents[j].x;
      const dy = agents[i].y - agents[j].y;
      const distance = Math.hypot(dx, dy);
      if (distance >= 64) continue;

      const x = (agents[i].x + agents[j].x) / 2;
      const y = (agents[i].y + agents[j].y) / 2;
      const fade = centerFade(x, width);
      const strength = (1 - distance / 64) * 0.28 * fade;
      if (strength < 0.01) continue;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, 42);
      gradient.addColorStop(0, `rgba(234, 88, 12, ${strength})`);
      gradient.addColorStop(1, 'rgba(234, 88, 12, 0)');
      ctx.beginPath();
      ctx.arc(x, y, 42, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }
}

export function AgentPathsBgSoftCenterCapped() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const washCanvas = document.createElement('canvas');
    const washCtx = washCanvas.getContext('2d');
    if (!washCtx) return;

    const mouse = { x: -9999, y: -9999 };
    let agents: Agent[] = [];
    let dpr = 1;
    let width = 0;
    let height = 0;
    let frameCount = 0;
    let lastTick = 0;
    let rafId = 0;
    let isVisible = true;

    const syncCanvas = (
      target: HTMLCanvasElement,
      targetCtx: CanvasRenderingContext2D,
    ) => {
      target.width = Math.max(1, Math.floor(width * dpr));
      target.height = Math.max(1, Math.floor(height * dpr));
      target.style.width = `${width}px`;
      target.style.height = `${height}px`;
      targetCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      syncCanvas(canvas, ctx);
      syncCanvas(washCanvas, washCtx);
      drawWash(washCtx, width, height);
      agents = initAgents(width, height, 180);
    };

    const schedule = () => {
      if (rafId !== 0 || !isVisible || document.hidden) return;
      rafId = window.requestAnimationFrame(tick);
    };

    const tick = (timestamp: number) => {
      rafId = 0;
      if (!isVisible || document.hidden) return;
      if (timestamp - lastTick < 1000 / TARGET_FPS) {
        schedule();
        return;
      }

      lastTick = timestamp;
      frameCount += 1;

      const hasMouse = mouse.x > -1000;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(washCanvas, 0, 0, width, height);

      for (const agent of agents) {
        if (agent.isUser) {
          stepUserAgent(agent, width, height, mouse.x, mouse.y, hasMouse);
        } else {
          applyCursorAttraction(agent, mouse.x, mouse.y, hasMouse);
          stepAgent(agent, width, height);
        }

        agent.trail.push({
          x: agent.x,
          y: agent.y,
          time: timestamp,
          isTurn: agent.justTurned,
        });
        trimTrail(agent.trail, timestamp, MAX_TRAIL_POINTS);

        drawAgentTrail(
          ctx,
          agent,
          mouse.x,
          mouse.y,
          hasMouse,
          width,
          timestamp,
        );
        drawAgentHead(ctx, agent, width);
      }

      if (frameCount % 2 === 0) {
        drawIntersections(ctx, agents, width);
      }

      schedule();
    };

    resize();
    schedule();

    const resizeObserver = new ResizeObserver(() => {
      resize();
      schedule();
    });
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) schedule();
      },
      { threshold: 0.05 },
    );
    intersectionObserver.observe(container);

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
    };

    const resetPointer = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };

    const handleVisibility = () => {
      if (!document.hidden) schedule();
    };

    window.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    });
    container.addEventListener('pointerleave', resetPointer);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
      }
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', resetPointer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0"
      />
    </div>
  );
}
