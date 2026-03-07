'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Pre-defined doodle: Instant logo ───────────────────
function rectStroke(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  pointsPerSide: number,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const sides: [number, number, number, number][] = [
    [x1, y1, x2, y1],
    [x2, y1, x2, y2],
    [x2, y2, x1, y2],
    [x1, y2, x1, y1],
  ];
  for (const [sx, sy, ex, ey] of sides) {
    for (let i = 0; i < pointsPerSide; i++) {
      const t = i / pointsPerSide;
      pts.push({ x: sx + (ex - sx) * t, y: sy + (ey - sy) * t });
    }
  }
  pts.push({ x: x1, y: y1 });
  return pts;
}

const OUTER = rectStroke(0.275, 0.2, 0.725, 0.8, 10);
const barX1 = 0.275 + 0.184 * 0.45;
const barX2 = 0.275 + 0.454 * 0.45;
const barY1 = 0.2 + 0.178 * 0.6;
const barY2 = 0.2 + 0.827 * 0.6;
const INNER_BAR = rectStroke(barX1, barY1, barX2, barY2, 8);
const PREDEFINED_STROKES = [OUTER, INNER_BAR];

// ─── Drawing helpers ────────────────────────────────────

type Point = { x: number; y: number };
type CanvasId = 'stopa' | 'drew' | 'daniel';

const STROKE_COLOR = '#F97316';
const LINE_WIDTH = 2.5;
const DOT_GRID_COLOR = '#e5e7eb';
const DOT_GRID_SPACING = 20;

function drawDotGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = DOT_GRID_COLOR;
  for (let x = DOT_GRID_SPACING; x < w; x += DOT_GRID_SPACING) {
    for (let y = DOT_GRID_SPACING; y < h; y += DOT_GRID_SPACING) {
      ctx.beginPath();
      ctx.arc(x, y, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Point[][],
  w: number,
  h: number,
) {
  ctx.strokeStyle = STROKE_COLOR;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    if (stroke.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0].x * w, stroke[0].y * h);
    for (let i = 1; i < stroke.length; i++) {
      ctx.lineTo(stroke[i].x * w, stroke[i].y * h);
    }
    ctx.stroke();
  }
}

function renderCanvas(
  canvas: HTMLCanvasElement | null,
  strokes: Point[][],
  dpr: number,
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  drawDotGrid(ctx, w, h);
  drawStrokes(ctx, strokes, w, h);
}

// ─── Flying coordinate label ─────────────────────────────

