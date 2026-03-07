'use client';

import { useEffect, useRef } from 'react';
import {
  AGENT_COLOR,
  Agent,
  CURSOR_RADIUS,
  USER_COLOR,
  applyCursorAttraction,
  centerFade,
  createAgent,
  stepAgent,
  stepUserAgent,
} from './heroPerfAgents';

const TARGET_FPS = 30;

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

function drawTrailSegment(
  ctx: CanvasRenderingContext2D,
  agent: Agent,
  fromX: number,
  fromY: number,
  mouseX: number,
  mouseY: number,
  hasMouse: boolean,
  width: number,
) {
  if (Math.abs(agent.x - fromX) > 100 || Math.abs(agent.y - fromY) > 100) {
    return;
  }

  const [cr, cg, cb] = agent.isUser ? USER_COLOR : AGENT_COLOR;
  const midX = (fromX + agent.x) / 2;
  const midY = (fromY + agent.y) / 2;
  const fade = centerFade(midX, width);
  if (fade < 0.01) return;

  const cursorDistance = hasMouse
    ? Math.hypot(midX - mouseX, midY - mouseY)
    : Number.POSITIVE_INFINITY;
  const cursorBoost =
    cursorDistance < CURSOR_RADIUS
      ? (1 - cursorDistance / CURSOR_RADIUS) * 0.18
      : 0;
  const alpha = (agent.isUser ? 0.14 : 0.1) * fade + cursorBoost;
  if (alpha < 0.01) return;

  const warmth = Math.min(1, 0.55 + cursorBoost * 1.9);
  const r = Math.round(175 + warmth * (cr - 175));
  const g = Math.round(175 + warmth * (cg - 175));
  const b = Math.round(185 + warmth * (cb - 185));

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(agent.x, agent.y);
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  ctx.lineWidth = (agent.isUser ? 1.5 : 1.15) + cursorBoost * 0.9;
  ctx.stroke();

  if (!agent.justTurned) return;

  const turnAlpha = (agent.isUser ? 0.16 : 0.12) * fade + cursorBoost * 0.9;
  if (turnAlpha < 0.01) return;

  ctx.beginPath();
  ctx.arc(agent.x, agent.y, agent.isUser ? 2.8 : 2.2, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${turnAlpha})`;
  ctx.fill();
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
  ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.72 * fade})`;
  ctx.fill();

  const glow = ctx.createRadialGradient(
    agent.x,
    agent.y,
    0,
    agent.x,
    agent.y,
    glowSize,
  );
  glow.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${0.24 * fade})`);
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
  let drawn = 0;

  for (let i = 0; i < agents.length; i += 1) {
    for (let j = i + 1; j < agents.length; j += 1) {
      const dx = agents[i].x - agents[j].x;
      const dy = agents[i].y - agents[j].y;
      const distance = Math.hypot(dx, dy);
      if (distance >= 52) continue;

      const x = (agents[i].x + agents[j].x) / 2;
      const fade = centerFade(x, width);
      const strength = (1 - distance / 52) * 0.22 * fade;
      if (strength < 0.01) continue;

      const y = (agents[i].y + agents[j].y) / 2;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, 34);
      gradient.addColorStop(0, `rgba(234, 88, 12, ${strength})`);
      gradient.addColorStop(1, 'rgba(234, 88, 12, 0)');
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      drawn += 1;
      if (drawn >= 10) return;
    }
  }
}

export function AgentPathsBgSoftCenterLayered() {
  const containerRef = useRef<HTMLDivElement>(null);
  const washCanvasRef = useRef<HTMLCanvasElement>(null);
  const trailsCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const washCanvas = washCanvasRef.current;
    const trailsCanvas = trailsCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!container || !washCanvas || !trailsCanvas || !overlayCanvas) return;

    const washCtx = washCanvas.getContext('2d');
    const trailsCtx = trailsCanvas.getContext('2d');
    const overlayCtx = overlayCanvas.getContext('2d');
    if (!washCtx || !trailsCtx || !overlayCtx) return;

    const mouse = { x: -9999, y: -9999 };
    let agents: Agent[] = [];
    let dpr = 1;
    let width = 0;
    let height = 0;
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

    const createAgents = () => {
      const seeded = Array.from({ length: 20 }, (_, index) =>
        createAgent(width, height, index % 2 === 0 ? 'left' : 'right'),
      );
      seeded[0].isUser = true;
      return seeded;
    };

    const clearDynamicLayers = () => {
      trailsCtx.clearRect(0, 0, width, height);
      overlayCtx.clearRect(0, 0, width, height);
    };

    const seedTrails = () => {
      for (let frame = 0; frame < 120; frame += 1) {
        for (const agent of agents) {
          const fromX = agent.x;
          const fromY = agent.y;
          stepAgent(agent, width, height);
          drawTrailSegment(
            trailsCtx,
            agent,
            fromX,
            fromY,
            mouse.x,
            mouse.y,
            false,
            width,
          );
        }
      }
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      syncCanvas(washCanvas, washCtx);
      syncCanvas(trailsCanvas, trailsCtx);
      syncCanvas(overlayCanvas, overlayCtx);
      drawWash(washCtx, width, height);
      clearDynamicLayers();
      agents = createAgents();
      seedTrails();
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
      const hasMouse = mouse.x > -1000;

      trailsCtx.fillStyle = 'rgba(248, 248, 248, 0.05)';
      trailsCtx.fillRect(0, 0, width, height);
      overlayCtx.clearRect(0, 0, width, height);

      for (const agent of agents) {
        const fromX = agent.x;
        const fromY = agent.y;

        if (agent.isUser) {
          stepUserAgent(agent, width, height, mouse.x, mouse.y, hasMouse);
        } else {
          applyCursorAttraction(agent, mouse.x, mouse.y, hasMouse);
          stepAgent(agent, width, height);
        }

        drawTrailSegment(
          trailsCtx,
          agent,
          fromX,
          fromY,
          mouse.x,
          mouse.y,
          hasMouse,
          width,
        );
        drawAgentHead(overlayCtx, agent, width);
      }

      drawIntersections(overlayCtx, agents, width);
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
        ref={washCanvasRef}
        className="pointer-events-none absolute inset-0"
      />
      <canvas
        ref={trailsCanvasRef}
        className="pointer-events-none absolute inset-0"
      />
      <canvas
        ref={overlayCanvasRef}
        className="pointer-events-none absolute inset-0"
      />
    </div>
  );
}
