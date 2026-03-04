'use client';

import { useEffect, useRef, PropsWithChildren } from 'react';

// --- Types ---

interface Dot {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// --- Constants ---

const SPACING = 32;
const DOT_RADIUS = 1.8;
const BASE_ALPHA = 0.15;
const INFLUENCE_RADIUS = 200;
const CONNECT_DISTANCE = 70;
const DRIFT_FORCE = 0.004;
const RETURN_FORCE = 0.025;
const DAMPING = 0.82;

// --- Component ---

export function ConstellationBg({ children }: PropsWithChildren) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let dots: Dot[] = [];
    const dpr = window.devicePixelRatio || 1;

    // Spatial grid for fast neighbor lookup
    let gridCols = 0;
    let gridRows = 0;
    let grid: number[][] = [];

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = w + 'px';
      canvas!.style.height = h + 'px';
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      initDots();
    }

    function initDots() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      dots = [];

      const cols = Math.ceil(w / SPACING) + 2;
      const rows = Math.ceil(h / SPACING) + 2;
      const offX = (w - (cols - 1) * SPACING) / 2;
      const offY = (h - (rows - 1) * SPACING) / 2;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = offX + c * SPACING;
          const y = offY + r * SPACING;
          dots.push({ baseX: x, baseY: y, x, y, vx: 0, vy: 0 });
        }
      }

      // Init spatial grid
      gridCols = Math.ceil(w / CONNECT_DISTANCE) + 1;
      gridRows = Math.ceil(h / CONNECT_DISTANCE) + 1;
    }

    function tick() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      ctx!.clearRect(0, 0, w, h);

      // Build spatial grid for connection lines
      grid = Array.from({ length: gridCols * gridRows }, () => []);

      const influenced: number[] = [];

      // --- Update dots ---
      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];
        const dx = mx - dot.x;
        const dy = my - dot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Mouse attraction
        if (dist < INFLUENCE_RADIUS && dist > 1) {
          const f = (1 - dist / INFLUENCE_RADIUS) * DRIFT_FORCE;
          dot.vx += dx * f;
          dot.vy += dy * f;
          influenced.push(i);
        }

        // Spring back to grid position
        dot.vx += (dot.baseX - dot.x) * RETURN_FORCE;
        dot.vy += (dot.baseY - dot.y) * RETURN_FORCE;

        // Damping
        dot.vx *= DAMPING;
        dot.vy *= DAMPING;

        // Integrate
        dot.x += dot.vx;
        dot.y += dot.vy;

        // Add to spatial grid
        const gc = Math.floor(dot.x / CONNECT_DISTANCE);
        const gr = Math.floor(dot.y / CONNECT_DISTANCE);
        if (gc >= 0 && gc < gridCols && gr >= 0 && gr < gridRows) {
          grid[gr * gridCols + gc].push(i);
        }
      }

      // --- Draw connection lines (only between influenced dots) ---
      const influencedSet = new Set(influenced);
      for (const i of influenced) {
        const a = dots[i];
        const gc = Math.floor(a.x / CONNECT_DISTANCE);
        const gr = Math.floor(a.y / CONNECT_DISTANCE);

        // Check neighboring cells
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = gr + dr;
            const nc = gc + dc;
            if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols)
              continue;
            const cell = grid[nr * gridCols + nc];
            for (const j of cell) {
              if (j <= i) continue;
              if (!influencedSet.has(j)) continue;

              const b = dots[j];
              const ddx = a.x - b.x;
              const ddy = a.y - b.y;
              const d = Math.sqrt(ddx * ddx + ddy * ddy);
              if (d < CONNECT_DISTANCE) {
                const lineAlpha = (1 - d / CONNECT_DISTANCE) * 0.25;
                ctx!.beginPath();
                ctx!.moveTo(a.x, a.y);
                ctx!.lineTo(b.x, b.y);
                ctx!.strokeStyle = `rgba(234, 88, 12, ${lineAlpha})`;
                ctx!.lineWidth = 1;
                ctx!.stroke();
              }
            }
          }
        }
      }

      // --- Draw dots ---
      // Batch neutral dots
      ctx!.fillStyle = `rgba(0, 0, 0, ${BASE_ALPHA})`;
      ctx!.beginPath();
      for (let i = 0; i < dots.length; i++) {
        if (influencedSet.has(i)) continue;
        const dot = dots[i];
        ctx!.moveTo(dot.x + DOT_RADIUS, dot.y);
        ctx!.arc(dot.x, dot.y, DOT_RADIUS, 0, Math.PI * 2);
      }
      ctx!.fill();

      // Draw influenced dots individually (with color interpolation)
      for (const i of influenced) {
        const dot = dots[i];
        const dx = mx - dot.x;
        const dy = my - dot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const warmth = 1 - dist / INFLUENCE_RADIUS;
        const alpha = BASE_ALPHA + warmth * 0.5;
        const radius = DOT_RADIUS + warmth * 2;

        ctx!.beginPath();
        ctx!.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(234, 88, 12, ${alpha})`;
        ctx!.fill();
      }

      animId = requestAnimationFrame(tick);
    }

    resize();
    animId = requestAnimationFrame(tick);

    const onResize = () => resize();
    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('mousemove', onMouse);
    document.addEventListener('mouseleave', onMouseLeave);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouse);
      document.removeEventListener('mouseleave', onMouseLeave);
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