type FlyingCoord = {
  id: number;
  label: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

// ─── StreamsDemoJoin component ───────────────────────────

export function StreamsDemoJoin() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null);
  const dprRef = useRef(1);
  const rafRef = useRef<number>(0);

  // Wrapper refs for flying coord positioning
  const stopaWrapperRef = useRef<HTMLDivElement>(null);
  const drewWrapperRef = useRef<HTMLDivElement>(null);
  const danielWrapperRef = useRef<HTMLDivElement>(null);

  const canvasRefs = useRef<Record<CanvasId, HTMLCanvasElement | null>>({
    stopa: null,
    drew: null,
    daniel: null,
  });
  const strokesRef = useRef<Record<CanvasId, Point[][]>>({
    stopa: [],
    drew: [],
    daniel: [],
  });
  const queuesRef = useRef<
    Record<CanvasId, { strokeIdx: number; point: Point }[]>
  >({
    stopa: [],
    drew: [],
    daniel: [],
  });

  const activeSourceRef = useRef<CanvasId | null>(null);

  const autoplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoplayActiveRef = useRef(false);
  const autoplayStrokeIdxRef = useRef(0);
  const autoplayPointIdxRef = useRef(0);

  const recordingRef = useRef<{ strokeIdx: number; point: Point }[]>([]);
  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Point[]>([]);

  const [danielJoined, setDanielJoined] = useState(false);
  const danielJoinedRef = useRef(false);

  // Flying coords
  const coordIdRef = useRef(0);
  const coordsBufferRef = useRef<FlyingCoord[]>([]);
  const coordFlushRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [flyingCoords, setFlyingCoords] = useState<FlyingCoord[]>([]);
  const coordCounterRef = useRef(0);

  const setupCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
  }, []);

  const redraw = useCallback(() => {
    for (const id of ['stopa', 'drew', 'daniel'] as CanvasId[]) {
      renderCanvas(
        canvasRefs.current[id],
        strokesRef.current[id],
        dprRef.current,
      );
    }
    const cursor = cursorRef.current;
    const pos = cursorPosRef.current;
    if (cursor) {
      if (pos) {
        cursor.style.display = 'block';
        cursor.style.left = `${pos.x * 100}%`;
        cursor.style.top = `${pos.y * 100}%`;
      } else {
        cursor.style.display = 'none';
      }
    }
  }, []);

  // Render loop
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      redraw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [redraw]);

  // Flying coords flush
  useEffect(() => {
    coordFlushRef.current = setInterval(() => {
      if (coordsBufferRef.current.length === 0) return;
      const batch = coordsBufferRef.current.splice(0);
      setFlyingCoords((prev) => [...prev, ...batch]);
    }, 50);
    return () => {
      if (coordFlushRef.current) clearInterval(coordFlushRef.current);
    };
  }, []);

  // Stream consumer: Drew always, Daniel only after join
  useEffect(() => {
    streamIntervalRef.current = setInterval(() => {
      const source = activeSourceRef.current;
      for (const id of ['stopa', 'drew', 'daniel'] as CanvasId[]) {
        if (id === source) continue;
        if (id === 'daniel' && !danielJoinedRef.current) continue;
        const item = queuesRef.current[id].shift();
        if (!item) continue;
        const strokes = strokesRef.current[id];
        while (strokes.length <= item.strokeIdx) {
          strokes.push([]);
        }
        strokes[item.strokeIdx].push(item.point);
      }
    }, 12);
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, []);

  // Canvas sizing
  useEffect(() => {
    for (const id of ['stopa', 'drew', 'daniel'] as CanvasId[]) {
      setupCanvas(canvasRefs.current[id]);
    }
    redraw();

    const handleResize = () => {
      for (const id of ['stopa', 'drew', 'daniel'] as CanvasId[]) {
        setupCanvas(canvasRefs.current[id]);
      }
      redraw();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setupCanvas, redraw]);

  // ─── Flying coord helpers ───

  const spawnFlyingCoord = useCallback(
    (destId: CanvasId, point: Point) => {
      const container = containerRef.current;
      const stopaWrapper = stopaWrapperRef.current;
      const destWrapper =
        destId === 'drew'
          ? drewWrapperRef.current
          : danielWrapperRef.current;
      if (!container || !stopaWrapper || !destWrapper) return;

      const cRect = container.getBoundingClientRect();
      const sRect = stopaWrapper.getBoundingClientRect();
      const dRect = destWrapper.getBoundingClientRect();

      coordIdRef.current += 1;
      coordsBufferRef.current.push({
        id: coordIdRef.current,
        label: `[${point.x.toFixed(2)}, ${point.y.toFixed(2)}]`,
        startX: sRect.right - cRect.left + 6,
        startY: sRect.top - cRect.top + sRect.height / 2,
        endX: dRect.left - cRect.left - 6,
        endY: dRect.top - cRect.top + dRect.height / 2,
      });
    },
    [],
  );

  const removeCoord = useCallback((id: number) => {
    setFlyingCoords((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // ─── Clear helpers ───

  const clearCanvasData = useCallback(() => {
    for (const id of ['stopa', 'drew', 'daniel'] as CanvasId[]) {
      strokesRef.current[id] = [];
      queuesRef.current[id] = [];
    }
    recordingRef.current = [];
    coordsBufferRef.current = [];
    setFlyingCoords([]);
    coordCounterRef.current = 0;
  }, []);

  const clearAutoplay = useCallback(() => {
    if (autoplayTimerRef.current) {
      clearTimeout(autoplayTimerRef.current);
      autoplayTimerRef.current = null;
    }
    if (replayTimerRef.current) {
      clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }
    autoplayActiveRef.current = false;
  }, []);

  // ─── Autoplay ───

  const startAutoplay = useCallback(() => {
    clearAutoplay();
    autoplayActiveRef.current = true;
    autoplayStrokeIdxRef.current = 0;
    autoplayPointIdxRef.current = 0;

    activeSourceRef.current = 'stopa';
    setDanielJoined(false);
    danielJoinedRef.current = false;
    clearCanvasData();

    const playNextPoint = () => {
      if (!autoplayActiveRef.current) return;

      const si = autoplayStrokeIdxRef.current;
      const pi = autoplayPointIdxRef.current;

      if (si >= PREDEFINED_STROKES.length) {
        cursorPosRef.current = null;
        autoplayActiveRef.current = false;
        activeSourceRef.current = null;
        return;
      }

      const stroke = PREDEFINED_STROKES[si];
      if (pi >= stroke.length) {
        autoplayStrokeIdxRef.current = si + 1;
        autoplayPointIdxRef.current = 0;
        autoplayTimerRef.current = setTimeout(playNextPoint, 100);
        return;
      }

      const point = stroke[pi];

      const sourceStrokes = strokesRef.current['stopa'];
      while (sourceStrokes.length <= si) sourceStrokes.push([]);
      sourceStrokes[si].push(point);

      cursorPosRef.current = point;

      queuesRef.current['drew'].push({ strokeIdx: si, point });
      if (danielJoinedRef.current) {
        queuesRef.current['daniel'].push({ strokeIdx: si, point });
      }
      recordingRef.current.push({ strokeIdx: si, point });

      coordCounterRef.current += 1;
      if (coordCounterRef.current % 3 === 0) {
        spawnFlyingCoord('drew', point);
        if (danielJoinedRef.current) {
          spawnFlyingCoord('daniel', point);
        }
      }

      autoplayPointIdxRef.current = pi + 1;
      autoplayTimerRef.current = setTimeout(playNextPoint, 18);
    };

    playNextPoint();
  }, [clearAutoplay, clearCanvasData, spawnFlyingCoord]);

  // Trigger autoplay on scroll-in
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startAutoplay();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearAutoplay();
    };
  }, [startAutoplay, clearAutoplay]);

  // ─── User drawing ───

  const getCanvasPoint = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): Point | null => {
      const canvas = canvasRefs.current['stopa'];
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      clearAutoplay();
      cursorPosRef.current = null;

      // Clear canvas data but preserve Daniel's join status
      clearCanvasData();
      activeSourceRef.current = 'stopa';
      isDrawingRef.current = true;

      const point = getCanvasPoint(e);
      if (!point) return;

      strokesRef.current['stopa'].push([point]);
      currentStrokeRef.current = strokesRef.current['stopa'][0];

      queuesRef.current['drew'].push({ strokeIdx: 0, point });
      if (danielJoinedRef.current) {
        queuesRef.current['daniel'].push({ strokeIdx: 0, point });
      }
      recordingRef.current.push({ strokeIdx: 0, point });
    },
    [clearAutoplay, clearCanvasData, getCanvasPoint],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      if (activeSourceRef.current !== 'stopa') return;
      const point = getCanvasPoint(e);
      if (!point) return;
      currentStrokeRef.current.push(point);
      const strokeIdx = strokesRef.current['stopa'].length - 1;

      queuesRef.current['drew'].push({ strokeIdx, point });
      if (danielJoinedRef.current) {
        queuesRef.current['daniel'].push({ strokeIdx, point });
      }
      recordingRef.current.push({ strokeIdx, point });

      coordCounterRef.current += 1;
      if (coordCounterRef.current % 3 === 0) {
        spawnFlyingCoord('drew', point);
        if (danielJoinedRef.current) {
          spawnFlyingCoord('daniel', point);
        }
      }
    },
    [getCanvasPoint, spawnFlyingCoord],
  );

  const handlePointerUp = useCallback(() => {
    isDrawingRef.current = false;
    currentStrokeRef.current = [];
    activeSourceRef.current = null;
  }, []);

  // ─── Join ───

  const handleJoin = useCallback(() => {
    setDanielJoined(true);

    const recording = [...recordingRef.current];

    // Push all history to Daniel's queue synchronously (no ordering issues)
    for (const entry of recording) {
      queuesRef.current['daniel'].push({
        strokeIdx: entry.strokeIdx,
        point: entry.point,
      });
    }

    // Now enable live streaming to Daniel
    danielJoinedRef.current = true;

    // After entrance animation, setup canvas & spawn replay flying coords
    setTimeout(() => {
      setupCanvas(canvasRefs.current['daniel']);

      let i = 0;
      const spawnNext = () => {
        if (i >= recording.length) return;
        if (i % 3 === 0) {
          spawnFlyingCoord('daniel', recording[i].point);
        }
        i++;
        setTimeout(spawnNext, 12);
      };
      spawnNext();
    }, 350);
  }, [setupCanvas, spawnFlyingCoord]);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center justify-center gap-12">
        {/* ─── Stopa (publisher) ─── */}
        <div style={{ width: 200 }}>
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <img
              src="/img/landing/stopa.jpg"
              alt="Stopa"
              className="h-5 w-5 rounded-full object-cover"
            />
            <span className="text-xs font-medium">Stopa</span>
          </div>
          <div
            ref={stopaWrapperRef}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
          >
            <div className="relative">
              <canvas
                ref={(el) => {
                  canvasRefs.current['stopa'] = el;
                }}
                className="w-full cursor-crosshair"
                style={{ aspectRatio: '4/3', touchAction: 'none' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
              <div
                ref={cursorRef}
                className="pointer-events-none absolute z-10"
                style={{ display: 'none' }}
              >
                <svg
                  width="16"
                  height="20"
                  viewBox="0 0 16 20"
                  fill="none"
                  className="drop-shadow-md"
                >
                  <path
                    d="M1 1L1 15L5 11L9 18L12 16.5L8 9.5L13 9L1 1Z"
                    fill="black"
                    stroke="white"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Instant server ─── */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-400"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <span className="text-[10px] font-medium text-gray-400">
            Instant
          </span>
        </div>

        {/* ─── Subscribers column ─── */}
        <div className="flex flex-col gap-3">
          {/* Drew */}
          <div
            style={{
              width: 130,
              transform: 'translateY(12px) rotate(-2deg)',
            }}
          >
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <img
                src="/img/landing/drew.jpg"
                alt="Drew"
                className="h-5 w-5 rounded-full object-cover"
              />
              <span className="text-xs font-medium">Drew</span>
            </div>
            <div
              ref={drewWrapperRef}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
            >
              <canvas
                ref={(el) => {
                  canvasRefs.current['drew'] = el;
                }}
                className="w-full"
                style={{ aspectRatio: '4/3' }}
              />
            </div>
          </div>

          {/* Daniel or Join placeholder */}
          <AnimatePresence mode="wait">
            {danielJoined ? (
              <motion.div
                key="daniel"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                style={{
                  width: 130,
                  transform: 'translateY(4px) rotate(1.5deg)',
                }}
              >
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <img
                    src="/img/landing/daniel.png"
                    alt="Daniel"
                    className="h-5 w-5 rounded-full object-cover"
                  />
                  <span className="text-xs font-medium">Daniel</span>
                </div>
                <div
                  ref={danielWrapperRef}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                >
                  <canvas
                    ref={(el) => {
                      canvasRefs.current['daniel'] = el;
                    }}
                    className="w-full"
                    style={{ aspectRatio: '4/3' }}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="join"
                onClick={handleJoin}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                style={{
                  width: 130,
                  transform: 'translateY(4px) rotate(1.5deg)',
                }}
                className="group text-left"
              >
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-gray-300 transition-colors group-hover:border-orange-300">
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      className="text-gray-300 transition-colors group-hover:text-orange-400"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-gray-300 transition-colors group-hover:text-orange-400">
                    Join
                  </span>
                </div>
                <div
                  className="flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white/40 transition-colors group-hover:border-orange-200 group-hover:bg-orange-50/30"
                  style={{ aspectRatio: '4/3' }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-gray-200 transition-colors group-hover:text-orange-300"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="22" y1="11" x2="16" y2="11" />
                  </svg>
                </div>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Flying coordinate labels */}
      {flyingCoords.map((coord) => (
        <motion.span
          key={coord.id}
          className="pointer-events-none absolute font-mono text-[9px] font-medium text-orange-400/70"
          style={{ left: 0, top: 0, whiteSpace: 'nowrap' }}
          initial={{
            x: coord.startX,
            y: coord.startY - 5,
            opacity: 0.9,
          }}
          animate={{
            x: coord.endX,
            y: coord.endY - 5,
            opacity: 0,
          }}
          transition={{ duration: 0.45, ease: 'linear' }}
          onAnimationComplete={() => removeCoord(coord.id)}
        >
          {coord.label}
        </motion.span>
      ))}
    </div>
  );
}
