'use client';

import { Link, MainNav } from '@/components/marketingUi';
import { Hero } from '@/components/new-landing/Hero';
import { useCallback, useEffect, useRef } from 'react';

type PointerState = {
  x: number;
  y: number;
  active: boolean;
};

type FrameArgs = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  delta: number;
  pointer: PointerState;
};

type CanvasController = {
  resize?: (width: number, height: number) => void;
  pointerMove?: (x: number, y: number) => void;
  frame: (args: FrameArgs) => void;
  cleanup?: () => void;
};

type BackgroundVariant = 'agent-trails' | 'dot-field' | 'sync-ripples';

type AuraPalette = {
  baseTop: string;
  baseBottom: string;
  blobA: string;
  blobB: string;
  blobC: string;
};

function useAnimatedCanvas(
  createController: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => CanvasController,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const pointer: PointerState = { x: 0, y: 0, active: false };

    const syncCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    syncCanvasSize();
    const controller = createController(ctx, width, height);

    const handleResize = () => {
      syncCanvasSize();
      controller.resize?.(width, height);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active =
        pointer.x >= 0 &&
        pointer.x <= width &&
        pointer.y >= 0 &&
        pointer.y <= height;

      if (pointer.active) {
        controller.pointerMove?.(pointer.x, pointer.y);
      }
    };

    const handlePointerLeave = () => {
      pointer.active = false;
    };

    let rafId = 0;
    let lastFrame = performance.now();

    const animate = (time: number) => {
      const delta = Math.min(64, time - lastFrame);
      lastFrame = time;

      controller.frame({
        ctx,
        width,
        height,
        time,
        delta,
        pointer,
      });

      rafId = window.requestAnimationFrame(animate);
    };

    rafId = window.requestAnimationFrame(animate);

    window.addEventListener('resize', handleResize);
    window.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    });
    window.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('blur', handlePointerLeave);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('blur', handlePointerLeave);
      controller.cleanup?.();
    };
  }, [createController]);

  return canvasRef;
}

function drawAuraBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  palette: AuraPalette,
) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, palette.baseTop);
  gradient.addColorStop(1, palette.baseBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const drawBlob = (
    x: number,
    y: number,
    radius: number,
    color: string,
    alpha: number,
  ) => {
    const radial = ctx.createRadialGradient(x, y, 0, x, y, radius);
    radial.addColorStop(0, color.replace('__ALPHA__', `${alpha}`));
    radial.addColorStop(1, color.replace('__ALPHA__', '0'));
    ctx.fillStyle = radial;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  const t = time * 0.00008;

  drawBlob(
    width * (0.21 + Math.sin(t * 1.3) * 0.03),
    height * (0.2 + Math.cos(t * 0.9) * 0.025),
    Math.max(width, height) * 0.42,
    palette.blobA,
    0.42,
  );

  drawBlob(
    width * (0.78 + Math.cos(t * 1.1 + 2.4) * 0.04),
    height * (0.2 + Math.sin(t * 1.4 + 1.2) * 0.03),
    Math.max(width, height) * 0.36,
    palette.blobB,
    0.38,
  );

  drawBlob(
    width * (0.64 + Math.sin(t * 0.8 + 4.2) * 0.05),
    height * (0.6 + Math.cos(t * 1.2 + 0.7) * 0.03),
    Math.max(width, height) * 0.32,
    palette.blobC,
    0.24,
  );

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.09)';
  ctx.lineWidth = 1;
  for (let y = 0; y < height; y += 46) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

type Agent = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  seed: number;
};

function createAgents(width: number, height: number): Agent[] {
  const count = Math.max(
    36,
    Math.min(120, Math.floor((width * height) / 22_000)),
  );
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.32 + Math.random() * 0.62;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      speed,
      seed: Math.random() * 10_000,
    };
  });
}

