'use client';

// V2: "Scoreboard" — giant emoji + animated counters that tick up on each click

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';

const REACTIONS = ['❤️', '🔥', '🎉', '👏'] as const;

function AnimatedNumber({ value }: { value: number }) {
  const spring = useSpring(0, { stiffness: 300, damping: 30 });
  const display = useTransform(spring, (v) => Math.round(v));
  const [shown, setShown] = useState(0);

  useEffect(() => {
    spring.set(value);
    return display.on('change', (v) => setShown(v));
  }, [value, spring, display]);

  return (
    <motion.span
      key={value}
      initial={{ scale: 1 }}
      animate={{ scale: [1, 1.3, 1] }}
      transition={{ duration: 0.3 }}
      className="tabular-nums"
    >
      {shown}
    </motion.span>
  );
}

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
      <svg width="20" height="24" viewBox="0 0 16 20" fill="none">
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

function ScoreCard({
  label,
  avatar,
  counts,
}: {
  label: string;
  avatar: string;
  counts: number[];
}) {
  return (
    <div className="w-[400px] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-200/60">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-bold text-white">
          {avatar}
        </div>
        <span className="text-base font-semibold text-gray-800">{label}</span>
        <span className="ml-auto rounded-full bg-green-500 px-2.5 py-0.5 text-xs font-bold text-white">
          LIVE
        </span>
      </div>
      <div className="grid grid-cols-4 gap-3 px-6 py-10">
        {REACTIONS.map((emoji, i) => (
          <div key={emoji} className="flex flex-col items-center gap-2">
            <span className="text-5xl">{emoji}</span>
            <span className="text-3xl font-bold text-gray-800">
              <AnimatedNumber value={counts[i]} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function V2() {
  const [counts, setCounts] = useState([12, 8, 5, 3]);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const started = useRef(false);

  const [c1, setC1] = useState({ x: 0, y: 0 });
  const [c2, setC2] = useState({ x: 0, y: 0 });
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [click1, setClick1] = useState(false);
  const [click2, setClick2] = useState(false);

  const clear = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);
  const sched = (fn: () => void, ms: number) => {
    timeouts.current.push(setTimeout(fn, ms));
  };

  const bump = useCallback((idx: number) => {
    setCounts((prev) => prev.map((c, i) => (i === idx ? c + 1 : c)));
  }, []);

  const runCycle = useCallback(() => {
    clear();
    setCounts([12, 8, 5, 3]);
    setShow1(false);
    setShow2(false);

    let t = 600;

    // Cursor 1 → ❤️
    sched(() => { setShow1(true); setC1({ x: 90, y: 250 }); }, t);
    t += 600;
    sched(() => setClick1(true), t);
    t += 120;
    sched(() => { setClick1(false); bump(0); }, t);
    t += 700;

    // Cursor 2 → 🔥
    sched(() => { setShow2(true); setC2({ x: 565, y: 250 }); }, t);
    t += 600;
    sched(() => setClick2(true), t);
    t += 120;
    sched(() => { setClick2(false); bump(1); }, t);
    t += 700;

    // Cursor 1 → 🎉
    sched(() => setC1({ x: 185, y: 250 }), t);
    t += 400;
    sched(() => setClick1(true), t);
    t += 120;
    sched(() => { setClick1(false); bump(2); }, t);
    t += 700;

    // Cursor 2 → 👏
    sched(() => setC2({ x: 705, y: 250 }), t);
    t += 400;
    sched(() => setClick2(true), t);
    t += 120;
    sched(() => { setClick2(false); bump(3); }, t);
    t += 600;

    // Rapid ❤️ spam
    sched(() => setC1({ x: 90, y: 250 }), t);
    sched(() => setC2({ x: 515, y: 250 }), t);
    t += 300;
    for (let i = 0; i < 5; i++) {
      sched(() => setClick1(true), t);
      t += 100;
      sched(() => { setClick1(false); bump(0); }, t);
      t += 100;
      sched(() => setClick2(true), t);
      t += 100;
      sched(() => { setClick2(false); bump(0); }, t);
      t += 250;
    }

    t += 1500;
    sched(() => { setShow1(false); setShow2(false); }, t);
    t += 2000;
    sched(() => runCycle(), t);
  }, [clear, bump]);

  useEffect(() => {
    if (!started.current) { started.current = true; runCycle(); }
    return () => clear();
  }, [runCycle, clear]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#F0F0FF] to-[#FFF5F5]">
      <div className="relative flex items-center">
        <div className="-rotate-2 translate-y-[-16px]">
          <ScoreCard label="Alice" avatar="A" counts={counts} />
        </div>
        <div className="-ml-8 rotate-2 translate-y-[16px]">
          <ScoreCard label="Bob" avatar="B" counts={counts} />
        </div>
      </div>
      {show1 && <FakeCursor x={c1.x} y={c1.y} clicking={click1} color="#6366F1" />}
      {show2 && <FakeCursor x={c2.x} y={c2.y} clicking={click2} color="#EC4899" />}
    </div>
  );
}
