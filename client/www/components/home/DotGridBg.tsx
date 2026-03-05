'use client';

import { useEffect, useRef } from 'react';

const DOT_SPACING = 32;
const BASE_RADIUS = 1.2;
const HOVER_RADIUS = 2.5;
const HOVER_RANGE = 150;
const BASE_COLOR = [180, 180, 185] as const;
const WARM_COLOR = [234, 138, 60] as const; // warm orange
const BASE_ALPHA = 0.3;

export function DotGridBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let cw = 0;
    let ch = 0;
    let animId: number;

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

    function draw() {
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const hasMouse = mx > -1000;

      ctx!.clearRect(0, 0, cw, ch);

      const cols = Math.ceil(cw / DOT_SPACING) + 1;
      const rows = Math.ceil(ch / DOT_SPACING) + 1;
      const offsetX = (cw - (cols - 1) * DOT_SPACING) / 2;
      const offsetY = (ch - (rows - 1) * DOT_SPACING) / 2;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = offsetX + col * DOT_SPACING;
          const y = offsetY + row * DOT_SPACING;

          let radius = BASE_RADIUS;
          let r: number = BASE_COLOR[0];
          let g: number = BASE_COLOR[1];
          let b: number = BASE_COLOR[2];
          let alpha = BASE_ALPHA;

          if (hasMouse) {
            const dist = Math.sqrt((x - mx) ** 2 + (y - my) ** 2);
            if (dist < HOVER_RANGE) {
              const t = 1 - dist / HOVER_RANGE;
              // Smooth falloff (ease-out)
              const ease = t * t * (3 - 2 * t);
              radius = BASE_RADIUS + (HOVER_RADIUS - BASE_RADIUS) * ease;
              r = Math.round(r + (WARM_COLOR[0] - r) * ease);
              g = Math.round(g + (WARM_COLOR[1] - g) * ease);
              b = Math.round(b + (WARM_COLOR[2] - b) * ease);
              alpha = BASE_ALPHA + (0.7 - BASE_ALPHA) * ease;
            }
          }

          ctx!.beginPath();
          ctx!.arc(x, y, radius, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          ctx!.fill();
        }
      }

      animId = requestAnimationFrame(draw);
    }

    resize();
    animId = requestAnimationFrame(draw);

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
