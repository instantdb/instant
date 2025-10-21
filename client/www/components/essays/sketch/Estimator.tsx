import { useMemo, useState } from 'react';
import { buildSketch, check, HashFn, stem } from './sketch';
import clsx from 'clsx';
import { useExactCounts } from './exactCounts';

type SketchConfig = {
  rows: number;
  columns: number;
};

type TrySketchProps = {
  initialRows: number;
  initialColumns: number;
  isConfigurable?: boolean;
  examples: string[];
  title?: string;
};

export function Estimator({
  initialRows,
  initialColumns,
  isConfigurable,
  examples,
  title,
}: TrySketchProps) {
  const { counts, status } = useExactCounts();

  const [config, setConfig] = useState<SketchConfig>({
    columns: initialColumns,
    rows: initialRows,
  });

  const [query, setQuery] = useState(examples[0] ?? '');
  const trimmedQuery = query.trim().toLowerCase();
  const stemmedQuery = stem(trimmedQuery);

  const handleConfigSubmit = (nextConfig: SketchConfig) => {
    setConfig(nextConfig);
  };

  const { columns, rows } = config;

  const sketch = useMemo(() => {
    if (status !== 'done') return null;
    const entries = Object.entries(counts);
    return buildSketch(entries, rows, columns);
  }, [status, counts, rows, columns]);

  const wasStemmed = stemmedQuery && stemmedQuery !== trimmedQuery;

  const estimate =
    sketch && stemmedQuery.length > 0 ? check(sketch, stemmedQuery) : null;

  const actual = sketch && stemmedQuery ? (counts[stemmedQuery] ?? 0) : null;

  const msg =
    status === 'isLoading' ? (
      'Loading all counts...'
    ) : status === 'hasError' ? (
      <span className="text-red-500">
        Oi! Sorry about this, we failed to load exact counts
      </span>
    ) : wasStemmed ? (
      <span>
        Stemmed to <span className="font-mono">{stemmedQuery}</span> before
        hashing.
      </span>
    ) : null;

  return (
    <div className="my-6 flex flex-col items-center">
      <div className="w-full max-w-3xl space-y-4">
        <h3 className="text-center text-xl font-bold text-gray-900">{title}</h3>
        {isConfigurable ? (
          <ConfigEditor config={config} onSubmit={handleConfigSubmit} />
        ) : null}
        <div className="flex gap-0 overflow-hidden border border-gray-200 font-mono">
          <div className="flex flex-1 items-center bg-white p-6">
            <div className="w-full space-y-3">
              <div className="flex flex-wrap gap-2">
                {examples.map((word) => (
                  <ExampleButton
                    key={word}
                    word={word}
                    isActive={trimmedQuery === word.toLowerCase()}
                    onSelect={setQuery}
                  />
                ))}
              </div>
              <div>
                <input
                  className="w-full border border-gray-300 bg-white px-3 py-1.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Type any word to query the sketch…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <p
                  className={clsx(
                    'mt-2 text-xs text-gray-500 transition-opacity duration-300',
                    msg ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  {msg}&nbsp;
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 bg-gray-50 px-4 py-6">
            <ResultCardSide label="Estimate" value={estimate} />
            <ResultCardSide label="Actual" value={actual} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCardSide({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="text-3xl font-bold text-gray-900 transition-all">
        {value !== null ? value.toLocaleString('en-US') : '—'}
      </div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </div>
    </div>
  );
}

function ExampleButton({
  word,
  isActive,
  onSelect,
}: {
  word: string;
  isActive: boolean;
  onSelect: (word: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(word)}
      className={clsx(
        'border px-3 py-1.5 text-sm font-semibold',
        isActive
          ? 'border-gray-900 bg-gray-900 text-white hover:bg-gray-800'
          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50',
      )}
    >
      {word}
    </button>
  );
}

function ConfigEditor({
  config,
  onSubmit,
}: {
  config: SketchConfig;
  onSubmit: (config: SketchConfig) => void;
}) {
  const [currConfig, setCurrConfig] = useState(config);

  const hasChanges =
    currConfig.columns !== config.columns ||
    currConfig.rows !== config.rows;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const columnsValue = Number.parseInt(
          String(formData.get('columns') ?? ''),
          10,
        );
        const rowsValue = Number.parseInt(
          String(formData.get('rows') ?? ''),
          10,
        );

        onSubmit({
          columns:
            Number.isFinite(columnsValue) && columnsValue > 0
              ? columnsValue
              : config.columns,
          rows:
            Number.isFinite(rowsValue) && rowsValue > 0
              ? rowsValue
              : config.rows,
        });
      }}
      className="flex items-end justify-end gap-3"
    >
      <label className="flex flex-shrink-0 flex-col text-sm font-medium text-gray-600">
        <span className="mb-1 text-xs uppercase tracking-wide text-gray-500">
          Columns
        </span>
        <input
          className="w-20 border border-gray-300 px-3 py-2 font-mono text-base transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
          name="columns"
          value={currConfig.columns}
          onChange={(e) => setCurrConfig({ ...currConfig, columns: Number.parseInt(e.target.value, 10) || 0 })}
          inputMode="numeric"
        />
      </label>
      <label className="flex flex-shrink-0 flex-col text-sm font-medium text-gray-600">
        <span className="mb-1 text-xs uppercase tracking-wide text-gray-500">
          Rows
        </span>
        <input
          className="w-20 border border-gray-300 px-3 py-2 font-mono text-base transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
          name="rows"
          value={currConfig.rows}
          onChange={(e) => setCurrConfig({ ...currConfig, rows: Number.parseInt(e.target.value, 10) || 0 })}
          inputMode="numeric"
        />
      </label>
      <div className="flex flex-shrink-0 flex-col">
        <span className="mb-1 text-xs uppercase tracking-wide text-gray-500 opacity-0">
          &nbsp;
        </span>
        <button
          type="submit"
          disabled={!hasChanges}
          className={clsx(
            'border px-4 py-2 text-base font-semibold transition-all',
            hasChanges
              ? 'border-blue-500 bg-blue-500 text-white hover:bg-blue-600'
              : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400',
          )}
        >
          Change
        </button>
      </div>
    </form>
  );
}
