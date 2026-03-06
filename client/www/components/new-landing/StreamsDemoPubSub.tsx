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
type CanvasId = 'publisher' | 'subscriber';

const PUBLISHER = {
  id: 'publisher' as CanvasId,
  name: 'Stopa',
  img: '/img/landing/stopa.jpg',
};
const SUBSCRIBER = {
  id: 'subscriber' as CanvasId,
  name: 'Drew',
  img: '/img/landing/drew.jpg',
};

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

// ─── StreamsDemoPubSub component ────────────────────────

export function StreamsDemoPubSub() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null);
  const dprRef = useRef(1);
  const rafRef = useRef<number>(0);

  const canvasRefs = useRef<Record<CanvasId, HTMLCanvasElement | null>>({
    publisher: null,
    subscriber: null,
  });
  const strokesRef = useRef<Record<CanvasId, Point[][]>>({
    publisher: [],
    subscriber: [],
  });
  const queueRef = useRef<{ strokeIdx: number; point: Point }[]>([]);

  const autoplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoplayActiveRef = useRef(false);
  const autoplayStrokeIdxRef = useRef(0);
  const autoplayPointIdxRef = useRef(0);

  const recordingRef = useRef<{ strokeIdx: number; point: Point }[]>([]);
  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReplayingRef = useRef(false);

  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Point[]>([]);
  const isActiveRef = useRef(false);

  const [showReplay, setShowReplay] = useState(false);
  const [livePoint, setLivePoint] = useState<Point | null>(null);
  const [receivedPoint, setReceivedPoint] = useState<Point | null>(null);

  // Throttle state updates for code blocks
  const liveThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recvThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setLivePointThrottled = useCallback((p: Point) => {
    if (liveThrottleRef.current) return;
    setLivePoint(p);
    liveThrottleRef.current = setTimeout(() => {
      liveThrottleRef.current = null;
    }, 60);
  }, []);

  const setReceivedPointThrottled = useCallback((p: Point) => {
    if (recvThrottleRef.current) return;
    setReceivedPoint(p);
    recvThrottleRef.current = setTimeout(() => {
      recvThrottleRef.current = null;
    }, 60);
  }, []);

  const setupCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
  }, []);

  const redraw = useCallback(() => {
    renderCanvas(canvasRefs.current.publisher, strokesRef.current.publisher, dprRef.current);
    renderCanvas(canvasRefs.current.subscriber, strokesRef.current.subscriber, dprRef.current);
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

  // Stream consumer: shifts from subscriber queue
  useEffect(() => {
    streamIntervalRef.current = setInterval(() => {
      const item = queueRef.current.shift();
      if (!item) return;
      const strokes = strokesRef.current.subscriber;
      while (strokes.length <= item.strokeIdx) {
        strokes.push([]);
      }
      strokes[item.strokeIdx].push(item.point);
      setReceivedPointThrottled(item.point);
    }, 12);
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, [setReceivedPointThrottled]);

  useEffect(() => {
    setupCanvas(canvasRefs.current.publisher);
    setupCanvas(canvasRefs.current.subscriber);
    redraw();

    const handleResize = () => {
      setupCanvas(canvasRefs.current.publisher);
      setupCanvas(canvasRefs.current.subscriber);
      redraw();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setupCanvas, redraw]);

  const clearAllData = useCallback(() => {
    strokesRef.current.publisher = [];
    strokesRef.current.subscriber = [];
    queueRef.current = [];
    recordingRef.current = [];
    setLivePoint(null);
    setReceivedPoint(null);
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

  const startAutoplay = useCallback(() => {
    clearAutoplay();
    autoplayActiveRef.current = true;
    autoplayStrokeIdxRef.current = 0;
    autoplayPointIdxRef.current = 0;
    isActiveRef.current = true;
    clearAllData();

    const playNextPoint = () => {
      if (!autoplayActiveRef.current) return;

      const si = autoplayStrokeIdxRef.current;
      const pi = autoplayPointIdxRef.current;

      if (si >= PREDEFINED_STROKES.length) {
        cursorPosRef.current = null;
        autoplayActiveRef.current = false;
        isActiveRef.current = false;
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

      const sourceStrokes = strokesRef.current.publisher;
      while (sourceStrokes.length <= si) {
        sourceStrokes.push([]);
      }
      sourceStrokes[si].push(point);

      cursorPosRef.current = point;
      queueRef.current.push({ strokeIdx: si, point });
      recordingRef.current.push({ strokeIdx: si, point });
      setLivePointThrottled(point);

      autoplayPointIdxRef.current = pi + 1;
      autoplayTimerRef.current = setTimeout(playNextPoint, 18);
    };

    playNextPoint();
  }, [clearAutoplay, clearAllData, setLivePointThrottled]);

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

  const getCanvasPoint = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): Point | null => {
      const canvas = canvasRefs.current.publisher;
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
      setShowReplay(false);

      clearAllData();
      isActiveRef.current = true;
      isDrawingRef.current = true;
      const point = getCanvasPoint(e);
      if (!point) return;

      strokesRef.current.publisher.push([point]);
      currentStrokeRef.current = strokesRef.current.publisher[0];

      queueRef.current.push({ strokeIdx: 0, point });
      recordingRef.current.push({ strokeIdx: 0, point });
      setLivePointThrottled(point);
    },
    [clearAutoplay, clearAllData, getCanvasPoint, setLivePointThrottled],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      const point = getCanvasPoint(e);
      if (!point) return;
      currentStrokeRef.current.push(point);
      const strokeIdx = strokesRef.current.publisher.length - 1;

      queueRef.current.push({ strokeIdx, point });
      recordingRef.current.push({ strokeIdx, point });
      setLivePointThrottled(point);
    },
    [getCanvasPoint, setLivePointThrottled],
  );

  const handlePointerUp = useCallback(() => {
    isDrawingRef.current = false;
    currentStrokeRef.current = [];
    isActiveRef.current = false;
    setShowReplay(true);
  }, []);

  const handleReplay = useCallback(() => {
    setShowReplay(false);

    const recording = [...recordingRef.current];
    clearAllData();
    isReplayingRef.current = true;
    isActiveRef.current = true;

    let pos = 0;
    const total = recording.length;

    const step = () => {
      if (pos >= total) {
        isReplayingRef.current = false;
        isActiveRef.current = false;
        cursorPosRef.current = null;
        setShowReplay(true);
        return;
      }

      const entry = recording[pos];
      const sourceStrokes = strokesRef.current.publisher;
      while (sourceStrokes.length <= entry.strokeIdx) {
        sourceStrokes.push([]);
      }
      sourceStrokes[entry.strokeIdx].push(entry.point);

      queueRef.current.push({
        strokeIdx: entry.strokeIdx,
        point: entry.point,
      });
      recordingRef.current.push(entry);
      cursorPosRef.current = entry.point;
      setLivePointThrottled(entry.point);

      pos++;
      replayTimerRef.current = setTimeout(step, 9);
    };

    step();
  }, [clearAllData, setLivePointThrottled]);

  const pubX = livePoint ? livePoint.x.toFixed(2) : '0.00';
  const pubY = livePoint ? livePoint.y.toFixed(2) : '0.00';
  const subX = receivedPoint ? receivedPoint.x.toFixed(2) : '0.00';
  const subY = receivedPoint ? receivedPoint.y.toFixed(2) : '0.00';

  return (
    <div ref={containerRef}>
      <div className="flex gap-6">
        {/* Publisher card */}
        <div className="flex-1">
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <img
              src={PUBLISHER.img}
              alt={PUBLISHER.name}
              className="h-5 w-5 rounded-full object-cover"
            />
            <span className="text-xs font-medium">{PUBLISHER.name}</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="relative">
              <canvas
                ref={(el) => {
                  canvasRefs.current.publisher = el;
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
          {/* Publisher code block */}
          <div className="mt-2 rounded-lg bg-gray-900 p-3 font-mono text-[11px] leading-[18px]">
            <div>
              <span className="text-gray-400">db.streams.</span>
              <span className="text-blue-400">publish</span>
              <span className="text-gray-400">(</span>
            </div>
            <div>
              <span className="text-gray-400">{'  '}</span>
              <span className="text-green-400">&quot;drawing&quot;</span>
              <span className="text-gray-400">,</span>
            </div>
            <div>
              <span className="text-gray-400">{'  '}{'{'} x: </span>
              <span className="text-orange-400">{pubX}</span>
              <span className="text-gray-400">, y: </span>
              <span className="text-orange-400">{pubY}</span>
              <span className="text-gray-400">{' }'}</span>
            </div>
            <div>
              <span className="text-gray-400">)</span>
            </div>
          </div>
        </div>

        {/* Subscriber card */}
        <div
          className="flex-1"
          style={{ transform: 'translateY(12px) rotate(-1deg)' }}
        >
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <img
              src={SUBSCRIBER.img}
              alt={SUBSCRIBER.name}
              className="h-5 w-5 rounded-full object-cover"
            />
            <span className="text-xs font-medium">{SUBSCRIBER.name}</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="relative">
              <canvas
                ref={(el) => {
                  canvasRefs.current.subscriber = el;
                }}
                className="w-full"
                style={{ aspectRatio: '4/3' }}
              />
            </div>
          </div>
          {/* Subscriber code block */}
          <div className="mt-2 rounded-lg bg-gray-900 p-3 font-mono text-[11px] leading-[18px]">
            <div>
              <span className="text-gray-400">db.streams.</span>
              <span className="text-blue-400">subscribe</span>
              <span className="text-gray-400">(</span>
            </div>
            <div>
              <span className="text-gray-400">{'  '}</span>
              <span className="text-green-400">&quot;drawing&quot;</span>
              <span className="text-gray-400">,</span>
            </div>
            <div>
              <span className="text-gray-400">{'  '}(e) =&gt; draw(</span>
              <span className="text-orange-400">{subX}</span>
              <span className="text-gray-400">, </span>
              <span className="text-orange-400">{subY}</span>
              <span className="text-gray-400">)</span>
            </div>
            <div>
              <span className="text-gray-400">)</span>
            </div>
          </div>
        </div>
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
