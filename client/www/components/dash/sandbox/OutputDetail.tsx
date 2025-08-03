import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { ChevronLeftIcon } from '@heroicons/react/24/outline';
import { Data } from './Data';

interface OutputItem {
  type: 'log' | 'error' | 'query' | 'transaction' | 'eval';
  data: any;
  execTimeMs?: number;
}

export function OutputDetail({
  output,
  defaultCollapsed,
  onBack,
}: {
  output: OutputItem;
  defaultCollapsed: boolean;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 border-b">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          Back to list
        </button>
      </div>
      <div className="flex flex-col flex-1 p-4 bg-gray-200 text-xs w-full overflow-y-auto overflow-x-hidden">
        <div
          className={clsx(
            'transition-all border rounded bg-gray-50 shadow-sm',
            {
              'border-sky-200': output.type === 'log',
              'border-red-200': output.type === 'error',
              'border-teal-200': output.type === 'query',
              'border-purple-200': output.type === 'transaction',
            },
          )}
        >
          <div
            className={clsx('px-2 pt-1 font-mono text-center font-bold', {
              'text-sky-600': output.type === 'log',
              'text-red-600': output.type === 'error',
              'text-teal-600': output.type === 'query',
              'text-purple-600': output.type === 'transaction',
            })}
          >
            {output.type}{' '}
            {output.execTimeMs != null
              ? ` - (${output.execTimeMs.toFixed(1)} ms)`
              : ''}
          </div>
          {output.type === 'log' && (
            <div className="flex flex-col p-3 gap-1">
              {output.data.map((d: any, i: number) => (
                <Data
                  key={i}
                  data={d}
                  collapsed={defaultCollapsed ? 1 : undefined}
                />
              ))}
            </div>
          )}
          {output.type === 'error' && (
            <div className="p-3 flex">
              <pre className="p-1 bg-white w-full overflow-x-auto">
                {output.data.message}
              </pre>
            </div>
          )}
          {output.type === 'query' && (
            <div className="flex flex-col gap-2 p-3">
              <div className="">Result</div>
              <Data
                data={output.data.response.result}
                collapsed={defaultCollapsed ? 1 : undefined}
              />
              <div className="">Permissions Check</div>
              <div className="flex flex-col gap-1">
                {/* TODO: Add virtualization here for large permission check lists */}
                {output.data.response.checkResults.map((cr: any) => (
                  <div
                    key={cr.entity + '-' + cr.id}
                    className={clsx(
                      'flex flex-col gap-1 px-2 py-1 bg-gray-100 rounded border',
                      {
                        'border-emerald-200': Boolean(cr.check),
                        'border-rose-200': !Boolean(cr.check),
                      },
                    )}
                  >
                    <div className="flex gap-2">
                      {Boolean(cr.check) ? (
                        <span className="text-emerald-600 border-emerald-300 px-1 bg-white font-bold border">
                          Pass
                        </span>
                      ) : (
                        <span className="text-rose-600 border-rose-300 px-1 bg-white font-bold border">
                          Fail
                        </span>
                      )}
                      <strong>{cr.entity}</strong>
                      <code>{cr.id}</code>
                    </div>
                    <div>Record</div>
                    <Data data={cr.record} collapsed={0} />
                    <div>Check</div>
                    <div className="border bg-white">
                      <span className="px-2 border-r font-bold bg-gray-50">
                        view
                      </span>
                      <code className="bg-white px-2">
                        {cr.program?.['display-code'] ?? (
                          <span className="text-gray-400">none</span>
                        )}
                      </code>
                    </div>
                    <Data
                      data={cr.check}
                      collapsed={defaultCollapsed ? 1 : undefined}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {output.type === 'transaction' && (
            <div className="flex flex-col gap-2 p-3">
              {output.data.response['all-checks-ok?'] ? (
                <p className="bg-white border border-emerald-200 rounded px-1 py-1">
                  <span className="text-emerald-600 border border-emerald-200 px-1 bg-white font-bold">
                    Success
                  </span>{' '}
                  All checks passed!
                </p>
              ) : (
                <p className="bg-white border border-rose-200 rounded px-1 py-1">
                  <span className="text-rose-600 border-rose-300 px-1 bg-white border font-bold">
                    Failed
                  </span>{' '}
                  Some checks did not pass.
                </p>
              )}

              {output.data.response['committed?'] ? null : (
                <p className="bg-white border border-amber-200 rounded px-1 py-1">
                  <span className="text-amber-600 border-amber-300 px-1 bg-white border font-bold">
                    Dry run
                  </span>{' '}
                  Changes were not written to the database.
                </p>
              )}

              <div className="">Permissions Check</div>
              {/* TODO: Add virtualization here for large permission check lists */}
              {output.data.response['check-results'].map((cr: any) => (
                <div
                  key={cr.entity + '-' + cr.id}
                  className={clsx(
                    'flex flex-col gap-1 px-2 py-1 bg-gray-100 rounded border',
                    {
                      'border-emerald-200': cr['check-pass?'],
                      'border-rose-200': !cr['check-pass?'],
                    },
                  )}
                >
                  <div className="flex gap-2">
                    {cr['check-pass?'] ? (
                      <span className="text-emerald-600 border-emerald-300 font-bold border px-1 bg-white">
                        Pass
                      </span>
                    ) : (
                      <span className="text-rose-600 border-rose-300 font-bold border px-1 bg-white">
                        Fail
                      </span>
                    )}
                    <strong className="bg-white border text-gray-700 rountded px-1">
                      {cr.action}
                    </strong>
                    <strong>{cr.etype}</strong>
                    <code>{cr.eid}</code>
                  </div>
                  <div>Value</div>
                  <Data data={cr.data?.updated} collapsed={0} />
                  <div>Check</div>
                  <div className="border bg-white">
                    <span className="px-2 border-r font-bold bg-gray-50">
                      {cr.action}
                    </span>
                    <code className="bg-white px-2">
                      {cr.program?.['display-code'] ?? (
                        <span className="text-gray-400">none</span>
                      )}
                    </code>
                  </div>
                  <Data
                    data={cr['check-result']}
                    collapsed={defaultCollapsed ? 1 : undefined}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
