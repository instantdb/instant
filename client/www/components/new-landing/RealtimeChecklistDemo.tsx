'use client';

import { useState, useRef, useCallback } from 'react';

const SYNC_TASKS = [
  { id: 1, text: 'Review PR #42', done: false },
  { id: 2, text: 'Deploy to staging', done: false },
  { id: 3, text: 'Update docs', done: false },
];

type SyncDot = {
  id: number;
  direction: 'left-to-right' | 'right-to-left';
  yPx: number;
};

export function RealtimeChecklistDemo() {
  const [items, setItems] = useState(SYNC_TASKS.map((t) => ({ ...t })));
  const [dots, setDots] = useState<SyncDot[]>([]);
  const dotIdRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(
    (id: number, source: 'left' | 'right', e: React.MouseEvent) => {
      setItems((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      );
      const dotId = dotIdRef.current++;
      const direction: SyncDot['direction'] =
        source === 'left' ? 'left-to-right' : 'right-to-left';
      const containerRect = containerRef.current?.getBoundingClientRect();
      const yPx = containerRect ? e.clientY - containerRect.top : 0;
      setDots((prev) => [...prev, { id: dotId, direction, yPx }]);
      setTimeout(() => {
        setDots((prev) => prev.filter((d) => d.id !== dotId));
      }, 350);
    },
    [],
  );

  const Checkbox = ({ done }: { done: boolean }) => (
    <div
      className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
        done ? 'border-orange-600 bg-orange-600' : 'border-gray-300'
      }`}
    >
      {done && (
        <svg
          className="h-3 w-3 text-white"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={3}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m4.5 12.75 6 6 9-13.5"
          />
        </svg>
      )}
    </div>
  );

  const TaskCard = ({
    name,
    img,
    source,
  }: {
    name: string;
    img: string;
    source: 'left' | 'right';
  }) => (
    <div className="min-w-0 flex-1">
      <div className="mb-2 flex items-center gap-2.5 px-1">
        <img
          src={img}
          alt={name}
          className="h-7 w-7 rounded-full object-cover"
        />
        <span className="text-sm font-medium">{name}&apos;s phone</span>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm md:p-5">
        <div className="mb-3 text-sm font-medium text-gray-500">Team Todos</div>
        <div className="space-y-1.5">
          {items.map((t) => (
            <button
              key={t.id}
              onClick={(e) => toggle(t.id, source, e)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left"
            >
              <Checkbox done={t.done} />
              <span
                className={`text-sm ${t.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}
              >
                {t.text}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="relative flex items-start gap-3 md:gap-6"
    >
      <TaskCard name="Daniel" img="/img/landing/daniel.png" source="left" />
      <TaskCard name="Joe" img="/img/landing/joe.jpg" source="right" />

      {/* Green sync dot that shoots through the gap between cards */}
      {dots.map((dot) => (
        <span
          key={dot.id}
          className="pointer-events-none absolute h-2 w-2 rounded-full bg-green-400"
          style={{
            top: dot.yPx,
            boxShadow:
              '0 0 8px 2px rgba(74, 222, 128, 0.6), 0 0 20px 4px rgba(74, 222, 128, 0.3)',
            animation: `${
              dot.direction === 'left-to-right' ? 'syncDotLR' : 'syncDotRL'
            } 0.3s ease-in-out forwards`,
          }}
        />
      ))}

      <style>{`
        @keyframes syncDotLR {
          0% { left: 45%; opacity: 1; transform: translate(-50%, -50%) scale(0.8); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.3); }
          100% { left: 55%; opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
        }
        @keyframes syncDotRL {
          0% { left: 55%; opacity: 1; transform: translate(-50%, -50%) scale(0.8); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.3); }
          100% { left: 45%; opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
        }
      `}</style>
    </div>
  );
}
