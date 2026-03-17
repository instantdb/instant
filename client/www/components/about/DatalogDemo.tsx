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
      <div className="rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs whitespace-nowrap text-gray-700">
        <span className="text-gray-400">{'{ '}</span>
        todos
        <span className="text-gray-400">{': { $: { where: { '}</span>
        done
        <span className="text-gray-400">{': '}</span>
        <button
          onClick={() => setFilterValue((v) => !v)}
          className="inline-block w-[3.2em] cursor-pointer rounded bg-orange-100 py-0.5 text-center font-semibold text-orange-600 transition-colors hover:bg-orange-200"
        >
          {String(filterValue)}
        </button>
        <span className="text-gray-400">{' } } } }'}</span>
      </div>

      <Connector />

      {/* Datalog */}
      <div className="mb-1 text-[10px] font-medium tracking-wider text-gray-400 uppercase">
        Datalog
      </div>
      <div className="space-y-1 rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs">
        <div className="h-4 overflow-hidden text-justify after:inline-block after:w-full after:content-['']">
          <span className="text-gray-400">[</span>{' '}
          <span className="text-gray-600">?todo</span>{' '}
          <span className="text-gray-500">&quot;done&quot;</span>{' '}
          <button
            onClick={() => setFilterValue((v) => !v)}
            className="cursor-pointer font-semibold text-gray-700"
          >
            {String(filterValue)}
          </button>{' '}
          <span className="text-gray-400">]</span>
        </div>
        <div className="h-4 overflow-hidden text-justify after:inline-block after:w-full after:content-['']">
          <span className="text-gray-400">[</span>{' '}
          <span className="text-gray-600">?todo</span>{' '}
          <span className="text-gray-500">?attr</span>{' '}
          <span className="text-gray-500">?val</span>{' '}
          <span className="text-gray-400">]</span>
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
