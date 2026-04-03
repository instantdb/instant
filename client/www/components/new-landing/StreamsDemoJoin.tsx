'use client';

import { useRef, useEffect, useState } from 'react';
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
  canvas: HTMLCanvasElement,
  strokes: Point[][],
  dpr: number,
  dotGridCache: HTMLCanvasElement | null,
) {
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

// ─── StreamsDemo class ──────────────────────────────────

interface StreamsDemoElements {
  container: HTMLDivElement;
  canvases: Record<CanvasId, HTMLCanvasElement>;
  cursor: HTMLDivElement;
  wrappers: Record<CanvasId, HTMLDivElement>;
  server: HTMLDivElement;
  storage: HTMLDivElement;
  pelletSvg: SVGSVGElement;
}

class StreamsDemo {
  private els: StreamsDemoElements;
  private onDanielJoinedChange: (joined: boolean) => void;

  // Canvas rendering
  private dpr = 1;
  private strokes: Record<CanvasId, Point[][]> = {
    stopa: [],
    drew: [],
    daniel: [],
  };
  private queues: Record<CanvasId, { strokeIdx: number; point: Point }[]> = {
    stopa: [],
    drew: [],
    daniel: [],
  };
  private dotGridCache: Record<CanvasId, HTMLCanvasElement | null> = {
    stopa: null,
    drew: null,
    daniel: null,
  };
  private dirty: Record<CanvasId, boolean> = {
    stopa: true,
    drew: true,
    daniel: true,
  };
  private cursorDirty = true;
  private cursorPos: Point | null = null;

  // rAF
  private rafId = 0;
  private rafPending = false;

  // Source tracking
  private activeSource: CanvasId | null = null;

  // Autoplay
  private autoplayTimer: ReturnType<typeof setTimeout> | null = null;
  private autoplayActive = false;
  private autoplayStrokeIdx = 0;
  private autoplayPointIdx = 0;

  // Recording & replay
  private recording: { strokeIdx: number; point: Point }[] = [];
  private joinTimer: ReturnType<typeof setTimeout> | null = null;
  private replayTimer: ReturnType<typeof setTimeout> | null = null;

  // Stream consumer
  private streamInterval: ReturnType<typeof setInterval> | null = null;

  // Drawing state
  private isDrawing = false;
  private currentStroke: Point[] = [];

  // Daniel joined (local mirror for imperative logic)
  private danielJoined = false;

  // Pellet counter
  private coordCounter = 0;

  constructor(
    elements: StreamsDemoElements,
    onDanielJoinedChange: (joined: boolean) => void,
  ) {
    this.els = elements;
    this.onDanielJoinedChange = onDanielJoinedChange;

    for (const id of CANVAS_IDS) {
      this.setupCanvas(id);
    }
    this.scheduleRedraw();

    this.streamInterval = setInterval(() => this.consumeQueues(), 12);

    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    if (this.streamInterval) clearInterval(this.streamInterval);
    if (this.autoplayTimer) clearTimeout(this.autoplayTimer);
    if (this.joinTimer) clearTimeout(this.joinTimer);
    if (this.replayTimer) clearTimeout(this.replayTimer);
    window.removeEventListener('resize', this.handleResize);
  }

  // ─── Public methods ───

  startAutoplay() {
    this.clearAutoplay();
    this.autoplayActive = true;
    this.autoplayStrokeIdx = 0;
    this.autoplayPointIdx = 0;

    this.activeSource = 'stopa';
    this.onDanielJoinedChange(false);
    this.danielJoined = false;
    this.clearCanvasData();

    this.playNextPoint();
  }

  handlePointerDown(canvasId: CanvasId, clientX: number, clientY: number) {
    this.clearAutoplay();
    this.cursorPos = null;
    this.cursorDirty = true;

    this.clearCanvasData();
    this.activeSource = canvasId;
    this.isDrawing = true;

    const point = this.getCanvasPoint(canvasId, clientX, clientY);
    if (!point) return;

    this.strokes[canvasId].push([point]);
    this.currentStroke = this.strokes[canvasId][0];
    this.dirty[canvasId] = true;
    this.scheduleRedraw();

    for (const id of CANVAS_IDS) {
      if (id === canvasId) continue;
      if (id === 'daniel' && !this.danielJoined) continue;
      this.queues[id].push({ strokeIdx: 0, point });
    }
    this.recording.push({ strokeIdx: 0, point });
  }

  handlePointerMove(canvasId: CanvasId, clientX: number, clientY: number) {
    if (!this.isDrawing) return;
    if (this.activeSource !== canvasId) return;
    const point = this.getCanvasPoint(canvasId, clientX, clientY);
    if (!point) return;
    this.currentStroke.push(point);
    this.dirty[canvasId] = true;
    this.scheduleRedraw();
    const strokeIdx = this.strokes[canvasId].length - 1;

    for (const id of CANVAS_IDS) {
      if (id === canvasId) continue;
      if (id === 'daniel' && !this.danielJoined) continue;
      this.queues[id].push({ strokeIdx, point });
    }
    this.recording.push({ strokeIdx, point });

    this.coordCounter += 1;
    if (this.coordCounter % 3 === 0) {
      this.spawnBroadcastPellets(canvasId, point);
    }
  }

  handlePointerUp() {
    this.isDrawing = false;
    this.currentStroke = [];
    this.activeSource = null;
  }

  join() {
    this.onDanielJoinedChange(true);

    const recording = [...this.recording];

    for (const entry of recording) {
      this.queues['daniel'].push({
        strokeIdx: entry.strokeIdx,
        point: entry.point,
      });
    }

    this.danielJoined = true;

    this.joinTimer = setTimeout(() => {
      this.setupCanvas('daniel');

      let i = 0;
      const spawnNext = () => {
        if (i >= recording.length) return;
        if (i % 3 === 0) {
          this.spawnStorageCoord(recording[i].point);
        }
        i++;
        this.replayTimer = setTimeout(spawnNext, 12);
      };
      spawnNext();
    }, 350);
  }

  // ─── Private: canvas rendering ───

  private setupCanvas(id: CanvasId) {
    const canvas = this.els.canvases[id];
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    this.dotGridCache[id] = buildDotGridCache(rect.width, rect.height, dpr);
    this.dirty[id] = true;
  }

  private redraw() {
    for (const id of CANVAS_IDS) {
      if (!this.dirty[id]) continue;
      renderCanvas(
        this.els.canvases[id],
        this.strokes[id],
        this.dpr,
        this.dotGridCache[id],
      );
      this.dirty[id] = false;
    }
    if (this.cursorDirty) {
      const cursor = this.els.cursor;
      const pos = this.cursorPos;
      if (pos) {
        cursor.style.display = 'block';
        cursor.style.left = `${pos.x * 100}%`;
        cursor.style.top = `${pos.y * 100}%`;
      } else {
        cursor.style.display = 'none';
      }
      this.cursorDirty = false;
    }
  }

  private scheduleRedraw() {
    if (this.rafPending) return;
    this.rafPending = true;
    this.rafId = requestAnimationFrame(() => {
      this.rafPending = false;
      this.redraw();
    });
  }

  // ─── Private: stream consumer ───

  private consumeQueues() {
    const source = this.activeSource;
    for (const id of CANVAS_IDS) {
      if (id === source) continue;
      if (id === 'daniel' && !this.danielJoined) continue;
      const item = this.queues[id].shift();
      if (!item) continue;
      const strokes = this.strokes[id];
      while (strokes.length <= item.strokeIdx) {
        strokes.push([]);
      }
      strokes[item.strokeIdx].push(item.point);
      this.dirty[id] = true;
      this.scheduleRedraw();
    }
  }

  // ─── Private: flying coord helpers ───

  private spawnBroadcastPellets(sourceId: CanvasId, _point: Point) {
    const { container, server, storage, pelletSvg: svg, wrappers } = this.els;
    const sourceEl = wrappers[sourceId];

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
      sourceIsLeft ? sRect.right - cRect.left + 6 : sRect.left - cRect.left - 6,
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
      if (destId === 'daniel' && !this.danielJoined) continue;
      const destEl = wrappers[destId];
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
  }

  private spawnStorageCoord(_point: Point) {
    const { container, storage, pelletSvg: svg, wrappers } = this.els;
    const destWrapper = wrappers['daniel'];

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
  }

  // ─── Private: clear helpers ───

  private clearCanvasData() {
    for (const id of CANVAS_IDS) {
      this.strokes[id] = [];
      this.queues[id] = [];
      this.dirty[id] = true;
    }
    this.cursorDirty = true;
    this.recording = [];
    this.coordCounter = 0;
    const svg = this.els.pelletSvg;
    while (svg.firstChild) svg.firstChild.remove();
    this.scheduleRedraw();
  }

  private clearAutoplay() {
    if (this.autoplayTimer) {
      clearTimeout(this.autoplayTimer);
      this.autoplayTimer = null;
    }
    if (this.replayTimer) {
      clearTimeout(this.replayTimer);
      this.replayTimer = null;
    }
    this.autoplayActive = false;
  }

  // ─── Private: autoplay ───

  private playNextPoint() {
    if (!this.autoplayActive) return;

    const si = this.autoplayStrokeIdx;
    const pi = this.autoplayPointIdx;

    if (si >= PREDEFINED_STROKES.length) {
      this.cursorPos = null;
      this.cursorDirty = true;
      this.scheduleRedraw();
      this.autoplayActive = false;
      this.activeSource = null;
      return;
    }

    const stroke = PREDEFINED_STROKES[si];
    if (pi >= stroke.length) {
      this.autoplayStrokeIdx = si + 1;
      this.autoplayPointIdx = 0;
      this.autoplayTimer = setTimeout(() => this.playNextPoint(), 100);
      return;
    }

    const point = stroke[pi];

    const sourceStrokes = this.strokes['stopa'];
    while (sourceStrokes.length <= si) sourceStrokes.push([]);
    sourceStrokes[si].push(point);
    this.dirty['stopa'] = true;

    this.cursorPos = point;
    this.cursorDirty = true;
    this.scheduleRedraw();

    this.queues['drew'].push({ strokeIdx: si, point });
    if (this.danielJoined) {
      this.queues['daniel'].push({ strokeIdx: si, point });
    }
    this.recording.push({ strokeIdx: si, point });

    this.coordCounter += 1;
    if (this.coordCounter % 3 === 0) {
      this.spawnBroadcastPellets('stopa', point);
    }

    this.autoplayPointIdx = pi + 1;
    this.autoplayTimer = setTimeout(() => this.playNextPoint(), 18);
  }

  // ─── Private: pointer helpers ───

  private getCanvasPoint(
    canvasId: CanvasId,
    clientX: number,
    clientY: number,
  ): Point | null {
    const canvas = this.els.canvases[canvasId];
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }

  private handleResize() {
    for (const id of CANVAS_IDS) {
      this.setupCanvas(id);
    }
    this.scheduleRedraw();
  }
}

// ─── StreamsDemoJoin component ───────────────────────────

export function StreamsDemoJoin() {
  const [danielJoined, setDanielJoined] = useState(false);
  const demoRef = useRef<StreamsDemo | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const stopaCanvasRef = useRef<HTMLCanvasElement>(null);
  const drewCanvasRef = useRef<HTMLCanvasElement>(null);
  const danielCanvasRef = useRef<HTMLCanvasElement>(null);
  const stopaWrapperRef = useRef<HTMLDivElement>(null);
  const drewWrapperRef = useRef<HTMLDivElement>(null);
  const danielWrapperRef = useRef<HTMLDivElement>(null);
  const serverRef = useRef<HTMLDivElement>(null);
  const storageRef = useRef<HTMLDivElement>(null);
  const pelletSvgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const demo = new StreamsDemo(
      {
        container: containerRef.current!,
        canvases: {
          stopa: stopaCanvasRef.current!,
          drew: drewCanvasRef.current!,
          daniel: danielCanvasRef.current!,
        },
        cursor: cursorRef.current!,
        wrappers: {
          stopa: stopaWrapperRef.current!,
          drew: drewWrapperRef.current!,
          daniel: danielWrapperRef.current!,
        },
        server: serverRef.current!,
        storage: storageRef.current!,
        pelletSvg: pelletSvgRef.current!,
      },
      setDanielJoined,
    );
    demoRef.current = demo;
    return () => {
      demo.destroy();
      demoRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          demoRef.current?.startAutoplay();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onPointerDown = (
    canvasId: CanvasId,
    e: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    demoRef.current?.handlePointerDown(canvasId, e.clientX, e.clientY);
  };
  const onPointerMove = (
    canvasId: CanvasId,
    e: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    demoRef.current?.handlePointerMove(canvasId, e.clientX, e.clientY);
  };
  const onPointerUp = () => {
    demoRef.current?.handlePointerUp();
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center justify-center gap-6 md:gap-12">
        {/* ─── Stopa (publisher) ─── */}
        <div className="w-[130px] md:w-[200px]">
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
                ref={stopaCanvasRef}
                className="w-full cursor-crosshair"
                style={{ aspectRatio: '4/3', touchAction: 'none' }}
                onPointerDown={(e) => onPointerDown('stopa', e)}
                onPointerMove={(e) => onPointerMove('stopa', e)}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
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
            className="w-[100px] md:w-[130px]"
            style={{ transform: 'translateY(12px) rotate(2deg)' }}
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
                ref={drewCanvasRef}
                className="w-full cursor-crosshair"
                style={{ aspectRatio: '4/3', touchAction: 'none' }}
                onPointerDown={(e) => onPointerDown('drew', e)}
                onPointerMove={(e) => onPointerMove('drew', e)}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </div>
          </div>

          {/* Daniel — always rendered, with Join overlay when not joined */}
          <div
            className="w-[100px] md:w-[130px]"
            style={{ transform: 'translateY(4px) rotate(-3deg)' }}
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
                ref={danielCanvasRef}
                className="w-full cursor-crosshair"
                style={{ aspectRatio: '4/3', touchAction: 'none' }}
                onPointerDown={(e) => onPointerDown('daniel', e)}
                onPointerMove={(e) => onPointerMove('daniel', e)}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
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
                      onClick={() => demoRef.current?.join()}
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
