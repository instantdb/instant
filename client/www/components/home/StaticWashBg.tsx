'use client';

import { useEffect, useRef } from 'react';

export function StaticWashBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    function paint() {
      const { width: cw, height: ch } = container!.getBoundingClientRect();
      canvas!.width = cw * dpr;
      canvas!.height = ch * dpr;
      canvas!.style.width = cw + 'px';
      canvas!.style.height = ch + 'px';
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, cw, ch);

      // Wide elliptical wash from the top center, fading downward
      const radius = Math.max(cw, ch) * 0.7;
      const topGrad = ctx!.createRadialGradient(cw * 0.5, 0, 0, cw * 0.5, 0, radius);
      topGrad.addColorStop(0, 'rgba(255, 237, 213, 0.35)');
      topGrad.addColorStop(0.4, 'rgba(254, 215, 170, 0.12)');
      topGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx!.fillStyle = topGrad;
      ctx!.fillRect(0, 0, cw, ch);
    }

    paint();

    const ro = new ResizeObserver(() => paint());
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="pointer-events-none" />
    </div>
  );
}
