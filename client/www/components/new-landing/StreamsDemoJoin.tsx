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
const CANVAS_IDS: CanvasId[] = ['stopa', 'drew', 'daniel'];

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
  dotGridCache: HTMLCanvasElement | null,
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (dotGridCache) {
    ctx.drawImage(dotGridCache, 0, 0, w, h);
  } else {
    drawDotGrid(ctx, w, h);
  }
  drawStrokes(ctx, strokes, w, h);
}

function buildDotGridCache(w: number, h: number, dpr: number) {
  const offscreen = document.createElement('canvas');
  offscreen.width = w * dpr;
  offscreen.height = h * dpr;
  const ctx = offscreen.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawDotGrid(ctx, w, h);
  return offscreen;
}

// ─── Flying pellet (imperative SVG + Web Animations API) ─

const SVG_NS = 'http://www.w3.org/2000/svg';

function spawnPellet(
  svg: SVGSVGElement,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  variant: 'live' | 'storage',
) {
  const path = document.createElementNS(SVG_NS, 'path');
  const color = variant === 'live' ? '#F97316' : '#6366F1';

  path.setAttribute('d', `M${startX},${startY} L${endX},${endY}`);
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', '2.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('fill', 'none');

  svg.appendChild(path);

  const totalLength = path.getTotalLength();
  const segLen = totalLength * 0.3;
  path.style.strokeDasharray = `${segLen} ${totalLength}`;

  const anim = path.animate(
    [
      { strokeDashoffset: '0', opacity: '0.9' },
      { strokeDashoffset: `${-totalLength}`, opacity: '0' },
    ],
    { duration: 450, easing: 'ease-in', fill: 'forwards' },
  );

  anim.onfinish = () => path.remove();
}

// ─── StreamsDemoJoin component ───────────────────────────