function AgentTrailsBackground() {
  const setup = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      let localWidth = width;
      let localHeight = height;
      let agents = createAgents(width, height);

      const palette: AuraPalette = {
        baseTop: '#ebf2ff',
        baseBottom: '#f5f8fc',
        blobA: 'rgba(129, 171, 255, __ALPHA__)',
        blobB: 'rgba(186, 206, 255, __ALPHA__)',
        blobC: 'rgba(145, 188, 255, __ALPHA__)',
      };

      return {
        resize(nextWidth: number, nextHeight: number) {
          localWidth = nextWidth;
          localHeight = nextHeight;
          agents = createAgents(localWidth, localHeight);
        },
        frame({ time }: FrameArgs) {
          drawAuraBackdrop(ctx, localWidth, localHeight, time, palette);

          ctx.lineWidth = 1.2;
          for (const agent of agents) {
            const startX = agent.x;
            const startY = agent.y;

            const drift = Math.sin(time * 0.0006 + agent.seed) * 0.14;
            const randomTurn = (Math.random() - 0.5) * 0.16;
            const angle = Math.atan2(agent.vy, agent.vx) + drift + randomTurn;

            agent.vx = Math.cos(angle) * agent.speed;
            agent.vy = Math.sin(angle) * agent.speed;

            agent.x += agent.vx;
            agent.y += agent.vy;

            if (agent.x < 0 || agent.x > localWidth) {
              agent.vx *= -1;
              agent.x = Math.max(0, Math.min(localWidth, agent.x));
            }
            if (agent.y < 0 || agent.y > localHeight) {
              agent.vy *= -1;
              agent.y = Math.max(0, Math.min(localHeight, agent.y));
            }

            ctx.strokeStyle = 'rgba(71, 85, 105, 0.24)';
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(agent.x, agent.y);
            ctx.stroke();
          }

          ctx.globalCompositeOperation = 'screen';
          for (let i = 0; i < agents.length; i += 1) {
            for (let j = i + 1; j < agents.length; j += 1) {
              const dx = agents[i].x - agents[j].x;
              const dy = agents[i].y - agents[j].y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance > 20) continue;

              const strength = 1 - distance / 20;
              const x = (agents[i].x + agents[j].x) / 2;
              const y = (agents[i].y + agents[j].y) / 2;

              ctx.fillStyle = `rgba(249, 115, 22, ${0.45 * strength})`;
              ctx.beginPath();
              ctx.arc(x, y, 2 + strength * 5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.globalCompositeOperation = 'source-over';
        },
      } satisfies CanvasController;
    },
    [],
  );

  const canvasRef = useAnimatedCanvas(setup);
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}

type DotPoint = { x: number; y: number };

type SimPresence = {
  phaseX: number;
  phaseY: number;
  speedX: number;
  speedY: number;
  orbitX: number;
  orbitY: number;
};

function createDotGrid(
  width: number,
  height: number,
  spacing: number,
): DotPoint[] {
  const dots: DotPoint[] = [];
  for (let y = spacing * 0.5; y < height; y += spacing) {
    for (let x = spacing * 0.5; x < width; x += spacing) {
      dots.push({ x, y });
    }
  }
  return dots;
}

function DotFieldBackground() {
  const setup = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      let localWidth = width;
      let localHeight = height;
      const spacing = 28;
      let dots = createDotGrid(localWidth, localHeight, spacing);

      const palette: AuraPalette = {
        baseTop: '#edf4ff',
        baseBottom: '#f6f9fd',
        blobA: 'rgba(145, 181, 255, __ALPHA__)',
        blobB: 'rgba(199, 216, 255, __ALPHA__)',
        blobC: 'rgba(165, 198, 255, __ALPHA__)',
      };

      const simulatedVisitors: SimPresence[] = [
        {
          phaseX: 0,
          phaseY: 1.3,
          speedX: 1.1,
          speedY: 0.9,
          orbitX: 0.32,
          orbitY: 0.18,
        },
        {
          phaseX: 2.2,
          phaseY: 4.2,
          speedX: 0.76,
          speedY: 1.25,
          orbitX: 0.26,
          orbitY: 0.24,
        },
        {
          phaseX: 3.7,
          phaseY: 0.7,
          speedX: 1.36,
          speedY: 0.95,
          orbitX: 0.2,
          orbitY: 0.3,
        },
      ];

      return {
        resize(nextWidth: number, nextHeight: number) {
          localWidth = nextWidth;
          localHeight = nextHeight;
          dots = createDotGrid(localWidth, localHeight, spacing);
        },
        frame({ time, pointer }: FrameArgs) {
          drawAuraBackdrop(ctx, localWidth, localHeight, time, palette);

          const t = time * 0.00024;
          const sources = simulatedVisitors.map((sim) => ({
            x:
              localWidth * 0.5 +
              Math.sin(t * sim.speedX + sim.phaseX) * sim.orbitX * localWidth,
            y:
              localHeight * 0.46 +
              Math.cos(t * sim.speedY + sim.phaseY) * sim.orbitY * localHeight,
          }));

          if (pointer.active) {
            sources.push({ x: pointer.x, y: pointer.y });
          }

          for (const dot of dots) {
            let warmth = 0;
            let pullX = 0;
            let pullY = 0;

            for (const source of sources) {
              const dx = source.x - dot.x;
              const dy = source.y - dot.y;
              const d2 = dx * dx + dy * dy;
              const influence = Math.exp(-d2 / 14_500);
              warmth += influence;
              pullX += dx * influence * 0.024;
              pullY += dy * influence * 0.024;
            }

            const intensity = Math.min(1, warmth * 1.15);
            const x = dot.x + pullX;
            const y = dot.y + pullY;
            const radius = 1.1 + intensity * 1.7;

            const base = [148, 163, 184];
            const warm = [251, 146, 60];
            const r = Math.round(base[0] + (warm[0] - base[0]) * intensity);
            const g = Math.round(base[1] + (warm[1] - base[1]) * intensity);
            const b = Math.round(base[2] + (warm[2] - base[2]) * intensity);
            const alpha = 0.34 + intensity * 0.48;

            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
          }

          for (const source of sources) {
            const radial = ctx.createRadialGradient(
              source.x,
              source.y,
              0,
              source.x,
              source.y,
              140,
            );
            radial.addColorStop(0, 'rgba(249, 115, 22, 0.12)');
            radial.addColorStop(1, 'rgba(249, 115, 22, 0)');
            ctx.fillStyle = radial;
            ctx.beginPath();
            ctx.arc(source.x, source.y, 140, 0, Math.PI * 2);
            ctx.fill();
          }
        },
      } satisfies CanvasController;
    },
    [],
  );

  const canvasRef = useAnimatedCanvas(setup);
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}

