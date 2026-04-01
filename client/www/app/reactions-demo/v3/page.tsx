'use client';

// V3: "Fireworks" — dark theme, emojis explode outward like fireworks from center

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';

const REACTIONS = ['❤️', '🔥', '🎉', '👏'] as const;

function spawnFirework(emoji: string, container: HTMLElement) {
  const count = 6 + Math.floor(Math.random() * 4);
  const cx = 30 + Math.random() * 40;
  const cy = 30 + Math.random() * 30;

  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.textContent = emoji;
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const dist = 60 + Math.random() * 80;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const size = 20 + Math.random() * 16;
    const rotation = (Math.random() - 0.5) * 60;
    const delay = i * 30;

    Object.assign(el.style, {
      position: 'absolute',
      left: `${cx}%`,
      top: `${cy}%`,
      fontSize: `${size}px`,
      lineHeight: '1',
      pointerEvents: 'none',
      zIndex: '10',
    });
    container.appendChild(el);

    const anim = el.animate(
      [
        { opacity: 0, transform: 'translate(-50%,-50%) scale(0) rotate(0deg)' },
        {
          opacity: 1,
          transform: `translate(calc(-50% + ${dx * 0.3}px), calc(-50% + ${dy * 0.3}px)) scale(1.2) rotate(${rotation * 0.3}deg)`,
          offset: 0.2,
        },
        {
          opacity: 1,
          transform: `translate(calc(-50% + ${dx * 0.7}px), calc(-50% + ${dy * 0.7}px)) scale(1) rotate(${rotation * 0.7}deg)`,
          offset: 0.5,
        },
        {
          opacity: 0,
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.5) rotate(${rotation}deg)`,
        },
      ],
      {
        duration: 1200 + Math.random() * 400,
        delay,
        easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)',
        fill: 'forwards',
      },
    );
    anim.onfinish = () => el.remove();
  }
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

function DarkCard({
  label,
  screenRef,
}: {
  label: string;
  screenRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="w-[400px] overflow-hidden rounded-2xl bg-gray-900 shadow-2xl ring-1 ring-white/10">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
        <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">
          LIVE
        </span>
        <span className="text-base font-medium text-white/80">{label}</span>
      </div>
      <div
        ref={screenRef}
        className="relative overflow-hidden"
        style={{ height: 280 }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-20 w-20 rounded-full bg-white/5" />
        </div>
      </div>
      <div className="flex justify-center gap-4 border-t border-white/10 px-5 py-4">
        {REACTIONS.map((emoji) => (
          <div
            key={emoji}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-2xl"
          >
            {emoji}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function V3() {
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

  const emit = useCallback((emoji: string) => {
    [s1.current, s2.current].forEach((s) => {
      if (s) spawnFirework(emoji, s);
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
    sched(() => { setClick1(false); emit('❤️'); }, t);
    t += 1200;

    sched(() => { setShow2(true); setC2({ x: 595, y: 375 }); }, t);
    t += 600;
    sched(() => setClick2(true), t);
    t += 120;
    sched(() => { setClick2(false); emit('🔥'); }, t);
    t += 1200;

    sched(() => setC1({ x: 205, y: 375 }), t);
    t += 400;
    sched(() => setClick1(true), t);
    t += 120;
    sched(() => { setClick1(false); emit('🎉'); }, t);
    t += 1000;

    sched(() => setC2({ x: 730, y: 375 }), t);
    t += 400;
    sched(() => setClick2(true), t);
    t += 120;
    sched(() => { setClick2(false); emit('👏'); }, t);
    t += 1000;

    // Grand finale: rapid fire
    sched(() => setC1({ x: 115, y: 375 }), t);
    sched(() => setC2({ x: 640, y: 375 }), t);
    t += 300;
    for (let i = 0; i < 3; i++) {
      sched(() => { setClick1(true); }, t);
      t += 100;
      sched(() => { setClick1(false); emit('❤️'); }, t);
      t += 200;
      sched(() => { setClick2(true); }, t);
      t += 100;
      sched(() => { setClick2(false); emit('🎉'); }, t);
      t += 400;
    }

    t += 2000;
    sched(() => { setShow1(false); setShow2(false); }, t);
    t += 2000;
    sched(() => runCycle(), t);
  }, [clear, emit]);

  useEffect(() => {
    if (!started.current) { started.current = true; runCycle(); }
    return () => clear();
  }, [runCycle, clear]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-950">
      <div className="relative flex items-center">
        <div className="-rotate-2 translate-y-[-16px]">
          <DarkCard label="Alice" screenRef={(el) => { s1.current = el; }} />
        </div>
        <div className="-ml-8 rotate-2 translate-y-[16px]">
          <DarkCard label="Bob" screenRef={(el) => { s2.current = el; }} />
        </div>
      </div>
      {show1 && <FakeCursor x={c1.x} y={c1.y} clicking={click1} color="#818CF8" />}
      {show2 && <FakeCursor x={c2.x} y={c2.y} clicking={click2} color="#F472B6" />}
    </div>
  );
}
