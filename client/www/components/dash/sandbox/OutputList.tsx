import clsx from 'clsx';
import { ChevronLeftIcon } from '@heroicons/react/24/outline';

interface OutputItem {
  type: 'log' | 'error' | 'query' | 'transaction' | 'eval';
  data: any;
  execTimeMs?: number;
}

export function OutputList({
  output,
  onSelectOutput,
}: {
  output: OutputItem[];
  onSelectOutput: (index: number) => void;
}) {
  return (
    <div className="flex flex-col flex-1 gap-2 p-4 bg-gray-200 text-xs w-full overflow-y-auto overflow-x-hidden">
      {output.length === 0 ? (
        <div className="text-gray-500 text-center py-8">
          No output yet. Run some code to see results.
        </div>
      ) : (
        output.map((o, i) =>
          o.type === 'eval' ? (
            <div key={i} className="my-2 border-b border-gray-300"></div>
          ) : (
            <div
              key={i}
              onClick={() => onSelectOutput(i)}
              className={clsx(
                'transition-all border rounded bg-gray-50 shadow-sm hover:shadow cursor-pointer p-3',
                {
                  'border-sky-200 hover:border-sky-300': o.type === 'log',
                  'border-red-200 hover:border-red-300': o.type === 'error',
                  'border-teal-200 hover:border-teal-300': o.type === 'query',
                  'border-purple-200 hover:border-purple-300':
                    o.type === 'transaction',
                },
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={clsx('font-mono font-bold uppercase', {
                      'text-sky-600': o.type === 'log',
                      'text-red-600': o.type === 'error',
                      'text-teal-600': o.type === 'query',
                      'text-purple-600': o.type === 'transaction',
                    })}
                  >
                    {o.type}
                  </span>
                  {o.execTimeMs != null && (
                    <span className="text-gray-500">
                      {o.execTimeMs.toFixed(1)} ms
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {o.type === 'transaction' && (
                    <>
                      {o.data.response['all-checks-ok?'] ? (
                        <span className="text-emerald-600 border border-emerald-300 px-1 bg-white font-bold">
                          Success
                        </span>
                      ) : (
                        <span className="text-rose-600 border-rose-300 px-1 bg-white border font-bold">
                          Failed
                        </span>
                      )}
                      {!o.data.response['committed?'] && (
                        <span className="text-amber-600 border-amber-300 px-1 bg-white border font-bold">
                          Dry run
                        </span>
                      )}
                    </>
                  )}
                  {o.type === 'query' && (
                    <span className="text-gray-500">
                      {o.data.response.checkResults.length} permission check(s)
                    </span>
                  )}
                  {o.type === 'transaction' && (
                    <span className="text-gray-500">
                      {o.data.response['check-results'].length} permission
                      check(s)
                    </span>
                  )}
                  <ChevronLeftIcon className="w-4 h-4 text-gray-400 rotate-180" />
                </div>
              </div>
              {o.type === 'error' && (
                <div className="mt-2 text-red-600 truncate">
                  {o.data.message}
                </div>
              )}
              {o.type === 'log' && (
                <div className="mt-2 text-gray-600 truncate">
                  {o.data.map((d: any) => JSON.stringify(d)).join(', ')}
                </div>
              )}
            </div>
          ),
        )
      )}
    </div>
  );
}
