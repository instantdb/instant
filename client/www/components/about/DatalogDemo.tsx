import { motion } from 'motion/react';
import { useState } from 'react';

const TRIPLES: [string, string, string | boolean][] = [
  ['todo_1', 'title', 'Ship delight'],
  ['todo_1', 'done', true],
  ['todo_2', 'title', 'Fix bug'],
  ['todo_2', 'done', false],
];

function Connector() {
  return (
    <div className="flex justify-center py-1">
      <div className="h-5 w-[2px] bg-gray-300" />
    </div>
  );
}

export function DatalogDemo() {
  const [filterValue, setFilterValue] = useState(true);

  const matchedEntities = TRIPLES.filter(
    ([, attr, val]) => attr === 'done' && val === filterValue,
  ).map(([ent]) => ent);

  return (
    <div className="flex flex-col items-center">
      {/* InstaQL */}
      <div className="mb-1 self-start text-[10px] font-medium tracking-wider text-gray-400 uppercase">
        InstaQL
      </div>
      <div
        className="rounded-lg px-3 py-2 font-mono text-xs whitespace-nowrap"
        style={{ backgroundColor: '#faf8f5', color: '#575279' }}
      >
        <span style={{ color: '#797593' }}>{'{ '}</span>
        todos
        <span style={{ color: '#797593' }}>{': { $: { where: { '}</span>
        done
        <span style={{ color: '#797593' }}>{': '}</span>
        <button
          onClick={() => setFilterValue((v) => !v)}
          className="inline-block w-[3.2em] cursor-pointer rounded py-0.5 text-center font-semibold transition-colors"
          style={{ backgroundColor: 'rgba(234,157,52,0.15)', color: '#d7827e' }}
        >
          {String(filterValue)}
        </button>
        <span style={{ color: '#797593' }}>{' } } } }'}</span>
      </div>

      <Connector />

      {/* Datalog */}
      <div className="mb-1 text-[10px] font-medium tracking-wider text-gray-400 uppercase">
        Datalog
      </div>
      <div
        className="w-full max-w-[12rem] space-y-1 rounded-lg px-3 py-2 font-mono text-xs"
        style={{ backgroundColor: '#faf8f5' }}
      >
        <div className="flex justify-between">
          <span style={{ color: '#797593' }}>[</span>
          <span style={{ color: '#286983' }}>?todo</span>
          <span style={{ color: '#ea9d34' }}>"done"</span>
          <button
            onClick={() => setFilterValue((v) => !v)}
            className="w-[5ch] cursor-pointer text-center font-semibold"
            style={{ color: '#d7827e' }}
          >
            {String(filterValue)}
          </button>
          <span style={{ color: '#797593' }}>]</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: '#797593' }}>[</span>
          <span style={{ color: '#286983' }}>?todo</span>
          <span style={{ color: '#907aa9' }}>?attr</span>
          <span style={{ color: '#907aa9' }}>?val</span>
          <span style={{ color: '#797593' }}>]</span>
        </div>
      </div>

      <Connector />

      {/* Triple Store */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50/80 px-4 py-2.5 text-xs font-medium tracking-wider text-gray-400 uppercase">
          Triple Store
        </div>
        <div className="grid grid-cols-3 border-b border-gray-100 text-xs text-gray-400">
          <div className="px-4 py-2 font-medium">entity</div>
          <div className="px-4 py-2 font-medium">attribute</div>
          <div className="px-4 py-2 font-medium">value</div>
        </div>
        <div className="relative">
          {/* Sliding highlight */}
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bg-orange-50"
            style={{
              height: `${(2 / TRIPLES.length) * 100}%`,
            }}
            animate={{
              top: filterValue ? '0%' : `${(2 / TRIPLES.length) * 100}%`,
            }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 30,
            }}
          />
          {TRIPLES.map(([e, a, v]) => (
            <div
              key={`${e}-${a}`}
              className="relative grid grid-cols-3 border-b border-gray-50"
            >
              <div className="px-4 py-1.5 font-mono text-xs text-gray-500">
                {e}
              </div>
              <div className="px-4 py-1.5 font-mono text-xs text-gray-500">
                {a}
              </div>
              <div className="px-4 py-1.5 font-mono text-xs text-gray-700">
                {String(v)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
