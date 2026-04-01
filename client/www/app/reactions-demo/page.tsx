'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';

// ─── Fake Cursor ────────────────────────────────────────

function FakeCursor({
  x,
  y,
  clicking,
  color,
}: {
  x: number;
  y: number;
  clicking: boolean;
  color: string;
}) {
  return (
    <motion.div
      className="pointer-events-none absolute z-30"
      initial={false}
      animate={{ left: x, top: y, scale: clicking ? 0.85 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <svg
        width="20"
        height="24"
        viewBox="0 0 16 20"
        fill="none"
        className="drop-shadow-md"
      >
        <path
          d="M1 1L1 15L5 11L9 18L12 16.5L8 9.5L13 9L1 1Z"
          fill={color}
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>
    </motion.div>
  );
}

// ─── Floating Emoji ─────────────────────────────────────

interface FloaterParams {
  startX: number;
  drift1: number;
  drift2: number;
  drift3: number;
  drift4: number;
  rotation: number;
}

function randomFloaterParams(): FloaterParams {
  const startX = 20 + Math.random() * 60;
  const driftRange = 18;
  return {
    startX,
    drift1: (Math.random() - 0.5) * driftRange,
    drift2: (Math.random() - 0.5) * driftRange,
    drift3: (Math.random() - 0.5) * driftRange,
    drift4: (Math.random() - 0.5) * driftRange,
    rotation: (Math.random() - 0.5) * 40,
  };
}

function spawnFloater(emoji: string, container: HTMLElement, p: FloaterParams) {
  const el = document.createElement('span');
  el.textContent = emoji;
  el.style.cssText = `position:absolute;pointer-events:none;font-size:28px;line-height:1;bottom:10px;left:${p.startX}%;margin-left:-0.5em;z-index:10;`;
  container.appendChild(el);

  const anim = el.animate(
    [
      {
        opacity: 0.7,
        transform: `translateY(0) translateX(0) scale(0.5) rotate(0deg)`,
      },
      {
        opacity: 1,
        transform: `translateY(-40px) translateX(${p.drift1}px) scale(1.1) rotate(${p.rotation * 0.3}deg)`,
        offset: 0.2,
      },
      {
        opacity: 1,
        transform: `translateY(-90px) translateX(${p.drift2}px) scale(1) rotate(${-p.rotation * 0.5}deg)`,
        offset: 0.45,
      },
      {
        opacity: 0.8,
        transform: `translateY(-140px) translateX(${p.drift3}px) scale(0.95) rotate(${p.rotation * 0.4}deg)`,
        offset: 0.7,
      },
      {
        opacity: 0,
        transform: `translateY(-190px) translateX(${p.drift4}px) scale(0.7) rotate(${-p.rotation}deg)`,
      },
    ],
    { duration: 1800, easing: 'ease-out', fill: 'forwards' },
  );

  anim.onfinish = () => el.remove();
}

// ─── Reactions ──────────────────────────────────────────

const REACTIONS = ['❤️', '🔥', '🎉', '👏'] as const;

// ─── Stream Card ────────────────────────────────────────

function StreamCard({
  label,
  tilt,
  screenRef,
  viewerCount,
}: {
  label: string;
  tilt: string;
  screenRef: (el: HTMLDivElement | null) => void;
  viewerCount: number;
}) {
  return (
    <div className={`${tilt}`}>
      <div className="w-[460px] overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-gray-200">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
          <span className="rounded bg-red-600 px-2.5 py-1 text-sm font-bold tracking-wide text-white">
            LIVE
          </span>
          <span className="text-base text-gray-500">
            {viewerCount.toLocaleString()} viewer
            {viewerCount > 1 ? 's' : ''}
          </span>
          <div className="ml-auto text-sm text-gray-400">{label}</div>
        </div>
        {/* Video area */}
        <div
          ref={screenRef}
          className="relative aspect-video overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900"
        >
          <video
            autoPlay
            muted
            playsInline
            loop
            className="absolute inset-0 h-full w-full object-cover"
            src="/img/landing/stream-clip.mp4"
          />
          <div className="absolute right-0 bottom-0 left-0 z-10">
            <div className="h-[3px] w-full bg-black/20">
              <div className="h-full w-full bg-red-500" />
            </div>
          </div>
        </div>
        {/* Reaction buttons */}
        <div className="flex justify-center gap-3 px-5 py-4">
          {REACTIONS.map((emoji) => (
            <div
              key={emoji}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-xl shadow-sm"
            >
              {emoji}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Animated Reactions Demo ────────────────────────────

function AnimatedReactionsDemo() {
  const [cursor1, setCursor1] = useState({ x: 0, y: 0 });
  const [cursor2, setCursor2] = useState({ x: 0, y: 0 });
  const [showCursor1, setShowCursor1] = useState(false);
  const [showCursor2, setShowCursor2] = useState(false);
  const [clicking1, setClicking1] = useState(false);
  const [clicking2, setClicking2] = useState(false);

  const screen1Ref = useRef<HTMLDivElement | null>(null);
  const screen2Ref = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasStarted = useRef(false);

  const clear = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const sched = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timeouts.current.push(id);
  };

  const emitOnBoth = useCallback(
    (emoji: string, btnIdx: number) => {
      const screens = [screen1Ref.current, screen2Ref.current];
      const params = randomFloaterParams();
      // Bias the startX toward the button position
      const pct = 15 + btnIdx * 23;
      screens.forEach((s) => {
        if (s) spawnFloater(emoji, s, { ...params, startX: pct });
      });
    },
    [],
  );

  const runCycle = useCallback(() => {
    clear();
    setShowCursor1(false);
    setShowCursor2(false);
    setClicking1(false);
    setClicking2(false);

    let t = 800;

    // ── Cursor 1 appears, moves toward ❤️ on card 1 ──
    sched(() => {
      setShowCursor1(true);
      setCursor1({ x: 170, y: 340 });
    }, t);

    t += 700;

    // Click ❤️
    sched(() => setClicking1(true), t);
    t += 150;
    sched(() => {
      setClicking1(false);
      emitOnBoth('❤️', 0);
    }, t);

    t += 800;

    // ── Cursor 2 appears, moves toward 🔥 on card 2 ──
    sched(() => {
      setShowCursor2(true);
      setCursor2({ x: 690, y: 370 });
    }, t);

    t += 700;

    // Click 🔥
    sched(() => setClicking2(true), t);
    t += 150;
    sched(() => {
      setClicking2(false);
      emitOnBoth('🔥', 1);
    }, t);

    t += 1000;

    // ── Cursor 1 clicks 🎉 ──
    sched(() => setCursor1({ x: 220, y: 340 }), t);
    t += 500;
    sched(() => setClicking1(true), t);
    t += 150;
    sched(() => {
      setClicking1(false);
      emitOnBoth('🎉', 2);
    }, t);

    t += 800;

    // ── Cursor 2 clicks 👏 ──
    sched(() => setCursor2({ x: 770, y: 370 }), t);
    t += 500;
    sched(() => setClicking2(true), t);
    t += 150;
    sched(() => {
      setClicking2(false);
      emitOnBoth('👏', 3);
    }, t);

    t += 800;

    // ── Rapid fire: both cursors clicking ──
    sched(() => setCursor1({ x: 145, y: 340 }), t);
    sched(() => setCursor2({ x: 715, y: 370 }), t);
    t += 400;

    for (let i = 0; i < 3; i++) {
      sched(() => setClicking1(true), t);
      t += 100;
      sched(() => {
        setClicking1(false);
        emitOnBoth('❤️', 0);
      }, t);
      t += 200;

      sched(() => setClicking2(true), t);
      t += 100;
      sched(() => {
        setClicking2(false);
        emitOnBoth('🔥', 1);
      }, t);
      t += 300;
    }

    t += 1000;

    // Hide cursors
    sched(() => {
      setShowCursor1(false);
      setShowCursor2(false);
    }, t);

    // Restart
    t += 2000;
    sched(() => runCycle(), t);
  }, [clear, emitOnBoth]);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      runCycle();
    }
    return () => clear();
  }, [runCycle, clear]);

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#FFF9F4] to-[#F5F0FF]"
    >
      <div className="relative flex items-center">
        {/* Card 1: tilted left, offset up */}
        <div className="relative z-10">
          <StreamCard
            label="Alice"
            tilt="-rotate-3 translate-y-[-20px]"
            screenRef={(el) => {
              screen1Ref.current = el;
            }}
            viewerCount={847}
          />
        </div>
        {/* Card 2: tilted right, offset down, overlapping */}
        <div className="relative z-20 -ml-16">
          <StreamCard
            label="Bob"
            tilt="rotate-2 translate-y-[20px]"
            screenRef={(el) => {
              screen2Ref.current = el;
            }}
            viewerCount={847}
          />
        </div>
      </div>

      {showCursor1 && (
        <FakeCursor
          x={cursor1.x}
          y={cursor1.y}
          clicking={clicking1}
          color="#4F46E5"
        />
      )}
      {showCursor2 && (
        <FakeCursor
          x={cursor2.x}
          y={cursor2.y}
          clicking={clicking2}
          color="#E5464F"
        />
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────

export default function ReactionsDemoPage() {
  return <AnimatedReactionsDemo />;
}
