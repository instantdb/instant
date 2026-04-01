'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';

const REACTIONS = ['❤️', '🔥', '🎉', '👏'] as const;

// ─── Floating Emoji (original stream style) ─────────────

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
  const driftRange = 22;
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
        transform: `translateY(-100px) translateX(${p.drift2}px) scale(1) rotate(${-p.rotation * 0.5}deg)`,
        offset: 0.45,
      },
      {
        opacity: 0.8,
        transform: `translateY(-160px) translateX(${p.drift3}px) scale(0.95) rotate(${p.rotation * 0.4}deg)`,
        offset: 0.7,
      },
      {
        opacity: 0,
        transform: `translateY(-220px) translateX(${p.drift4}px) scale(0.7) rotate(${-p.rotation}deg)`,
      },
    ],
    { duration: 1800, easing: 'ease-out', fill: 'forwards' },
  );

  anim.onfinish = () => el.remove();
}

// ─── Fake Cursor (large, visible from far away) ─────────

function FakeCursor({
  x,
  y,
  clicking,
  color,
  label,
}: {
  x: number;
  y: number;
  clicking: boolean;
  color: string;
  label: string;
}) {
  return (
    <motion.div
      className="pointer-events-none absolute z-30"
      initial={false}
      animate={{ left: x, top: y, scale: clicking ? 0.85 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <svg
        width="36"
        height="44"
        viewBox="0 0 16 20"
        fill="none"
        className="drop-shadow-lg"
      >
        <path
          d="M1 1L1 15L5 11L9 18L12 16.5L8 9.5L13 9L1 1Z"
          fill={color}
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>
      <span
        className="-mt-1 ml-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold text-white shadow-md"
        style={{ backgroundColor: color }}
      >
        {label}
      </span>
    </motion.div>
  );
}

// ─── Stream Card ────────────────────────────────────────

const Card = React.forwardRef<
  HTMLDivElement,
  {
    label: string;
    avatarSrc: string;
    screenRef: (el: HTMLDivElement | null) => void;
    buttonRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
    rowRef: React.MutableRefObject<HTMLDivElement | null>;
  }
>(function Card({ label, avatarSrc, screenRef, buttonRefs, rowRef }, ref) {
  return (
    <div
      ref={ref}
      className="w-[400px] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-200/60"
    >
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
        <img
          src={avatarSrc}
          alt={label}
          className="h-8 w-8 rounded-full object-cover"
        />
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
      <div
        ref={rowRef}
        className="flex justify-center gap-4 border-t border-gray-100 px-5 py-4"
      >
        {REACTIONS.map((emoji, i) => (
          <div
            key={emoji}
            ref={(el) => {
              buttonRefs.current[i] = el;
            }}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-200 bg-white text-2xl shadow-sm"
          >
            {emoji}
          </div>
        ))}
      </div>
    </div>
  );
});

// ─── Main Demo ──────────────────────────────────────────

export default function V1() {
  const s1 = useRef<HTMLDivElement | null>(null);
  const s2 = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const card1Buttons = useRef<(HTMLDivElement | null)[]>([]);
  const card2Buttons = useRef<(HTMLDivElement | null)[]>([]);
  const card1Row = useRef<HTMLDivElement | null>(null);
  const card2Row = useRef<HTMLDivElement | null>(null);
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

  const getBtnPos = useCallback(
    (btns: React.MutableRefObject<(HTMLDivElement | null)[]>, idx: number) => {
      const btn = btns.current[idx];
      const container = containerRef.current;
      if (!btn || !container) return { x: 0, y: 0 };
      const bRect = btn.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      return {
        x: bRect.left - cRect.left + bRect.width / 2 - 12,
        y: bRect.top - cRect.top + bRect.height / 2 - 6,
      };
    },
    [],
  );

  // Emit emoji on both screens, positioned above the clicked button
  // (matches the original LiveStreamDemo approach)
  const emit = useCallback(
    (
      emoji: string,
      clickedBtns: React.MutableRefObject<(HTMLDivElement | null)[]>,
      clickedRow: React.MutableRefObject<HTMLDivElement | null>,
      btnIdx: number,
    ) => {
      const btn = clickedBtns.current[btnIdx];
      const row = clickedRow.current;
      if (!btn || !row) return;

      const rowRect = row.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      const btnCenterInRow = btnRect.left + btnRect.width / 2 - rowRect.left;
      const offsetFromRowCenter = btnCenterInRow - rowRect.width / 2;

      const params = randomFloaterParams();

      [s1.current, s2.current].forEach((s) => {
        if (!s) return;
        const sWidth = s.getBoundingClientRect().width;
        const pct = ((sWidth / 2 + offsetFromRowCenter) / sWidth) * 100;
        spawnFloater(emoji, s, { ...params, startX: pct });
      });
    },
    [],
  );

  const runCycle = useCallback(() => {
    clear();
    setShow1(false);
    setShow2(false);
    setClick1(false);
    setClick2(false);

    let t = 600;

    // Daniel's cursor → ❤️ on card 1
    sched(() => {
      setShow1(true);
      setC1(getBtnPos(card1Buttons, 0));
    }, t);
    t += 600;
    sched(() => setClick1(true), t);
    t += 120;
    sched(() => {
      setClick1(false);
      emit('❤️', card1Buttons, card1Row, 0);
    }, t);
    t += 700;

    // Drew's cursor → 🔥 on card 2
    sched(() => {
      setShow2(true);
      setC2(getBtnPos(card2Buttons, 1));
    }, t);
    t += 600;
    sched(() => setClick2(true), t);
    t += 120;
    sched(() => {
      setClick2(false);
      emit('🔥', card2Buttons, card2Row, 1);
    }, t);
    t += 700;

    // Daniel → 🎉
    sched(() => setC1(getBtnPos(card1Buttons, 2)), t);
    t += 400;
    sched(() => setClick1(true), t);
    t += 120;
    sched(() => {
      setClick1(false);
      emit('🎉', card1Buttons, card1Row, 2);
    }, t);
    t += 700;

    // Drew → 👏
    sched(() => setC2(getBtnPos(card2Buttons, 3)), t);
    t += 400;
    sched(() => setClick2(true), t);
    t += 120;
    sched(() => {
      setClick2(false);
      emit('👏', card2Buttons, card2Row, 3);
    }, t);
    t += 600;

    // Rapid fire: both on ❤️
    sched(() => setC1(getBtnPos(card1Buttons, 0)), t);
    sched(() => setC2(getBtnPos(card2Buttons, 0)), t);
    t += 300;
    for (let i = 0; i < 4; i++) {
      sched(() => setClick1(true), t);
      t += 100;
      sched(() => {
        setClick1(false);
        emit('❤️', card1Buttons, card1Row, 0);
      }, t);
      t += 150;
      sched(() => setClick2(true), t);
      t += 100;
      sched(() => {
        setClick2(false);
        emit('❤️', card2Buttons, card2Row, 0);
      }, t);
      t += 250;
    }

    t += 1200;
    sched(() => {
      setShow1(false);
      setShow2(false);
    }, t);
    t += 2000;
    sched(() => runCycle(), t);
  }, [clear, emit, getBtnPos]);

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      runCycle();
    }
    return () => clear();
  }, [runCycle, clear]);

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#FFF5F5] to-[#FFF0E5]"
    >
      <div className="relative flex items-center">
        <div className="translate-y-[-16px] -rotate-2">
          <Card
            label="Daniel"
            avatarSrc="/img/landing/daniel.png"
            screenRef={(el) => {
              s1.current = el;
            }}
            buttonRefs={card1Buttons}
            rowRef={card1Row}
          />
        </div>
        <div className="-ml-8 translate-y-[16px] rotate-2">
          <Card
            label="Drew"
            avatarSrc="/img/landing/drew.jpg"
            screenRef={(el) => {
              s2.current = el;
            }}
            buttonRefs={card2Buttons}
            rowRef={card2Row}
          />
        </div>
      </div>
      {show1 && (
        <FakeCursor
          x={c1.x}
          y={c1.y}
          clicking={click1}
          color="#6366F1"
          label="Daniel"
        />
      )}
      {show2 && (
        <FakeCursor
          x={c2.x}
          y={c2.y}
          clicking={click2}
          color="#EC4899"
          label="Drew"
        />
      )}
    </div>
  );
}
