import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { ChevronLeftIcon } from '@heroicons/react/24/outline';
import { Virtuoso } from 'react-virtuoso';
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
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          Back to list
        </button>
        <div
          className={clsx('font-mono text-xs font-bold', {
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
      </div>
      <div className="flex-1 bg-gray-200 text-xs overflow-hidden">
        {output.type === 'log' && (
          <div className="p-4">
            <div className="flex flex-col gap-1">
              {output.data.map((d: any, i: number) => (
                <Data
                  key={i}
                  data={d}
                  collapsed={defaultCollapsed ? 1 : undefined}
                />
              ))}
            </div>
          </div>
        )}
        {output.type === 'error' && (
          <div className="p-4">
            <pre className="p-1 bg-white w-full overflow-x-auto">
              {output.data.message}
            </pre>
          </div>
        )}
        {output.type === 'query' && (
          <Virtuoso
            className="h-full"
            data={[
              { type: 'header', text: 'Result' },
              { type: 'result', data: output.data.response.result },
              { type: 'header', text: 'Permissions Check' },
              ...output.data.response.checkResults.map((cr: any) => ({
                type: 'check-result',
                cr,
              })),
            ]}
            itemContent={(index, item) => (
              <div className="px-4">
                {item.type === 'header' && (
                  <div className="font-semibold pt-4 pb-2">{item.text}</div>
                )}
                {item.type === 'result' && (
                  <Data
                    data={item.data}
                    collapsed={defaultCollapsed ? 1 : undefined}
                  />
                )}
                {item.type === 'check-result' && (
                  <div className="pb-1">
                    <div
                      className={clsx(
                        'flex flex-col gap-1 px-2 py-1 bg-gray-100 rounded border',
                        {
                          'border-emerald-200': Boolean(item.cr.check),
                          'border-rose-200': !Boolean(item.cr.check),
                        },
                      )}
                    >
                      <div className="flex gap-2">
                        {Boolean(item.cr.check) ? (
                          <span className="text-emerald-600 border-emerald-300 px-1 bg-white font-bold border">
                            Pass
                          </span>
                        ) : (
                          <span className="text-rose-600 border-rose-300 px-1 bg-white font-bold border">
                            Fail
                          </span>
                        )}
                        <strong>{item.cr.entity}</strong>
                        <code>{item.cr.id}</code>
                      </div>
                      <div>Record</div>
                      <Data data={item.cr.record} collapsed={0} />
                      <div>Check</div>
                      <div className="border bg-white">
                        <span className="px-2 border-r font-bold bg-gray-50">
                          view
                        </span>
                        <code className="bg-white px-2">
                          {item.cr.program?.['display-code'] ?? (
                            <span className="text-gray-400">none</span>
                          )}
                        </code>
                      </div>
                      <Data
                        data={item.cr.check}
                        collapsed={defaultCollapsed ? 1 : undefined}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          />
        )}
        {output.type === 'transaction' && (
          <Virtuoso
            className="h-full"
            data={[
              ...(output.data.response['all-checks-ok?']
                ? [{ type: 'status', success: true }]
                : [{ type: 'status', success: false }]),
              ...(!output.data.response['committed?']
                ? [{ type: 'dry-run' }]
                : []),
              { type: 'header', text: 'Permissions Check' },
              ...output.data.response['check-results'].map((cr: any) => ({
                type: 'check-result',
                cr,
              })),
            ]}
            itemContent={(index, item) => (
              <div className="px-4">
                {item.type === 'status' && item.success && (
                  <div className="pt-4">
                    <p className="bg-white border border-emerald-200 rounded px-1 py-1">
                      <span className="text-emerald-600 border border-emerald-200 px-1 bg-white font-bold">
                        Success
                      </span>{' '}
                      All checks passed!
                    </p>
                  </div>
                )}
                {item.type === 'status' && !item.success && (
                  <div className="pt-4">
                    <p className="bg-white border border-rose-200 rounded px-1 py-1">
                      <span className="text-rose-600 border-rose-300 px-1 bg-white border font-bold">
                        Failed
                      </span>{' '}
                      Some checks did not pass.
                    </p>
                  </div>
                )}
                {item.type === 'dry-run' && (
                  <div className="pt-2">
                    <p className="bg-white border border-amber-200 rounded px-1 py-1">
                      <span className="text-amber-600 border-amber-300 px-1 bg-white border font-bold">
                        Dry run
                      </span>{' '}
                      Changes were not written to the database.
                    </p>
                  </div>
                )}
                {item.type === 'header' && (
                  <div className="font-semibold pt-4 pb-2">{item.text}</div>
                )}
                {item.type === 'check-result' && (
                  <div className="pb-1">
                    <div
                      className={clsx(
                        'flex flex-col gap-1 px-2 py-1 bg-gray-100 rounded border',
                        {
                          'border-emerald-200': item.cr['check-pass?'],
                          'border-rose-200': !item.cr['check-pass?'],
                        },
                      )}
                    >
                      <div className="flex gap-2">
                        {item.cr['check-pass?'] ? (
                          <span className="text-emerald-600 border-emerald-300 font-bold border px-1 bg-white">
                            Pass
                          </span>
                        ) : (
                          <span className="text-rose-600 border-rose-300 font-bold border px-1 bg-white">
                            Fail
                          </span>
                        )}
                        <strong className="bg-white border text-gray-700 rounded px-1">
                          {item.cr.action}
                        </strong>
                        <strong>{item.cr.etype}</strong>
                        <code>{item.cr.eid}</code>
                      </div>
                      <div>Value</div>
                      <Data data={item.cr.data?.updated} collapsed={0} />
                      <div>Check</div>
                      <div className="border bg-white">
                        <span className="px-2 border-r font-bold bg-gray-50">
                          {item.cr.action}
                        </span>
                        <code className="bg-white px-2">
                          {item.cr.program?.['display-code'] ?? (
                            <span className="text-gray-400">none</span>
                          )}
                        </code>
                      </div>
                      <Data
                        data={item.cr['check-result']}
                        collapsed={defaultCollapsed ? 1 : undefined}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
