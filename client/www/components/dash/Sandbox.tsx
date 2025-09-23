import { init as initAdmin, tx, id, lookup } from '@instantdb/admin';
import { init as initCore, InstantUnknownSchema } from '@instantdb/core';
import Json from '@uiw/react-json-view';
import { lightTheme } from '@uiw/react-json-view/light';
import { darkTheme } from '@uiw/react-json-view/dark';

import config, { getLocal, setLocal } from '@/lib/config';
import { InstantApp } from '@/lib/types';
import { Editor } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Label, TextInput } from '@/components/ui';
import { dbAttrsToExplorerSchema } from '@/lib/schema';
import clsx from 'clsx';
import useLocalStorage from '@/lib/hooks/useLocalStorage';
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react';
import { InstantReactWebDatabase } from '@instantdb/react';
import { useDarkMode } from './DarkModeToggle';

let cachedSandboxValue = '';

try {
  cachedSandboxValue = getLocal('__instant_sandbox_value') ?? '';
} catch (error) {}

export function Sandbox({
  app,
  db,
}: {
  app: InstantApp;
  db: InstantReactWebDatabase<any>;
}) {
  const consoleRef = useRef<HTMLDivElement>(null);
  const [sandboxCodeValue, setSandboxValue] = useLocalStorage(
    `__instant_sandbox_value:${app.id}`,
    cachedSandboxValue,
  );
  const [runAsUserEmail, setRunAsUserEmail] = useLocalStorage(
    `__instant_sandbox_email:${app.id}`,
    '',
  );
  const [dangerouslyCommitTx, setDangerouslyCommitTx] = useState(false);
  const [appendResults, setAppendResults] = useState(false);
  const [collapseQuery, setHideQuery] = useState(false);
  const [collapseLog, setCollapseLog] = useState(false);
  const [collapseTransaction, setCollapseTransaction] = useState(false);
  const [defaultCollapsed, setDefaultCollapsed] = useState(false);
  const [useAppPerms, setUseAppPerms] = useState(true);
  const [permsValue, setPermsValue] = useState(() =>
    app.rules ? JSON.stringify(app.rules, null, 2) : '',
  );
  const [output, setOutput] = useState<any[]>([]);
  const [showRunning, setShowRunning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const { darkMode } = useDarkMode();

  function out(
    type: 'log' | 'error' | 'query' | 'transaction' | 'eval',
    data: any,
    execTimeMs?: number,
  ) {
    setOutput((o) => o.concat({ type, data, execTimeMs }));
  }

  useEffect(() => {
    const coreDb = initCore({
      appId: app.id,
      apiURI: config.apiURI,
    });

    const unsubAttrs = coreDb._reactor.subscribeAttrs((_oAttrs: any) => {
      let unsubImmediately = setInterval(() => {
        if (unsubAttrs) {
          unsubAttrs();
          clearInterval(unsubImmediately);
        }
      }, 10);
      if (sandboxCodeValue) return;
      const schema = dbAttrsToExplorerSchema(_oAttrs);
      const ns = schema.at(0);
      setSandboxValue(initialSandboxValue(ns?.name || 'example'));
    });
  }, []);

  useEffect(() => {
    consoleRef.current?.scrollTo(0, consoleRef.current.scrollHeight);
  }, [output]);

  const exec = async () => {
    if (isExecuting) return;

    setIsExecuting(true);
    const timer = setTimeout(() => setShowRunning(true), 200);

    if (!appendResults) {
      setOutput([]);
    } else if (output.length) {
      out('eval', { id: Date.now() });
    }

    const adminDb = initAdmin({
      adminToken: app.admin_token,
      appId: app.id,
      apiURI: config.apiURI,
    }).asUser(runAsUserEmail ? { email: runAsUserEmail } : { guest: true });

    let rules: any;
    if (useAppPerms) {
      rules = app.rules ?? undefined;
    } else if (!useAppPerms && permsValue) {
      try {
        rules = JSON.parse(permsValue);
      } catch (error) {
        out('error', {
          message: 'Could not parse permissions as JSON.',
        });
      }
    }

    const _console = {
      ...console,
      log: (...data: any[]) => {
        console.log(...data);
        out('log', data);
      },
    };

    const _db = {
      transact: async (s: any) => {
        try {
          const startTime = performance.now();
          const response = await adminDb.debugTransact(s, {
            rules,
            // @ts-expect-error because this is a private API - shh! 🤫
            __dangerouslyCommit: dangerouslyCommitTx,
          });
          const execTimeMs = performance.now() - startTime;
          out('transaction', { response, rules }, execTimeMs);

          return { 'tx-id': response['tx-id'] };
        } catch (error) {
          out('error', { message: JSON.stringify(error, null, '  ') });
          throw error;
        }
      },
      query: async (q: any, opts?: any) => {
        try {
          const startTime = performance.now();
          const response = await adminDb.debugQuery(q, { rules, ...opts });
          const execTimeMs = performance.now() - startTime;
          out('query', { response, rules }, execTimeMs);

          return response.result;
        } catch (error) {
          out('error', { message: JSON.stringify(error, null, '  ') });
          throw error;
        }
      },
      tx,
    };

    try {
      const body = `return (async () => {\n${sandboxCodeValue}\n})()`;

      let f: Function;
      try {
        f = new Function('console', 'db', 'id', 'tx', 'lookup', body);
      } catch (error) {
        out('error', {
          message:
            'Oops! There was an error evaluating your code. Please check your syntax and try again.',
        });
        throw error;
      }

      try {
        await f(_console, _db, id, tx, lookup);
      } catch (error: any) {
        out('error', {
          message: error?.message || 'Error running code',
        });
        throw error;
      }
    } catch (error) {
      console.error(error);
    } finally {
      clearTimeout(timer);
      setShowRunning(false);
      setIsExecuting(false);
    }
  };

  const execRef = useRef<() => void>(exec);
  execRef.current = exec;

  return (
    <div className="flex h-full flex-1 overflow-y-hidden">
      <div className="flex min-w-[24em] flex-1 flex-col border-r dark:border-r-neutral-600">
        <div className="flex flex-1 flex-col border-b dark:border-b-neutral-800">
          <div className="flex items-center justify-between gap-2 border-b bg-gray-50 px-2 py-1 text-xs dark:border-b-neutral-700 dark:bg-neutral-800">
            <div className="flex items-center gap-2">
              JS Sandbox
              <Button
                size="nano"
                onClick={() => execRef.current()}
                disabled={showRunning}
              >
                {showRunning ? 'Running...' : 'Run'}
              </Button>
              <div className="ml-3">
                <Checkbox
                  label="Write to DB"
                  checked={dangerouslyCommitTx}
                  onChange={setDangerouslyCommitTx}
                />
              </div>
            </div>
          </div>
          {dangerouslyCommitTx ? (
            <div className="border-b border-b-amber-100 bg-amber-50 px-2 py-1 text-xs text-amber-600 dark:border-b-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
              <strong>Use caution!</strong> Successful transactions will update
              your app's DB!
            </div>
          ) : (
            <div className="border-b border-b-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-600 dark:border-b-neutral-700 dark:bg-sky-900/80 dark:text-sky-400/90">
              <strong>Debug mode.</strong> Transactions will not update your
              app's DB.
            </div>
          )}
          <div className="flex-1">
            <Editor
              theme={darkMode ? 'vs-dark' : 'light'}
              height={'100%'}
              path="sandbox.ts"
              language="typescript"
              value={sandboxCodeValue}
              onChange={(v) => {
                setSandboxValue(v ?? '');
              }}
              options={{
                scrollBeyondLastLine: false,
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                minimap: { enabled: false },
                automaticLayout: true,
                lineNumbers: 'off',
              }}
              onMount={(editor, monaco) => {
                editor.addCommand(
                  monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                  () => execRef.current(),
                );

                editor.addCommand(
                  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                  () => {},
                );

                monaco.languages.typescript.typescriptDefaults.addExtraLib(
                  tsTypes,
                  'ts:filename/global.d.ts',
                );

                monaco.languages.typescript.typescriptDefaults.setCompilerOptions(
                  {
                    module: monaco.languages.typescript.ModuleKind.ESNext,
                    target: monaco.languages.typescript.ScriptTarget.ESNext,
                  },
                );

                monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(
                  {
                    diagnosticCodesToIgnore: [
                      // top-level await without export
                      1375,
                    ],
                  },
                );
              }}
            />
          </div>
        </div>
        <div className="flex flex-col border-b dark:border-b-neutral-700">
          <div className="flex flex-col gap-1 border-b bg-gray-50 px-2 py-1 text-xs dark:border-b-neutral-700 dark:bg-neutral-800">
            Context
          </div>
          <div className="flex items-center gap-2 px-2 py-1">
            <Label className="text-xs font-normal">
              Set{' '}
              <code className="border bg-white px-2 dark:border-neutral-600 dark:bg-neutral-800">
                auth.email
              </code>
            </Label>
            <EmailInput
              key={app.id}
              db={db}
              email={runAsUserEmail}
              setEmail={setRunAsUserEmail}
              onEnter={execRef.current}
            />
          </div>
        </div>

        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-2 border-b bg-gray-50 px-2 py-1 text-xs dark:border-b-neutral-700 dark:bg-neutral-800">
            Permissions
            <div>
              <Checkbox
                label="Use saved app rules"
                checked={useAppPerms}
                onChange={setUseAppPerms}
              />
            </div>
          </div>
          {useAppPerms ? null : (
            <div className="border-b border-b-amber-100 bg-amber-50 px-2 py-1 text-xs text-amber-600 dark:border-b-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
              <strong>Use caution!</strong> Transactions above will be evaluated
              with these rules.
            </div>
          )}
          <div className="flex flex-1 overflow-hidden bg-white dark:bg-neutral-800">
            <div className={clsx('flex-1', useAppPerms ? 'opacity-50' : '')}>
              {useAppPerms ? (
                <Editor
                  theme={darkMode ? 'vs-dark' : 'light'}
                  key="app"
                  path="app-permissions.json"
                  value={app.rules ? JSON.stringify(app.rules, null, 2) : ''}
                  height={'100%'}
                  language="json"
                  options={{
                    ...editorOptions,
                    readOnly: true,
                  }}
                />
              ) : (
                <Editor
                  theme={darkMode ? 'vs-dark' : 'light'}
                  key="custom"
                  path="custom-permissions.json"
                  value={permsValue}
                  onChange={(v) => setPermsValue(v ?? '')}
                  height={'100%'}
                  language="json"
                  options={editorOptions}
                  onMount={(editor, monaco) => {
                    editor.addCommand(
                      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                      () => execRef.current(),
                    );
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex min-w-[24em] flex-1 flex-col overflow-hidden">
        <div className="flex flex-col gap-1 border-b bg-gray-50 px-2 py-1 text-xs dark:border-b-neutral-700 dark:bg-neutral-800">
          <div className="flex gap-2">
            Output
            <Button size="nano" onClick={() => setOutput([])}>
              Clear
            </Button>
          </div>
          <div className="no-scrollbar flex gap-2 overflow-y-auto">
            <Checkbox
              labelClassName="whitespace-nowrap"
              label="Append results"
              checked={appendResults}
              onChange={setAppendResults}
            />
            <Checkbox
              labelClassName="whitespace-nowrap"
              label="Collapse data"
              checked={defaultCollapsed}
              onChange={setDefaultCollapsed}
            />
            <Checkbox
              labelClassName="whitespace-nowrap"
              label="Collapse query"
              checked={collapseQuery}
              onChange={setHideQuery}
            />
            <Checkbox
              labelClassName="whitespace-nowrap"
              label="Collapse log"
              checked={collapseLog}
              onChange={setCollapseLog}
            />
            <Checkbox
              labelClassName="whitespace-nowrap"
              label="Collapse transact"
              checked={collapseTransaction}
              onChange={setCollapseTransaction}
            />
          </div>
        </div>
        <div
          ref={consoleRef}
          className="flex w-full flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden bg-gray-100 p-4 text-xs dark:bg-neutral-800/40"
        >
          {output.map((o, i) =>
            o.type === 'eval' ? (
              <div
                key={i}
                className="my-6 border-b border-gray-300 dark:border-b-neutral-600"
              ></div>
            ) : (
              <div
                className={clsx(
                  'rounded border bg-gray-50 shadow-sm transition-all hover:shadow dark:bg-neutral-800',
                  {
                    'border-sky-200 dark:border-sky-600/50': o.type === 'log',
                    'border-red-200 dark:border-red-600/50': o.type === 'error',
                    'border-teal-200 dark:border-teal-600/50':
                      o.type === 'query',
                    'border-purple-200 dark:border-purple-600/50':
                      o.type === 'transaction',
                  },
                )}
              >
                <div
                  className={clsx('px-2 pt-1 text-center font-mono font-bold', {
                    'text-sky-600 dark:text-sky-400': o.type === 'log',
                    'text-red-600 dark:text-red-400': o.type === 'error',
                    'text-teal-600 dark:text-teal-400': o.type === 'query',
                    'text-purple-600 dark:text-purple-400':
                      o.type === 'transaction',
                  })}
                >
                  {o.type}{' '}
                  {o.execTimeMs != null
                    ? ` - (${o.execTimeMs.toFixed(1)} ms)`
                    : ''}
                </div>
                {o.type === 'log' && !collapseLog && (
                  <div className="flex flex-col gap-1 p-3">
                    {o.data.map((d: any, i: number) => (
                      <Data
                        key={i}
                        data={d}
                        collapsed={defaultCollapsed ? 1 : undefined}
                      />
                    ))}
                  </div>
                )}
                {o.type === 'error' && (
                  <div className="flex p-3">
                    <pre className="w-full overflow-x-auto bg-white p-1 dark:bg-neutral-800">
                      {o.data.message}
                    </pre>
                  </div>
                )}
                {o.type === 'query' && !collapseQuery && (
                  <div className="flex flex-col gap-2 p-3">
                    <div className="">Result</div>
                    <Data
                      data={o.data.response.result}
                      collapsed={defaultCollapsed ? 1 : undefined}
                    />
                    <div className="">Permissions Check</div>
                    <div className="flex flex-col gap-1">
                      {o.data.response.checkResults.map((cr: any) => (
                        <div
                          key={cr.entity + '-' + cr.id}
                          className={clsx(
                            'flex flex-col gap-1 rounded border bg-gray-100 px-2 py-1 dark:bg-neutral-800',
                            {
                              'border-emerald-200 dark:border-emerald-600':
                                Boolean(cr.check),
                              'border-rose-200 dark:border-rose-600': !Boolean(
                                cr.check,
                              ),
                            },
                          )}
                        >
                          <div className="flex gap-2">
                            {Boolean(cr.check) ? (
                              <span className="border border-emerald-300 bg-white px-1 font-bold text-emerald-600 dark:border-emerald-800 dark:bg-neutral-800">
                                Pass
                              </span>
                            ) : (
                              <span className="border border-rose-300 bg-white px-1 font-bold text-rose-600 dark:bg-neutral-800">
                                Fail
                              </span>
                            )}
                            <strong>{cr.entity}</strong>
                            <code>{cr.id}</code>
                          </div>
                          <div>Record</div>
                          <Data data={cr.record} collapsed={0} />
                          <div>Check</div>
                          <div className="border bg-white dark:border-neutral-600 dark:bg-neutral-800">
                            <span className="border-r bg-gray-50 px-2 font-bold dark:border-neutral-600 dark:bg-neutral-700">
                              view
                            </span>
                            <code className="bg-white px-2 dark:bg-neutral-800">
                              {cr.program?.['display-code'] ?? (
                                <span className="text-gray-400 dark:text-neutral-500">
                                  none
                                </span>
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

                {o.type === 'transaction' && !collapseTransaction && (
                  <div className="flex flex-col gap-2 p-3">
                    {o.data.response['all-checks-ok?'] ? (
                      <p className="rounded border border-emerald-200 bg-white px-1 py-1 dark:border-emerald-600 dark:bg-neutral-800">
                        <span className="border border-emerald-200 bg-white px-1 font-bold text-emerald-600 dark:border-emerald-600 dark:bg-neutral-800">
                          Success
                        </span>{' '}
                        All checks passed!
                      </p>
                    ) : (
                      <p className="rounded border border-rose-200 bg-white px-1 py-1 dark:border-rose-600 dark:bg-neutral-800">
                        <span className="border border-rose-300 bg-white px-1 font-bold text-rose-600 dark:border-rose-600 dark:bg-neutral-800">
                          Failed
                        </span>{' '}
                        Some checks did not pass.
                      </p>
                    )}

                    {o.data.response['committed?'] ? null : (
                      <p className="rounded border border-amber-200 bg-white px-1 py-1 dark:border-amber-600 dark:bg-neutral-800">
                        <span className="border border-amber-300 bg-white px-1 font-bold text-amber-600 dark:border-amber-600 dark:bg-neutral-800">
                          Dry run
                        </span>{' '}
                        Changes were not written to the database.
                      </p>
                    )}

                    <div className="">Permissions Check</div>
                    {o.data.response['check-results'].map((cr: any) => (
                      <div
                        key={cr.entity + '-' + cr.id}
                        className={clsx(
                          'flex flex-col gap-1 rounded border bg-gray-100 px-2 py-1 dark:bg-neutral-800',
                          {
                            'border-emerald-200 dark:border-emerald-600':
                              cr['check-pass?'],
                            'border-rose-200 dark:border-rose-600':
                              !cr['check-pass?'],
                          },
                        )}
                      >
                        <div className="flex gap-2">
                          {cr['check-pass?'] ? (
                            <span className="border border-emerald-300 bg-white px-1 font-bold text-emerald-600 dark:border-emerald-800 dark:bg-neutral-800 dark:text-emerald-800">
                              Pass
                            </span>
                          ) : (
                            <span className="border border-rose-300 bg-white px-1 font-bold text-rose-600 dark:border-rose-600 dark:bg-neutral-800">
                              Fail
                            </span>
                          )}
                          <strong className="rountded border bg-white px-1 text-gray-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                            {cr.action}
                          </strong>
                          <strong>{cr.etype}</strong>
                          <code>{cr.eid}</code>
                        </div>
                        <div>Value</div>
                        <Data
                          data={cr.bindings?.['new-data'] || cr.data?.updated}
                          collapsed={0}
                        />
                        <div>Check</div>
                        <div className="border bg-white dark:border-neutral-600 dark:bg-neutral-800">
                          <span className="border-r bg-gray-50 px-2 font-bold dark:border-neutral-600 dark:bg-neutral-700">
                            {cr.action}
                          </span>
                          <code className="bg-white px-2 dark:bg-neutral-800">
                            {cr.program?.['display-code'] ?? (
                              <span className="text-gray-400 dark:text-neutral-500">
                                none
                              </span>
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
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function EmailInput({
  db,
  email,
  setEmail,
  onEnter,
}: {
  db: InstantReactWebDatabase<InstantUnknownSchema>;
  email: string;
  setEmail: (email: string) => void;
  onEnter: () => void;
}) {
  const { data } = db.useQuery({
    $users: {
      $: {
        where: {
          email: { $ilike: `%${email}%` },
        },
        limit: 10,
        fields: ['email'],
      },
    },
  });

  // @ts-ignore: expects users to have unknown properties
  const comboOptions: { id: string; email: string }[] = data?.$users || [];

  return (
    <Combobox
      value={email}
      onChange={(email) => {
        setEmail(email ?? '');
      }}
      immediate={true}
    >
      <ComboboxInput
        size={32}
        className="px-2 py-0.5 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.metaKey && e.key === 'Enter') {
            onEnter();
          }
        }}
        autoComplete="off"
        placeholder="happyuser@instantdb.com"
      />
      <ComboboxOptions
        anchor="bottom start"
        modal={false}
        className="z-10 mt-1 w-[var(--input-width)] divide-y overflow-auto border border-gray-300 bg-white shadow-lg dark:divide-neutral-600 dark:border-neutral-600 dark:bg-neutral-700"
      >
        {!email ? (
          <ComboboxOption
            key="none"
            value=""
            className={clsx(
              'px-2 py-0.5 text-xs data-[focus]:bg-blue-100 dark:text-white dark:data-[focus]:bg-neutral-600',
              {},
            )}
          >
            <span>{'<none>'}</span>
          </ComboboxOption>
        ) : null}

        {comboOptions.map((user, i) => (
          <ComboboxOption
            key={user.id}
            value={user.email}
            className={clsx(
              'px-2 py-0.5 text-xs data-[focus]:bg-blue-100 dark:text-white dark:data-[focus]:bg-neutral-600',
              {},
            )}
          >
            <span>{user.email}</span>
          </ComboboxOption>
        ))}
      </ComboboxOptions>
    </Combobox>
  );
}

function Data({
  data,
  collapsed,
}: {
  data: any;
  collapsed?: boolean | number;
}) {
  const isObject = typeof data === 'object' && data !== null;
  const { darkMode: isDark } = useDarkMode();

  return (
    <div className="rounded bg-white p-1 dark:bg-[#262626]">
      {isObject ? (
        <Json
          value={data}
          collapsed={collapsed}
          displayDataTypes={false}
          displayObjectSize={false}
          enableClipboard={false}
          indentWidth={2}
          style={
            isDark ? { ...darkTheme, backgroundColor: '#262626' } : lightTheme
          }
        />
      ) : (
        <pre style={{ fontSize: '0.675rem' }} className="overflow-x-auto">
          {JSON.stringify(data) ?? 'undefined'}
        </pre>
      )}
    </div>
  );
}

function isJsSimpleKey(str: string) {
  return /^[a-zA-Z0-9_]+$/.test(str);
}

function initialSandboxValue(name: string) {
  const nameQueryKeyCode = isJsSimpleKey(name) ? `${name}` : `["${name}"]`;
  const namePropCode = isJsSimpleKey(name) ? `.${name}` : `["${name}"]`;
  return `
// This is a space to hack on queries and mutations
// \`db\`, \`id\`, and \`lookup\` are all available globally
// Press Cmd/Ctrl + Enter to run the code

const res = await db.query({
  ${nameQueryKeyCode}: {
    $: {
      limit: 2,
    },
  },
});

const itemId = res${namePropCode}[0]?.id;

console.log('${name} ID:', itemId);

if (itemId) {
  await db.transact([
    db.tx${namePropCode}[itemId].update({ test: 1 }),
  ]);
}
`.trim();
}

const tsTypes = /* ts */ `
type InstantDB = {
  transact: (steps) => Promise<number>;
  query: (iql, opts?: {ruleParams?: Record<string, any>}) => Promise<any>;
  tx: InstantTx;
};

type InstantTx = {
  [namespace: string]: {
    [id: string]: {
      create: (v: Record<string, any>) => any;
      update: (v: Record<string, any>, opts?: {upsert?: boolean | undefined}) => any;
      merge: (v: Record<string, any>) => any;
      delete: () => any;
      link: (v: Record<string, string>) => any;
      unlink: (v: Record<string, string>) => any;
      ruleParams: (v: Record<string, any>) => any;
    };
  };
};

declare global {
  var db: InstantDB;
  var tx: InstantTx;
  function id(): string;
  function lookup(key: string, value: string): string;
}

export {};
`.trim();

const editorOptions = {
  scrollBeyondLastLine: false,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  minimap: { enabled: false },
  automaticLayout: true,
  lineNumbers: 'off' as const,
};
