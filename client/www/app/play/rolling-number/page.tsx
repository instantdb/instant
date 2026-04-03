'use client';

import { useState } from 'react';
import { RollingNumber } from '@/components/RollingNumber';
import { formatNumberCompact } from '@/lib/format';

const presets = [
  { label: '0', value: 0 },
  { label: '7', value: 7 },
  { label: '10', value: 10 },
  { label: '99', value: 99 },
  { label: '100', value: 100 },
  { label: '999', value: 999 },
  { label: '1000', value: 1000 },
  { label: '1505', value: 1505 },
  { label: '1506', value: 1506 },
  { label: '1510', value: 1510 },
  { label: '2000', value: 2000 },
  { label: '9800', value: 9800 },
  { label: '9999', value: 9999 },
  { label: '10000', value: 10000 },
  { label: '12345', value: 12345 },
];

export default function RollingNumberPlayground() {
  const [value, setValue] = useState(1100);
  const [inputValue, setInputValue] = useState('1100');

  return (
    <div className="mx-auto max-w-2xl p-8 font-mono">
      <h1 className="mb-8 text-2xl font-bold">RollingNumber Playground</h1>

      <div className="mb-8 space-y-6">
        <div className="space-y-2">
          <label className="block text-sm text-gray-500">
            Enter a number
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const n = parseInt(inputValue, 10);
                  if (!isNaN(n) && n >= 0) setValue(n);
                }
              }}
              className="w-40 rounded border px-3 py-2"
            />
            <button
              onClick={() => {
                const n = parseInt(inputValue, 10);
                if (!isNaN(n) && n >= 0) setValue(n);
              }}
              className="rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-700"
            >
              Set
            </button>
            {[1, 10, 50, 100].map((n) => (
              <button
                key={`+${n}`}
                onClick={() => setValue((v) => v + n)}
                className="rounded bg-gray-200 px-4 py-2 hover:bg-gray-300"
              >
                +{n}
              </button>
            ))}
            {[1, 10, 50, 100].map((n) => (
              <button
                key={`-${n}`}
                onClick={() => setValue((v) => Math.max(0, v - n))}
                className="rounded bg-gray-200 px-4 py-2 hover:bg-gray-300"
              >
                -{n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setValue(p.value);
                setInputValue(String(p.value));
              }}
              className="rounded border px-3 py-1 text-sm hover:bg-gray-100"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-8">
        <div className="rounded-lg border p-6">
          <div className="mb-2 text-sm text-gray-500">
            Raw number (odometer)
          </div>
          <div className="text-5xl font-semibold tracking-tighter">
            <RollingNumber value={value} />
          </div>
        </div>

        <div className="rounded-lg border p-6">
          <div className="mb-2 text-sm text-gray-500">
            Formatted (compact)
          </div>
          <div className="text-5xl font-semibold tracking-tighter">
            <RollingNumber value={value} format={formatNumberCompact} />
          </div>
        </div>

        <div className="rounded-lg border p-6">
          <div className="mb-2 text-sm text-gray-500">Small (nav size)</div>
          <div className="text-sm font-semibold">
            <RollingNumber value={value} format={formatNumberCompact} /> stars
          </div>
        </div>
      </div>

      <div className="mt-6 text-sm text-gray-400">
        Current value: {value}
      </div>
    </div>
  );
}
