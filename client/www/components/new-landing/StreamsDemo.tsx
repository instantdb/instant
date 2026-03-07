'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Pre-defined doodle: Instant logo ───────────────────
// A square with a vertical bar inside, drawn as pen strokes.
// Coords are normalized 0–1. Canvas is 4:3, so we adjust
// y to make the square visually square.

function rectStroke(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  pointsPerSide: number,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const sides: [number, number, number, number][] = [
    [x1, y1, x2, y1], // top
    [x2, y1, x2, y2], // right
    [x2, y2, x1, y2], // bottom
    [x1, y2, x1, y1], // left
  ];
  for (const [sx, sy, ex, ey] of sides) {
    for (let i = 0; i < pointsPerSide; i++) {
      const t = i / pointsPerSide;
      pts.push({ x: sx + (ex - sx) * t, y: sy + (ey - sy) * t });
    }
  }
  pts.push({ x: x1, y: y1 }); // close
  return pts;
}

// Outer square: centered, visually square on a 4:3 canvas
// dx=0.45, dy=0.45*(4/3)=0.6
const OUTER = rectStroke(0.275, 0.2, 0.725, 0.8, 10);

// Inner vertical bar (proportional to real logo)
const barX1 = 0.275 + 0.184 * 0.45;
const barX2 = 0.275 + 0.454 * 0.45;
const barY1 = 0.2 + 0.178 * 0.6;
const barY2 = 0.2 + 0.827 * 0.6;
const INNER_BAR = rectStroke(barX1, barY1, barX2, barY2, 8);

const PREDEFINED_STROKES = [OUTER, INNER_BAR];

// ─── Drawing helpers ────────────────────────────────────

type Point = { x: number; y: number };
type CanvasId = 'stopa' | 'drew' | 'daniel';

const CANVASES: {
  id: CanvasId;
  name: string;
  img: string;
  offsetY: number;
  rotate: number;
  scale: number;
}[] = [
  {
    id: 'stopa',
    name: 'Stopa',
    img: '/img/landing/stopa.jpg',
    offsetY: 0,
    rotate: 0,
    scale: 1,
  },
  {
    id: 'drew',
    name: 'Drew',
    img: '/img/landing/drew.jpg',
    offsetY: 20,
    rotate: -2,
    scale: 0.65,
  },
  {
    id: 'daniel',
    name: 'Daniel',
    img: '/img/landing/daniel.png',
    offsetY: 8,
    rotate: 1.5,
    scale: 0.65,
  },
];

const STROKE_COLOR = '#F97316';
const LINE_WIDTH = 2.5;
const DOT_GRID_COLOR = '#e5e7eb';
const DOT_GRID_SPACING = 20;

// Cached offscreen dot grid (static content, drawn once per size)
let dotGridCacheCanvas: HTMLCanvasElement | null = null;
let dotGridCacheW = 0;
let dotGridCacheH = 0;
let dotGridCacheDpr = 0;

