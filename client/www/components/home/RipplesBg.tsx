'use client';

import { useEffect, useRef, PropsWithChildren } from 'react';

// --- Types ---

interface Ripple {
  x: number;
  y: number;
  maxRadius: number;
  startTime: number;
  duration: number;
  isUser: boolean;
}

// --- Constants ---

const MAX_RIPPLES = 50;
const AUTO_INTERVAL_MIN = 800; // ms between auto-spawns
const AUTO_INTERVAL_MAX = 2500;
const RIPPLE_DURATION = 4000; // ms for a ripple to fully expand and fade
const RIPPLE_MAX_RADIUS = 280;
const NUM_RINGS = 3;
const RING_OFFSET = 0.08; // stagger between concentric rings
const MOUSE_THROTTLE = 400; // ms between mouse-spawned ripples

// --- Helpers ---

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

// --- Component ---

export function RipplesBg({ children }: PropsWithChildren) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ripplesRef = useRef<Ripple[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const dpr = window.devicePixelRatio || 1;

    let lastAutoSpawn = performance.now();
    let nextAutoDelay =
      AUTO_INTERVAL_MIN +
      Math.random() * (AUTO_INTERVAL_MAX - AUTO_INTERVAL_MIN);
    let lastMouseRipple = 0;

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = w + 'px';
      canvas!.style.height = h + 'px';
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn(x: number, y: number, isUser: boolean) {
      if (ripplesRef.current.length >= MAX_RIPPLES) return;
      ripplesRef.current.push({
        x,
        y,
        maxRadius: RIPPLE_MAX_RADIUS * (0.6 + Math.random() * 0.6),
        startTime: performance.now(),
        duration: RIPPLE_DURATION * (0.8 + Math.random() * 0.4),
        isUser,
      });
    }

    function tick() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const now = performance.now();

      ctx!.clearRect(0, 0, w, h);

      // --- Auto-spawn (simulating other visitors) ---
      if (now - lastAutoSpawn > nextAutoDelay) {
        // Bias toward upper portion of the viewport (hero area)
        const x = 50 + Math.random() * (w - 100);
        const y = 50 + Math.random() * (h * 0.65);
        spawn(x, y, false);
        lastAutoSpawn = now;
        nextAutoDelay =
          AUTO_INTERVAL_MIN +
          Math.random() * (AUTO_INTERVAL_MAX - AUTO_INTERVAL_MIN);
      }

      // --- Draw ripples ---
      const alive: Ripple[] = [];
      for (const ripple of ripplesRef.current) {
        const elapsed = now - ripple.startTime;
        if (elapsed >= ripple.duration) continue;
        alive.push(ripple);

        const progress = elapsed / ripple.duration;

        for (let ring = 0; ring < NUM_RINGS; ring++) {
          const ringProgress = progress - ring * RING_OFFSET;
          if (ringProgress <= 0 || ringProgress >= 1) continue;

          const radius = ripple.maxRadius * easeOutCubic(ringProgress);
          const fade = 1 - ringProgress;

          // Quadratic fade for natural falloff
          const alpha = fade * fade * 0.18;
          if (alpha < 0.001) continue;

          const lineWidth = Math.max(0.5, 2 * (1 - ringProgress));

          ctx!.beginPath();
          ctx!.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
          ctx!.lineWidth = lineWidth;

          if (ripple.isUser) {
            // Warmer orange tint for user's own ripples
            ctx!.strokeStyle = `rgba(234, 88, 12, ${alpha * 1.8})`;
          } else {
            ctx!.strokeStyle = `rgba(100, 100, 120, ${alpha})`;
          }
          ctx!.stroke();
        }
      }
      ripplesRef.current = alive;

      animId = requestAnimationFrame(tick);
    }

    resize();
    animId = requestAnimationFrame(tick);

    // Spawn initial ripples so the page feels alive from the start
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < 8; i++) {
      spawn(
        80 + Math.random() * (w - 160),
        80 + Math.random() * (h * 0.5),
        false,
      );
      // Stagger start times so they don't all appear at once
      ripplesRef.current[ripplesRef.current.length - 1].startTime -=
        Math.random() * 3000;
    }

    const onResize = () => resize();
    const onMouseMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - lastMouseRipple > MOUSE_THROTTLE) {
        spawn(e.clientX, e.clientY, true);
        lastMouseRipple = now;
      }
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouseMove);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  return (
    <div className="relative bg-gray-50">
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-0"
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
