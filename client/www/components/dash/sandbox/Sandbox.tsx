import { init as initAdmin, tx, id, lookup } from '@instantdb/admin';
import { init as initCore, InstantUnknownSchema } from '@instantdb/core';
import Json from '@uiw/react-json-view';

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
import { OutputList } from './OutputList';
import { OutputDetail } from './OutputDetail';

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
  const [defaultCollapsed, setDefaultCollapsed] = useState(false);
  const [useAppPerms, setUseAppPerms] = useState(true);
  const [permsValue, setPermsValue] = useState(() =>
    app.rules ? JSON.stringify(app.rules, null, 2) : '',
  );
  const [output, setOutput] = useState<any[]>([]);
  const [showRunning, setShowRunning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [selectedOutputIndex, setSelectedOutputIndex] = useState<number | null>(
    null,
  );

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

  const exec = async () => {
    // Reset the selected output.
    setSelectedOutputIndex(null);

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
    <div className="flex flex-1 h-full overflow-y-hidden">
      <div className="flex flex-col flex-1 border-r min-w-[24em]">
        <div className="flex flex-col flex-1 border-b">
          <div className="py-1 px-2 bg-gray-50 border-b text-xs flex gap-2 items-center justify-between">
            <div className="flex gap-2 items-center">
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
            <div className="text-xs py-1 px-2 border-b bg-amber-50 text-amber-600 border-b-amber-100">
              <strong>Use caution!</strong> Successful transactions will update
              your app's DB!
            </div>
          ) : (
            <div className="text-xs py-1 px-2  border-b bg-sky-50 text-sky-600 border-b-sky-200">
              <strong>Debug mode.</strong> Transactions will not update your
              app's DB.
            </div>
          )}
          <div className="flex-1">
            <Editor
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
        <div className="flex flex-col border-b">
          <div className="flex flex-col px-2 py-1 gap-1 bg-gray-50 border-b text-xs">
            Context
          </div>
          <div className="px-2 py-1 flex gap-2 items-center">
            <Label className="text-xs font-normal">
              Set <code className="px-2 border bg-white">auth.email</code>
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

        <div className="flex flex-col flex-1">
          <div className="py-1 px-2 bg-gray-50 border-b text-xs flex gap-2 items-center">
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
            <div className="text-xs py-1 px-2 border-b bg-amber-50 text-amber-600 border-b-amber-100">
              <strong>Use caution!</strong> Transactions above will be evaluated
              with these rules.
            </div>
          )}
          <div className="flex flex-1 overflow-hidden bg-white">
            <div className={clsx('flex-1', useAppPerms ? 'opacity-50' : '')}>
              {useAppPerms ? (
                <Editor
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
      <div className="flex flex-col flex-1 overflow-hidden min-w-[24em]">
        <div className="py-1 px-2 bg-gray-50 border-b text-xs flex flex-col gap-1">
          <div className="flex gap-2">
            Output
            <Button
              size="nano"
              onClick={() => {
                setOutput([]);
                setSelectedOutputIndex(null);
              }}
            >
              Clear
            </Button>
          </div>
          <div className="flex gap-2 no-scrollbar overflow-y-auto">
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
          </div>
        </div>
        {selectedOutputIndex !== null && output[selectedOutputIndex] ? (
          <OutputDetail
            output={output[selectedOutputIndex]}
            defaultCollapsed={defaultCollapsed}
            onBack={() => setSelectedOutputIndex(null)}
          />
        ) : (
          <OutputList output={output} onSelectOutput={setSelectedOutputIndex} />
        )}
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
        className="text-xs px-2 py-0.5"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.metaKey && e.key === 'Enter') {
            onEnter();
          }
        }}
        placeholder="happyuser@instantdb.com"
      />
      <ComboboxOptions
        anchor="bottom start"
        modal={false}
        className="mt-1 w-[var(--input-width)] overflow-auto bg-white shadow-lg z-10 border border-gray-300 divide-y"
      >
        {!email ? (
          <ComboboxOption
            key="none"
            value=""
            className={clsx('text-xs px-2 py-0.5 data-[focus]:bg-blue-100', {})}
          >
            <span>{'<none>'}</span>
          </ComboboxOption>
        ) : null}

        {comboOptions.map((user, i) => (
          <ComboboxOption
            key={user.id}
            value={user.email}
            className={clsx('text-xs px-2 py-0.5 data-[focus]:bg-blue-100', {})}
          >
            <span>{user.email}</span>
          </ComboboxOption>
        ))}
      </ComboboxOptions>
    </Combobox>
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