function getDotGridCanvas(w: number, h: number, dpr: number): HTMLCanvasElement {
  if (dotGridCacheCanvas && dotGridCacheW === w && dotGridCacheH === h && dotGridCacheDpr === dpr) {
    return dotGridCacheCanvas;
  }
  if (!dotGridCacheCanvas) {
    dotGridCacheCanvas = document.createElement('canvas');
  }
  dotGridCacheCanvas.width = w * dpr;
  dotGridCacheCanvas.height = h * dpr;
  const ctx = dotGridCacheCanvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = DOT_GRID_COLOR;
  for (let x = DOT_GRID_SPACING; x < w; x += DOT_GRID_SPACING) {
    for (let y = DOT_GRID_SPACING; y < h; y += DOT_GRID_SPACING) {
      ctx.beginPath();
      ctx.arc(x, y, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  dotGridCacheW = w;
  dotGridCacheH = h;
  dotGridCacheDpr = dpr;
  return dotGridCacheCanvas;
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
  ctx.drawImage(getDotGridCanvas(w, h, dpr), 0, 0, w, h);
  drawStrokes(ctx, strokes, w, h);
}

// ─── StreamsDemo component ──────────────────────────────

export function StreamsDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null);
  const dprRef = useRef(1);
  const rafRef = useRef<number>(0);
  const dirtyRef = useRef(true);

  // Per-canvas refs
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

  // Which canvas is currently being drawn on
  const activeSourceRef = useRef<CanvasId | null>(null);

  // Which canvas was the source for the recording (for replay)
  const recordingSourceRef = useRef<CanvasId>('stopa');

  // Autoplay state
  const autoplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoplayActiveRef = useRef(false);
  const autoplayStrokeIdxRef = useRef(0);
  const autoplayPointIdxRef = useRef(0);

  // Recording & replay
  const recordingRef = useRef<{ strokeIdx: number; point: Point }[]>([]);
  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReplayingRef = useRef(false);

  // Stream consumer interval
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Drawing state
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Point[]>([]);

  // UI state
  const [showReplay, setShowReplay] = useState(false);

  const setupCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
  }, []);

  const redraw = useCallback(() => {
    for (const id of CANVASES) {
      renderCanvas(
        canvasRefs.current[id.id],
        strokesRef.current[id.id],
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
      if (dirtyRef.current) {
        dirtyRef.current = false;
        redraw();
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [redraw]);

  // Stream consumer: shifts from each non-source queue per tick
  useEffect(() => {
    streamIntervalRef.current = setInterval(() => {
      const source = activeSourceRef.current;
      for (const { id } of CANVASES) {
        if (id === source) continue;
        const item = queuesRef.current[id].shift();
        if (!item) continue;
        const strokes = strokesRef.current[id];
        while (strokes.length <= item.strokeIdx) {
          strokes.push([]);
        }
        strokes[item.strokeIdx].push(item.point);
        dirtyRef.current = true;
      }
    }, 12);
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, []);

  // Canvas sizing
  useEffect(() => {
    for (const { id } of CANVASES) {
      setupCanvas(canvasRefs.current[id]);
    }
    redraw();

    const handleResize = () => {
      for (const { id } of CANVASES) {
        setupCanvas(canvasRefs.current[id]);
      }
      redraw();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setupCanvas, redraw]);

  // ─── Clear helpers ───

  const clearAllData = useCallback(() => {
    for (const { id } of CANVASES) {
      strokesRef.current[id] = [];
      queuesRef.current[id] = [];
    }
    recordingRef.current = [];
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
    isReplayingRef.current = false;
  }, []);

  // ─── Autoplay ───

  const startAutoplay = useCallback(() => {
    clearAutoplay();
    autoplayActiveRef.current = true;
    autoplayStrokeIdxRef.current = 0;
    autoplayPointIdxRef.current = 0;

    activeSourceRef.current = 'stopa';

    recordingSourceRef.current = 'stopa';
    clearAllData();

    const playNextPoint = () => {
      if (!autoplayActiveRef.current) return;

      const si = autoplayStrokeIdxRef.current;
      const pi = autoplayPointIdxRef.current;

      if (si >= PREDEFINED_STROKES.length) {
        cursorPosRef.current = null;
        autoplayActiveRef.current = false;
        activeSourceRef.current = null;

        setShowReplay(true);

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

      // Push to source canvas directly
      const sourceStrokes = strokesRef.current['stopa'];
      while (sourceStrokes.length <= si) {
        sourceStrokes.push([]);
      }
      sourceStrokes[si].push(point);

      // Push to other canvases' queues
      cursorPosRef.current = point;
      for (const { id } of CANVASES) {
        if (id === 'stopa') continue;
        queuesRef.current[id].push({ strokeIdx: si, point });
      }
      recordingRef.current.push({ strokeIdx: si, point });
      dirtyRef.current = true;

      autoplayPointIdxRef.current = pi + 1;
      autoplayTimerRef.current = setTimeout(playNextPoint, 18);
    };

    playNextPoint();
  }, [clearAutoplay, clearAllData]);

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
    (
      canvasId: CanvasId,
      e: React.PointerEvent<HTMLCanvasElement>,
    ): Point | null => {
      const canvas = canvasRefs.current[canvasId];
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
    (canvasId: CanvasId, e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      clearAutoplay();
      cursorPosRef.current = null;
      setShowReplay(false);

      clearAllData();
      activeSourceRef.current = canvasId;
      recordingSourceRef.current = canvasId;

      isDrawingRef.current = true;
      const point = getCanvasPoint(canvasId, e);
      if (!point) return;

      strokesRef.current[canvasId].push([point]);
      currentStrokeRef.current = strokesRef.current[canvasId][0];

      // Push to other canvases' queues
      for (const { id } of CANVASES) {
        if (id === canvasId) continue;
        queuesRef.current[id].push({ strokeIdx: 0, point });
      }
      recordingRef.current.push({ strokeIdx: 0, point });
      dirtyRef.current = true;
    },
    [clearAutoplay, clearAllData, getCanvasPoint],
  );

  const handlePointerMove = useCallback(
    (canvasId: CanvasId, e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      const source = activeSourceRef.current;
      if (source !== canvasId) return;
      const point = getCanvasPoint(canvasId, e);
      if (!point) return;
      currentStrokeRef.current.push(point);
      const strokeIdx = strokesRef.current[canvasId].length - 1;

      // Push to other canvases' queues
      for (const { id } of CANVASES) {
        if (id === canvasId) continue;
        queuesRef.current[id].push({ strokeIdx, point });
      }
      recordingRef.current.push({ strokeIdx, point });
      dirtyRef.current = true;
    },
    [getCanvasPoint],
  );

  const handlePointerUp = useCallback(() => {
    isDrawingRef.current = false;
    currentStrokeRef.current = [];
    activeSourceRef.current = null;

    setShowReplay(true);
  }, []);

  // ─── Replay ───

  const handleReplay = useCallback(() => {
    setShowReplay(false);

    // Copy recording before clearing
    const recording = [...recordingRef.current];
    const source = recordingSourceRef.current;

    clearAllData();
    isReplayingRef.current = true;
    activeSourceRef.current = source;

    let pos = 0;
    const total = recording.length;

    const step = () => {
      if (pos >= total) {
        isReplayingRef.current = false;
        activeSourceRef.current = null;
        cursorPosRef.current = null;
        setShowReplay(true);

        return;
      }

      const entry = recording[pos];
      const sourceStrokes = strokesRef.current[source];
      while (sourceStrokes.length <= entry.strokeIdx) {
        sourceStrokes.push([]);
      }
      sourceStrokes[entry.strokeIdx].push(entry.point);

      for (const { id } of CANVASES) {
        if (id === source) continue;
        queuesRef.current[id].push({
          strokeIdx: entry.strokeIdx,
          point: entry.point,
        });
      }
      recordingRef.current.push(entry);

      if (source === 'stopa') {
        cursorPosRef.current = entry.point;
      }
      dirtyRef.current = true;

      pos++;
      replayTimerRef.current = setTimeout(step, 9);
    };

    step();
  }, [clearAllData]);

  return (
    <div ref={containerRef}>
      <div className="flex items-start justify-between">
        {CANVASES.map((config) => (
          <div
            key={config.id}
            style={{
              width: `${config.scale * 200}px`,
              transform: `translateY(${config.offsetY}px) rotate(${config.rotate}deg)`,
            }}
          >
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <img
                src={config.img}
                alt={config.name}
                className="h-5 w-5 rounded-full object-cover"
              />
              <span className="text-xs font-medium">{config.name}</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="relative">
                <canvas
                  ref={(el) => {
                    canvasRefs.current[config.id] = el;
                  }}
                  className="w-full cursor-crosshair"
                  style={{ aspectRatio: '4/3', touchAction: 'none' }}
                  onPointerDown={(e) => handlePointerDown(config.id, e)}
                  onPointerMove={(e) => handlePointerMove(config.id, e)}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                />
                {/* Cursor overlay — only on stopa's canvas */}
                {config.id === 'stopa' && (
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
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Replay button */}
      <div className="mt-2 flex h-5 justify-end">
        <AnimatePresence>
          {showReplay && (
            <motion.button
              onClick={handleReplay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-400 transition-colors hover:text-gray-600"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              Replay
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
