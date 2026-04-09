import { AnimatePresence, motion } from 'motion/react';
import { ReactNode, useRef, useState } from 'react';

type CircleColor = 'blue' | 'red' | 'emerald' | 'purple' | 'amber';

const COLORS: Record<CircleColor, string> = {
  blue: '#3b82f6',
  red: '#ef4444',
  emerald: '#10b981',
  purple: '#a855f7',
  amber: '#f59e0b',
};

const PALETTE: CircleColor[] = ['red', 'emerald', 'purple', 'amber'];

function Circle({ color }: { color: CircleColor }) {
  return (
    <motion.span
      className="inline-block h-4 w-4 rounded-full"
      animate={{ backgroundColor: COLORS[color] }}
      transition={{ duration: 0.45, ease: 'easeInOut' }}
    />
  );
}

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:w-[220px]">
      <div className="border-b border-gray-200 bg-gray-50/80 px-4 py-2.5 text-xs font-medium tracking-wider text-gray-400 uppercase">
        {label}
      </div>
      <div className="grid grid-cols-3 border-b border-gray-100 text-xs text-gray-400">
        <div className="px-4 py-2 font-medium">entity</div>
        <div className="px-4 py-2 font-medium">attribute</div>
        <div className="px-4 py-2 font-medium">value</div>
      </div>
      {children}
    </div>
  );
}

function Row({ e, a, value }: { e: string; a: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-3 items-center">
      <div className="px-4 py-2 font-mono text-xs text-gray-500">{e}</div>
      <div className="px-4 py-2 font-mono text-xs text-gray-500">{a}</div>
      <div className="px-4 py-2">{value}</div>
    </div>
  );
}

type Mutation = { id: number; color: CircleColor };

export default function PendingQueueDemo() {
  const [pending, setPending] = useState<Mutation[]>([]);
  const nextIdRef = useRef(0);

  const current = pending[pending.length - 1]?.color ?? 'blue';

  const addMutation = () => {
    const id = nextIdRef.current++;
    const color = PALETTE[id % PALETTE.length];
    setPending((p) => [...p, { id, color }]);
  };
  const undo = () => setPending((p) => p.slice(0, -1));

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-4 md:flex-row md:gap-5">
        <Panel label="Triple Store">
          <Row e="t1" a="status" value={<Circle color="blue" />} />
        </Panel>
        <div className="text-2xl font-light text-gray-300">+</div>
        <div className="flex flex-col">
          <div className="mb-1 text-[10px] font-medium tracking-wider text-gray-400 uppercase">
            Pending Queue
          </div>
          <div
            className={`relative flex h-[88px] min-w-[200px] flex-col overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50/70 py-1 ${
              pending.length > 3 ? 'justify-end' : 'justify-center'
            }`}
          >
            <AnimatePresence>
              {pending.length === 0 && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-xs text-gray-300"
                >
                  empty
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence initial={false}>
              {pending.map((m) => (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="flex shrink-0 items-center justify-center gap-x-1.5 px-4 py-1 font-mono text-xs text-gray-600"
                >
                  <span>t1.status =</span>
                  <Circle color={m.color} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
        <div className="text-2xl font-light text-gray-300">=</div>
        <Panel label="Merged Result">
          <Row e="t1" a="status" value={<Circle color={current} />} />
        </Panel>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={addMutation}
          className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          Add pending mutation
        </button>
        <button
          onClick={undo}
          disabled={pending.length === 0}
          className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Undo
        </button>
      </div>
    </div>
  );
}
