'use client';

// V4: "Wave" — clicking an emoji triggers a bouncing wave across all 4 emojis on both cards

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useAnimation } from 'motion/react';

const REACTIONS = ['❤️', '🔥', '🎉', '👏'] as const;

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

function EmojiButton({
  emoji,
  controls,
}: {
  emoji: string;
  controls: ReturnType<typeof useAnimation>;
}) {
  return (
    <motion.div
      animate={controls}
      className="flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-200 bg-white text-3xl shadow-sm"
    >
      {emoji}
    </motion.div>
  );
}

function WaveCard({
  label,
  avatar,
  emojiControls,
}: {
  label: string;
  avatar: string;
  emojiControls: ReturnType<typeof useAnimation>[];
}) {
  return (
    <div className="w-[400px] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-200/60">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-bold text-white">
          {avatar}
        </div>
        <span className="text-base font-semibold text-gray-800">{label}</span>
        <span className="ml-auto rounded-full bg-green-500 px-2.5 py-0.5 text-xs font-bold text-white">
          LIVE
        </span>
      </div>
      <div className="flex items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 py-16">
        <div className="flex gap-5">
          {REACTIONS.map((emoji, i) => (
            <EmojiButton key={emoji} emoji={emoji} controls={emojiControls[i]} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function V4() {
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const started = useRef(false);

  // 4 emoji controls per card, 2 cards
  const card1Controls = [useAnimation(), useAnimation(), useAnimation(), useAnimation()];
  const card2Controls = [useAnimation(), useAnimation(), useAnimation(), useAnimation()];

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

  const triggerWave = useCallback(
    (startIdx: number) => {
      const allControls = [card1Controls, card2Controls];
      allControls.forEach((controls) => {
        for (let i = 0; i < 4; i++) {
          const delay = Math.abs(i - startIdx) * 0.08;
          const isClicked = i === startIdx;
          controls[i].start({
            y: [0, isClicked ? -28 : -18, 0],
            scale: [1, isClicked ? 1.3 : 1.15, 1],
            transition: {
              duration: 0.5,
              delay,
              ease: 'easeOut',
            },
          });
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const runCycle = useCallback(() => {
    clear();
    setShow1(false);
    setShow2(false);

    let t = 600;

    // Cursor 1 → ❤️
    sched(() => { setShow1(true); setC1({ x: 100, y: 270 }); }, t);
    t += 600;
    sched(() => setClick1(true), t);
    t += 120;
    sched(() => { setClick1(false); triggerWave(0); }, t);
    t += 1000;

    // Cursor 2 → 🔥
    sched(() => { setShow2(true); setC2({ x: 580, y: 270 }); }, t);
    t += 600;
    sched(() => setClick2(true), t);
    t += 120;
    sched(() => { setClick2(false); triggerWave(1); }, t);
    t += 1000;

    // Cursor 1 → 🎉
    sched(() => setC1({ x: 185, y: 270 }), t);
    t += 400;
    sched(() => setClick1(true), t);
    t += 120;
    sched(() => { setClick1(false); triggerWave(2); }, t);
    t += 1000;

    // Cursor 2 → 👏
    sched(() => setC2({ x: 720, y: 270 }), t);
    t += 400;
    sched(() => setClick2(true), t);
    t += 120;
    sched(() => { setClick2(false); triggerWave(3); }, t);
    t += 800;

    // Rapid alternating
    sched(() => setC1({ x: 100, y: 270 }), t);
    sched(() => setC2({ x: 630, y: 270 }), t);
    t += 300;
    for (let i = 0; i < 3; i++) {
      sched(() => setClick1(true), t);
      t += 100;
      sched(() => { setClick1(false); triggerWave(0); }, t);
      t += 500;
      sched(() => setClick2(true), t);
      t += 100;
      sched(() => { setClick2(false); triggerWave(1); }, t);
      t += 500;
    }

    t += 1500;
    sched(() => { setShow1(false); setShow2(false); }, t);
    t += 2000;
    sched(() => runCycle(), t);
  }, [clear, triggerWave]);

  useEffect(() => {
    if (!started.current) { started.current = true; runCycle(); }
    return () => clear();
  }, [runCycle, clear]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#FFF9F0] to-[#FFF0F5]">
      <div className="relative flex items-center">
        <div className="-rotate-2 translate-y-[-16px]">
          <WaveCard label="Alice" avatar="A" emojiControls={card1Controls} />
        </div>
        <div className="-ml-8 rotate-2 translate-y-[16px]">
          <WaveCard label="Bob" avatar="B" emojiControls={card2Controls} />
        </div>
      </div>
      {show1 && <FakeCursor x={c1.x} y={c1.y} clicking={click1} color="#F59E0B" />}
      {show2 && <FakeCursor x={c2.x} y={c2.y} clicking={click2} color="#EF4444" />}
    </div>
  );
}