type Ripple = {
  x: number;
  y: number;
  start: number;
  duration: number;
  maxRadius: number;
  alpha: number;
};

function SyncRipplesBackground() {
  const setup = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      let localWidth = width;
      let localHeight = height;
      let ripples: Ripple[] = [];
      let lastBurstA = 0;
      let lastBurstB = 0;
      let lastBurstC = 0;
      let lastPointerRipple = 0;

      const palette: AuraPalette = {
        baseTop: '#ecf3ff',
        baseBottom: '#f4f8fd',
        blobA: 'rgba(132, 175, 255, __ALPHA__)',
        blobB: 'rgba(186, 206, 255, __ALPHA__)',
        blobC: 'rgba(156, 193, 255, __ALPHA__)',
      };

      const addRipple = (
        x: number,
        y: number,
        now: number,
        options?: Partial<Pick<Ripple, 'duration' | 'maxRadius' | 'alpha'>>,
      ) => {
        ripples.push({
          x,
          y,
          start: now,
          duration: options?.duration ?? 2_600,
          maxRadius:
            options?.maxRadius ?? Math.max(localWidth, localHeight) * 0.26,
          alpha: options?.alpha ?? 0.24,
        });
      };

      const seededAt = performance.now();
      addRipple(width * 0.28, height * 0.3, seededAt - 1000, {
        maxRadius: 260,
      });
      addRipple(width * 0.7, height * 0.42, seededAt - 650, { maxRadius: 220 });
      addRipple(width * 0.54, height * 0.66, seededAt - 280, {
        maxRadius: 280,
      });

      return {
        resize(nextWidth: number, nextHeight: number) {
          localWidth = nextWidth;
          localHeight = nextHeight;
        },
        pointerMove(x: number, y: number) {
          const now = performance.now();
          if (now - lastPointerRipple < 200) return;
          lastPointerRipple = now;
          addRipple(x, y, now, {
            duration: 2_200,
            maxRadius: 180,
            alpha: 0.3,
          });
        },
        frame({ time }: FrameArgs) {
          drawAuraBackdrop(ctx, localWidth, localHeight, time, palette);

          const pulseA = {
            x: localWidth * (0.42 + 0.26 * Math.sin(time * 0.00019)),
            y: localHeight * (0.3 + 0.16 * Math.cos(time * 0.00023)),
          };
          const pulseB = {
            x: localWidth * (0.56 + 0.3 * Math.cos(time * 0.00014 + 1.7)),
            y: localHeight * (0.58 + 0.2 * Math.sin(time * 0.00021 + 0.9)),
          };
          const pulseC = {
            x: localWidth * (0.2 + 0.2 * Math.cos(time * 0.00026 + 0.4)),
            y: localHeight * (0.72 + 0.1 * Math.sin(time * 0.00032 + 2.2)),
          };

          if (time - lastBurstA > 760) {
            lastBurstA = time;
            addRipple(pulseA.x, pulseA.y, time, {
              duration: 2_450,
              maxRadius: 250,
              alpha: 0.27,
            });
          }

          if (time - lastBurstB > 910) {
            lastBurstB = time;
            addRipple(pulseB.x, pulseB.y, time, {
              duration: 2_500,
              maxRadius: 260,
              alpha: 0.24,
            });
          }

          if (time - lastBurstC > 1_150) {
            lastBurstC = time;
            addRipple(pulseC.x, pulseC.y, time, {
              duration: 2_350,
              maxRadius: 220,
              alpha: 0.22,
            });
          }

          ripples = ripples.filter(
            (ripple) => time - ripple.start < ripple.duration,
          );

          for (const ripple of ripples) {
            const progress = (time - ripple.start) / ripple.duration;
            const eased = 1 - Math.pow(1 - progress, 3);
            const radius = 8 + ripple.maxRadius * eased;
            const alpha = Math.max(
              0,
              Math.pow(1 - progress, 2.2) * ripple.alpha,
            );

            ctx.strokeStyle = `rgba(249, 115, 22, ${alpha})`;
            ctx.lineWidth = 1.2 + (1 - progress) * 2.1;
            ctx.beginPath();
            ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = `rgba(99, 102, 241, ${alpha * 0.56})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(ripple.x, ripple.y, radius * 0.66, 0, Math.PI * 2);
            ctx.stroke();
          }

          for (const pulse of [pulseA, pulseB, pulseC]) {
            ctx.fillStyle = 'rgba(249, 115, 22, 0.14)';
            ctx.beginPath();
            ctx.arc(pulse.x, pulse.y, 3.2, 0, Math.PI * 2);
            ctx.fill();
          }
        },
      } satisfies CanvasController;
    },
    [],
  );

  const canvasRef = useAnimatedCanvas(setup);
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}

const previewVariants = [
  {
    id: 'agent-trails',
    href: '/home/agent-trails',
    label: 'Agent Trails',
    note: 'Local simulation: autonomous traces drift through an aurora field and pulse orange on intersections.',
  },
  {
    id: 'dot-field',
    href: '/home/dot-field',
    label: 'Dot Field',
    note: 'Local simulation: a constellation matrix responds to simulated visitor gravity wells and your cursor.',
  },
  {
    id: 'sync-ripples',
    href: '/home/sync-ripples',
    label: 'Sync Ripples',
    note: 'Local simulation: soft wavefronts continuously propagate from moving interaction sources.',
  },
] as const;

function renderBackground(variant: BackgroundVariant) {
  switch (variant) {
    case 'agent-trails':
      return <AgentTrailsBackground />;
    case 'dot-field':
      return <DotFieldBackground />;
    case 'sync-ripples':
      return <SyncRipplesBackground />;
    default:
      return null;
  }
}

export function HeroBackgroundPreviewPage({
  variant,
}: {
  variant: BackgroundVariant;
}) {
  const current = previewVariants.find((item) => item.id === variant);

  return (
    <div className="text-off-black relative min-h-screen overflow-hidden bg-[#f4f7fb]">
      {renderBackground(variant)}

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 68% at 50% 14%, rgba(255, 255, 255, 0.46) 0%, rgba(255, 255, 255, 0.22) 52%, rgba(244, 247, 251, 0.2) 100%)',
        }}
      />

      <MainNav transparent />

      <main className="relative z-10 pb-16">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pt-24 sm:px-6 lg:px-8">
          <p className="rounded-full border border-gray-300/90 bg-white/80 px-3 py-1 text-xs font-medium tracking-wide text-gray-700 uppercase backdrop-blur-sm">
            Hero Background Prototype (Local Simulation)
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {previewVariants.map((item) => {
              const isActive = item.id === variant;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    isActive
                      ? 'border-orange-300 bg-orange-50 text-orange-700'
                      : 'border-gray-300/90 bg-white/80 text-gray-700 hover:border-gray-400 hover:bg-white'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <Hero />

        {current ? (
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <p className="rounded-xl border border-gray-200/90 bg-white/70 p-4 text-sm text-gray-600 backdrop-blur-sm sm:text-base">
              {current.note}
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