export function StreamsDemoJoin() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null);
  const dprRef = useRef(1);
  const rafRef = useRef<number>(0);

  // Wrapper refs for flying coord positioning
  const stopaWrapperRef = useRef<HTMLDivElement>(null);
  const serverRef = useRef<HTMLDivElement>(null);
  const storageRef = useRef<HTMLDivElement>(null);
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

  // Flying coords (imperative)
  const pelletSvgRef = useRef<SVGSVGElement>(null);
  const coordCounterRef = useRef(0);

  // Dot grid cache (per canvas)
  const dotGridCacheRef = useRef<Record<CanvasId, HTMLCanvasElement | null>>({
    stopa: null,
    drew: null,
    daniel: null,
  });

  // Dirty flags
  const dirtyRef = useRef<Record<CanvasId, boolean>>({
    stopa: true,
    drew: true,
    daniel: true,
  });
  const cursorDirtyRef = useRef(true);

  const setupCanvas = useCallback(
    (id: CanvasId, canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      dotGridCacheRef.current[id] = buildDotGridCache(
        rect.width,
        rect.height,
        dpr,
      );
      dirtyRef.current[id] = true;
    },
    [],
  );

  const redraw = useCallback(() => {
    for (const id of CANVAS_IDS) {
      if (!dirtyRef.current[id]) continue;
      renderCanvas(
        canvasRefs.current[id],
        strokesRef.current[id],
        dprRef.current,
        dotGridCacheRef.current[id],
      );
      dirtyRef.current[id] = false;
    }
    if (cursorDirtyRef.current) {
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
      cursorDirtyRef.current = false;
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

  // Stream consumer: Drew always, Daniel only after join
  useEffect(() => {
    streamIntervalRef.current = setInterval(() => {
      const source = activeSourceRef.current;
      for (const id of CANVAS_IDS) {
        if (id === source) continue;
        if (id === 'daniel' && !danielJoinedRef.current) continue;
        const item = queuesRef.current[id].shift();
        if (!item) continue;
        const strokes = strokesRef.current[id];
        while (strokes.length <= item.strokeIdx) {
          strokes.push([]);
        }
        strokes[item.strokeIdx].push(item.point);
        dirtyRef.current[id] = true;
      }
    }, 12);
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, []);

  // Canvas sizing
  useEffect(() => {
    for (const id of CANVAS_IDS) {
      setupCanvas(id, canvasRefs.current[id]);
    }
    redraw();

    const handleResize = () => {
      for (const id of CANVAS_IDS) {
        setupCanvas(id, canvasRefs.current[id]);
      }
      redraw();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setupCanvas, redraw]);

  // ─── Flying coord helpers ───

  const getWrapperEl = useCallback(
    (id: CanvasId): HTMLDivElement | null =>
      id === 'stopa'
        ? stopaWrapperRef.current
        : id === 'drew'
          ? drewWrapperRef.current
          : danielWrapperRef.current,
    [],
  );

  // Spawn pellets for a broadcast: source → server → all active dests + server → storage
  const spawnBroadcastPellets = useCallback(
    (sourceId: CanvasId, _point: Point) => {
      const svg = pelletSvgRef.current;
      const container = containerRef.current;
      const server = serverRef.current;
      const storage = storageRef.current;
      const sourceEl = getWrapperEl(sourceId);
      if (!svg || !container || !server || !storage || !sourceEl) return;

      const cRect = container.getBoundingClientRect();
      const svRect = server.getBoundingClientRect();
      const stRect = storage.getBoundingClientRect();
      const sRect = sourceEl.getBoundingClientRect();

      const serverCX = svRect.left + svRect.width / 2 - cRect.left;
      const serverCY = svRect.top + svRect.height / 2 - cRect.top;

      // Inbound: source → server
      const sourceIsLeft = sRect.right < svRect.left;
      spawnPellet(
        svg,
        sourceIsLeft
          ? sRect.right - cRect.left + 6
          : sRect.left - cRect.left - 6,
        sRect.top - cRect.top + sRect.height / 2,
        sourceIsLeft
          ? svRect.left - cRect.left - 2
          : svRect.right - cRect.left + 2,
        serverCY,
        'live',
      );

      // Outbound: server → each dest
      for (const destId of CANVAS_IDS) {
        if (destId === sourceId) continue;
        if (destId === 'daniel' && !danielJoinedRef.current) continue;
        const destEl = getWrapperEl(destId);
        if (!destEl) continue;
        const dRect = destEl.getBoundingClientRect();
        const destIsRight = dRect.left > svRect.right;
        spawnPellet(
          svg,
          destIsRight
            ? svRect.right - cRect.left + 2
            : svRect.left - cRect.left - 2,
          serverCY,
          destIsRight
            ? dRect.left - cRect.left - 6
            : dRect.right - cRect.left + 6,
          dRect.top - cRect.top + dRect.height / 2,
          'live',
        );
      }

      // Persist: server → storage
      spawnPellet(
        svg,
        serverCX,
        svRect.bottom - cRect.top + 2,
        stRect.left + stRect.width / 2 - cRect.left,
        stRect.top - cRect.top,
        'storage',
      );
    },
    [getWrapperEl],
  );

  // Spawn pellet from storage directly → Daniel
  const spawnStorageCoord = useCallback((_point: Point) => {
    const svg = pelletSvgRef.current;
    const container = containerRef.current;
    const storage = storageRef.current;
    const destWrapper = danielWrapperRef.current;
    if (!svg || !container || !storage || !destWrapper) return;

    const cRect = container.getBoundingClientRect();
    const stRect = storage.getBoundingClientRect();
    const dRect = destWrapper.getBoundingClientRect();

    spawnPellet(
      svg,
      stRect.right - cRect.left + 2,
      stRect.top + stRect.height / 2 - cRect.top,
      dRect.left - cRect.left - 6,
      dRect.top - cRect.top + dRect.height / 2,
      'storage',
    );
  }, []);

  // ─── Clear helpers ───

  const clearCanvasData = useCallback(() => {
    for (const id of CANVAS_IDS) {
      strokesRef.current[id] = [];
      queuesRef.current[id] = [];
      dirtyRef.current[id] = true;
    }
    cursorDirtyRef.current = true;
    recordingRef.current = [];
    coordCounterRef.current = 0;
    const svg = pelletSvgRef.current;
    if (svg) {
      while (svg.firstChild) svg.firstChild.remove();
    }
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
        cursorDirtyRef.current = true;
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
      dirtyRef.current['stopa'] = true;

      cursorPosRef.current = point;
      cursorDirtyRef.current = true;

      queuesRef.current['drew'].push({ strokeIdx: si, point });
      if (danielJoinedRef.current) {
        queuesRef.current['daniel'].push({ strokeIdx: si, point });
      }
      recordingRef.current.push({ strokeIdx: si, point });

      coordCounterRef.current += 1;
      if (coordCounterRef.current % 3 === 0) {
        spawnBroadcastPellets('stopa', point);
      }

      autoplayPointIdxRef.current = pi + 1;
      autoplayTimerRef.current = setTimeout(playNextPoint, 18);
    };

    playNextPoint();
  }, [clearAutoplay, clearCanvasData, spawnBroadcastPellets]);

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
      cursorDirtyRef.current = true;

      clearCanvasData();
      activeSourceRef.current = canvasId;
      isDrawingRef.current = true;

      const point = getCanvasPoint(canvasId, e);
      if (!point) return;

      strokesRef.current[canvasId].push([point]);
      currentStrokeRef.current = strokesRef.current[canvasId][0];
      dirtyRef.current[canvasId] = true;

      for (const id of CANVAS_IDS) {
        if (id === canvasId) continue;
        if (id === 'daniel' && !danielJoinedRef.current) continue;
        queuesRef.current[id].push({ strokeIdx: 0, point });
      }
      recordingRef.current.push({ strokeIdx: 0, point });
    },
    [clearAutoplay, clearCanvasData, getCanvasPoint],
  );

  const handlePointerMove = useCallback(
    (canvasId: CanvasId, e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      if (activeSourceRef.current !== canvasId) return;
      const point = getCanvasPoint(canvasId, e);
      if (!point) return;
      currentStrokeRef.current.push(point);
      dirtyRef.current[canvasId] = true;
      const strokeIdx = strokesRef.current[canvasId].length - 1;

      for (const id of CANVAS_IDS) {
        if (id === canvasId) continue;
        if (id === 'daniel' && !danielJoinedRef.current) continue;
        queuesRef.current[id].push({ strokeIdx, point });
      }
      recordingRef.current.push({ strokeIdx, point });

      coordCounterRef.current += 1;
      if (coordCounterRef.current % 3 === 0) {
        spawnBroadcastPellets(canvasId, point);
      }
    },
    [getCanvasPoint, spawnBroadcastPellets],
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

    // After entrance animation, setup canvas & spawn replay flying coords from storage
    setTimeout(() => {
      setupCanvas('daniel', canvasRefs.current['daniel']);

      let i = 0;
      const spawnNext = () => {
        if (i >= recording.length) return;
        if (i % 3 === 0) {
          spawnStorageCoord(recording[i].point);
        }
        i++;
        setTimeout(spawnNext, 12);
      };
      spawnNext();
    }, 350);
  }, [setupCanvas, spawnStorageCoord]);

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
                onPointerDown={(e) => handlePointerDown('stopa', e)}
                onPointerMove={(e) => handlePointerMove('stopa', e)}
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

        {/* ─── Instant server + storage ─── */}
        <div className="flex flex-col items-center gap-3">
          <div ref={serverRef}>
            <img
              src="/img/icon/logo-512.svg"
              alt="Instant servers"
              className="h-[28px] w-[28px]"
            />
          </div>

          {/* S3 storage */}
          <div ref={storageRef}>
            <img
              src="/img/landing/s3-bucket.svg"
              alt="S3"
              className="h-[28px] w-[28px]"
            />
          </div>
        </div>

        {/* ─── Subscribers column ─── */}
        <div className="flex flex-col gap-3">
          {/* Drew */}
          <div
            style={{
              width: 130,
              transform: 'translateY(12px) rotate(2deg)',
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
                className="w-full cursor-crosshair"
                style={{ aspectRatio: '4/3', touchAction: 'none' }}
                onPointerDown={(e) => handlePointerDown('drew', e)}
                onPointerMove={(e) => handlePointerMove('drew', e)}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
            </div>
          </div>

          {/* Daniel — always rendered, with Join overlay when not joined */}
          <div
            style={{
              width: 130,
              transform: 'translateY(4px) rotate(-3deg)',
            }}
          >
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <img
                src="/img/landing/daniel.png"
                alt="Daniel"
                className={`h-5 w-5 rounded-full object-cover transition-opacity ${danielJoined ? '' : 'opacity-40'}`}
              />
              <span
                className={`text-xs font-medium transition-opacity ${danielJoined ? '' : 'opacity-40'}`}
              >
                Daniel
              </span>
            </div>
            <div
              ref={danielWrapperRef}
              className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
            >
              <canvas
                ref={(el) => {
                  canvasRefs.current['daniel'] = el;
                }}
                className="w-full cursor-crosshair"
                style={{ aspectRatio: '4/3', touchAction: 'none' }}
                onPointerDown={(e) => handlePointerDown('daniel', e)}
                onPointerMove={(e) => handlePointerMove('daniel', e)}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
              {/* Join overlay */}
              <AnimatePresence>
                {!danielJoined && (
                  <motion.div
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]"
                  >
                    <button
                      onClick={handleJoin}
                      className="cursor-pointer rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-[0_0_20px_rgba(234,88,12,0.3)] transition-all hover:bg-orange-700 hover:shadow-[0_0_30px_rgba(234,88,12,0.45)]"
                    >
                      Join
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Flying pellets — imperative SVG, animated via Web Animations API */}
      <svg
        ref={pelletSvgRef}
        className="pointer-events-none absolute top-0 left-0 h-full w-full"
      />
    </div>
  );
}
