'use client';

// V5: "Pulse rings" — click spawns expanding colored rings + a big emoji in the center of both cards

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';

const REACTIONS = ['❤️', '🔥', '🎉', '👏'] as const;
const RING_COLORS = [
  ['rgba(239,68,68,0.4)', 'rgba(239,68,68,0.15)'],
  ['rgba(249,115,22,0.4)', 'rgba(249,115,22,0.15)'],
  ['rgba(234,179,8,0.4)', 'rgba(234,179,8,0.15)'],
  ['rgba(34,197,94,0.4)', 'rgba(34,197,94,0.15)'],
];

function spawnPulse(emoji: string, idx: number, container: HTMLElement) {
  // Expanding rings
  for (let r = 0; r < 3; r++) {
    const ring = document.createElement('div');
    Object.assign(ring.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: '0px',
      height: '0px',
      borderRadius: '50%',
      border: `3px solid ${RING_COLORS[idx][0]}`,
      background: RING_COLORS[idx][1],
      pointerEvents: 'none',
      zIndex: '5',
    });
    container.appendChild(ring);

    const size = 140 + r * 60;
    const anim = ring.animate(
      [
        {
          width: '0px',
          height: '0px',
          opacity: 0.8,
          transform: 'translate(-50%, -50%)',
        },
        {
          width: `${size}px`,
          height: `${size}px`,
          opacity: 0,
          transform: 'translate(-50%, -50%)',
        },
      ],
      {
        duration: 800 + r * 200,
        delay: r * 120,
        easing: 'ease-out',
        fill: 'forwards',
      },
    );
    anim.onfinish = () => ring.remove();
  }

  // Big center emoji
  const el = document.createElement('span');
  el.textContent = emoji;
  Object.assign(el.style, {
    position: 'absolute',
    left: '50%',
    top: '50%',
    fontSize: '64px',
    lineHeight: '1',
    pointerEvents: 'none',
    zIndex: '10',
  });
  container.appendChild(el);

  const anim = el.animate(
    [
      { opacity: 0, transform: 'translate(-50%, -50%) scale(0) rotate(-20deg)' },
      {
        opacity: 1,
        transform: 'translate(-50%, -50%) scale(1.2) rotate(5deg)',
        offset: 0.3,
      },
      {
        opacity: 1,
        transform: 'translate(-50%, -50%) scale(1) rotate(0deg)',
        offset: 0.5,
      },
      {
        opacity: 0,
        transform: 'translate(-50%, -50%) scale(1.5) rotate(10deg)',
      },
    ],
    { duration: 1200, easing: 'ease-out', fill: 'forwards' },
  );
  anim.onfinish = () => el.remove();
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

function PulseCard({
  label,
  avatar,
  screenRef,
}: {
  label: string;
  avatar: string;
  screenRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="w-[400px] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-200/60">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-red-500 text-sm font-bold text-white">
          {avatar}
        </div>
        <span className="text-base font-semibold text-gray-800">{label}</span>
        <span className="ml-auto rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">
          LIVE
        </span>
      </div>
      <div
        ref={screenRef}
        className="relative overflow-hidden bg-gradient-to-br from-slate-50 to-gray-100"
        style={{ height: 280 }}
      />
      <div className="flex justify-center gap-4 border-t border-gray-100 px-5 py-4">
        {REACTIONS.map((emoji) => (
          <div
            key={emoji}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-200 bg-white text-2xl shadow-sm"
          >
            {emoji}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function V5() {
  const s1 = useRef<HTMLDivElement | null>(null);
  const s2 = useRef<HTMLDivElement | null>(null);
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

  const emit = useCallback((emoji: string, idx: number) => {
    [s1.current, s2.current].forEach((s) => {
      if (s) spawnPulse(emoji, idx, s);
    });
  }, []);

  const runCycle = useCallback(() => {
    clear();
    setShow1(false);
    setShow2(false);

    let t = 600;

    sched(() => { setShow1(true); setC1({ x: 115, y: 375 }); }, t);
    t += 600;
    sched(() => setClick1(true), t);
    t += 120;
    sched(() => { setClick1(false); emit('❤️', 0); }, t);
    t += 1400;

    sched(() => { setShow2(true); setC2({ x: 595, y: 375 }); }, t);
    t += 600;
    sched(() => setClick2(true), t);
    t += 120;
    sched(() => { setClick2(false); emit('🔥', 1); }, t);
    t += 1400;

    sched(() => setC1({ x: 205, y: 375 }), t);
    t += 400;
    sched(() => setClick1(true), t);
    t += 120;
    sched(() => { setClick1(false); emit('🎉', 2); }, t);
    t += 1200;

    sched(() => setC2({ x: 730, y: 375 }), t);
    t += 400;
    sched(() => setClick2(true), t);
    t += 120;
    sched(() => { setClick2(false); emit('👏', 3); }, t);
    t += 1200;

    // Rapid pulses
    sched(() => setC1({ x: 115, y: 375 }), t);
    sched(() => setC2({ x: 640, y: 375 }), t);
    t += 300;
    for (let i = 0; i < 3; i++) {
      sched(() => setClick1(true), t);
      t += 100;
      sched(() => { setClick1(false); emit('❤️', 0); }, t);
      t += 600;
      sched(() => setClick2(true), t);
      t += 100;
      sched(() => { setClick2(false); emit('🔥', 1); }, t);
      t += 600;
    }

    t += 1500;
    sched(() => { setShow1(false); setShow2(false); }, t);
    t += 2000;
    sched(() => runCycle(), t);
  }, [clear, emit]);

  useEffect(() => {
    if (!started.current) { started.current = true; runCycle(); }
    return () => clear();
  }, [runCycle, clear]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#FFF5F5] to-[#FFF0E5]">
      <div className="relative flex items-center">
        <div className="-rotate-2 translate-y-[-16px]">
          <PulseCard label="Alice" avatar="A" screenRef={(el) => { s1.current = el; }} />
        </div>
        <div className="-ml-8 rotate-2 translate-y-[16px]">
          <PulseCard label="Bob" avatar="B" screenRef={(el) => { s2.current = el; }} />
        </div>
      </div>
      {show1 && <FakeCursor x={c1.x} y={c1.y} clicking={click1} color="#E11D48" />}
      {show2 && <FakeCursor x={c2.x} y={c2.y} clicking={click2} color="#F97316" />}
    </div>
  );
}
