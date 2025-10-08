import { id, init as initAdmin, lookup, tx } from '@instantdb/admin';
import { init as initCore, InstantUnknownSchema } from '@instantdb/core';
import Json from '@uiw/react-json-view';
import { darkTheme } from '@uiw/react-json-view/dark';
import { lightTheme } from '@uiw/react-json-view/light';

import {
  Button,
  Checkbox,
  Dialog,
  IconButton,
  Label,
  Select,
  TextInput,
  useDialog,
} from '@/components/ui';
import config from '@/lib/config';
import useLocalStorage from '@/lib/hooks/useLocalStorage';
import { attrsToSchema, dbAttrsToExplorerSchema } from '@/lib/schema';
import { DBAttr, InstantApp } from '@/lib/types';
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react';
import {
  ArrowPathIcon,
  ClipboardIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { InstantReactWebDatabase } from '@instantdb/react';
import { Editor, Monaco, type OnMount } from '@monaco-editor/react';

import clsx from 'clsx';
import { createParser, createSerializer, parseAsBoolean } from 'nuqs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { debounce } from 'lodash';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../resizable';
import { useDarkMode } from './DarkModeToggle';
import { Save } from 'lucide-react';
import { infoToast } from '@/lib/toast';
import { useSavedQueryState } from '@/lib/hooks/useSavedQueryState';
import { addInstantLibs } from '@/lib/monaco';
import {
  apiSchemaToInstantSchemaDef,
  generateSchemaTypescriptFile,
} from '@instantdb/platform';

const base64Parser = createParser({
  parse(value) {
    try {
      return JSON.parse(atob(value));
    } catch {
      return '';
    }
  },
  serialize(value) {
    return btoa(JSON.stringify(value));
  },
});

type SavedSandbox = {
  name: string;
  code: string;
  perms: string;
  runAsUser: string | null;
  useAppPerms: boolean;
  lastSavedAt: string;
};

export function Sandbox({
  app,
  db,
  attrs,
}: {
  app: InstantApp;
  db: InstantReactWebDatabase<any>;
  attrs: Record<string, DBAttr> | null;
}) {
  const consoleRef = useRef<HTMLDivElement>(null);

  const [selectedSandbox, setSelectedSandbox] = useState<string | null>(null);

  const [savedSandboxes, setSavedSandboxes] = useLocalStorage<SavedSandbox[]>(
    `sandboxes:${app.id}`,
    [],
  );

  const [sandboxCodeValue, setSandboxValue] = useSavedQueryState<string>(
    `code`,
    {
      ...base64Parser,
    },
    `sandboxCode:${app.id}`,
  );

  const [useAppPerms, setUseAppPerms] = useSavedQueryState<boolean>(
    'useAppPerms',
    parseAsBoolean.withDefault(true),
    `appPerms:${app.id}`,
    true,
  );

  const defaultIfNothingSaved = app?.rules
    ? JSON.stringify(app.rules, null, 2)
    : '';
  const [permsValue, setPermsValue] = useSavedQueryState<string>(
    'perms',
    {
      ...base64Parser,
    },
    `permsCode:${app.id}`,
    defaultIfNothingSaved,
  );

  // Make sure we copy the most up to date version of the sandbox
  // url updates are throttled
  const copyLink = () => {
    const serializers = {
      code: base64Parser,
      perms: base64Parser,
      useAppPerms: parseAsBoolean,
    };
    const serialize = createSerializer(serializers);

    const url = new URL(window.location.toString());
    const result = serialize(url, {
      code: sandboxCodeValue,
      perms: permsValue,
      useAppPerms: useAppPerms,
    });
    navigator.clipboard.writeText(result);
    infoToast('Copied permalink to code and permissions!');
  };

  const [runAsUserEmail, setRunAsUserEmail] = useLocalStorage(
    `runas:${app.id}`,
    '',
  );
  const [hasUnsavedWork, setHasUnsavedWork] = useState(false);
  const saveCurrentDialog = useDialog();
  const [newSaveName, setNewSaveName] = useState('');

  const [dangerouslyCommitTx, setDangerouslyCommitTx] = useState(false);
  const [appendResults, setAppendResults] = useState(false);
  const [collapseQuery, setHideQuery] = useState(false);
  const [collapseLog, setCollapseLog] = useState(false);
  const [collapseTransaction, setCollapseTransaction] = useState(false);
  const [defaultCollapsed, setDefaultCollapsed] = useState(false);
  const [output, setOutput] = useState<any[]>([]);
  const [showRunning, setShowRunning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isMonacoLoaded, setIsMonacoLoaded] = useState(false);
  const monacoRef = useRef<Monaco | null>(null);
  const monacoDisposables = useRef<Array<() => void>>([]);

  const { darkMode } = useDarkMode();

  // Add the schema types for the app's schema for better typesense
  useEffect(() => {
    const monaco = monacoRef.current;
    if (attrs && isMonacoLoaded && monaco) {
      for (const dispose of monacoDisposables.current) {
        dispose();
      }
      monacoDisposables.current = [];
      const schemaContent = schemaTs(attrs);
      monacoDisposables.current.push(
        monaco.languages.typescript.typescriptDefaults.addExtraLib(
          schemaContent,
          'file:///instant.schema.ts',
        ).dispose,
      );
      monacoDisposables.current.push(
        monaco.languages.typescript.typescriptDefaults.addExtraLib(
          tsTypesWithSchema,
          'file:///global.d.ts',
        ).dispose,
      );
    }
  }, [attrs, isMonacoLoaded]);

  /**
   * Saves the current sandbox as a new preset.
   * @throws Error if a preset with the same name already exists.
   */
  const saveCurrent = (name: string) => {
    if (savedSandboxes.find((sb) => sb.name === name)) {
      const existingPreset = savedSandboxes.find((sb) => sb.name === name);
      if (existingPreset) {
        setSavedSandboxes([
          ...savedSandboxes.filter((sb) => sb.name !== name),
          {
            name,
            code: sandboxCodeValue,
            perms: permsValue,
            lastSavedAt: new Date().toString(),
            runAsUser: runAsUserEmail,
            useAppPerms,
          },
        ]);
      }
    } else {
      setSavedSandboxes([
        ...savedSandboxes,
        {
          name,
          code: sandboxCodeValue,
          perms: permsValue,
          lastSavedAt: new Date().toString(),
          runAsUser: runAsUserEmail,
          useAppPerms,
        },
      ]);
    }
    setHasUnsavedWork(false);
  };

  const loadPreset = (name: string) => {
    setSelectedSandbox(name);
    const saved = savedSandboxes.find((sb) => sb.name === name);
    if (!saved) {
      return;
    }
    setHasUnsavedWork(false);
    setSandboxValue(saved.code);
    setPermsValue(saved.perms);
    setRunAsUserEmail(saved.runAsUser ?? undefined);
    setUseAppPerms(saved.useAppPerms);
  };

  const deleteSandbox = (name: string) => {
    setSavedSandboxes(savedSandboxes.filter((sb) => sb.name !== name));
    if (selectedSandbox === name) {
      setSelectedSandbox(null);
    }
  };

  // if loading code from base64 query param, check if it matches
  // a saved sandbox
  useEffect(() => {
    if (!sandboxCodeValue) return;

    const matchingSandbox = savedSandboxes.find(
      (sb) =>
        sb.code === sandboxCodeValue &&
        sb.perms === permsValue &&
        sb.runAsUser === runAsUserEmail &&
        sb.useAppPerms === useAppPerms,
    );

    if (matchingSandbox) {
      setSelectedSandbox(matchingSandbox.name);
      setHasUnsavedWork(false);
    } else {
      setSelectedSandbox(null);
    }
  }, []);

  const checkUnsavedWork = useCallback(
    debounce(() => {
      if (!selectedSandbox) {
        setHasUnsavedWork(false);
        return;
      }
      const saved = savedSandboxes.find((sb) => sb.name === selectedSandbox);
      if (!saved) {
        return;
      }

      if (JSON.stringify(sandboxCodeValue) !== JSON.stringify(saved.code)) {
        setHasUnsavedWork(true);
        return;
      }
      if (JSON.stringify(permsValue) !== JSON.stringify(saved.perms)) {
        setHasUnsavedWork(true);
        return;
      }
      if (runAsUserEmail !== saved.runAsUser) {
        setHasUnsavedWork(true);
        return;
      }
      if (useAppPerms !== saved.useAppPerms) {
        setHasUnsavedWork(true);
        return;
      }
      setHasUnsavedWork(false);
    }, 300),
    [
      selectedSandbox,
      savedSandboxes,
      sandboxCodeValue,
      permsValue,
      runAsUserEmail,
      useAppPerms,
    ],
  );

  useEffect(() => {
    checkUnsavedWork();
  }, [checkUnsavedWork]);

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

    return unsubAttrs;
  }, []);

  useEffect(() => {
    consoleRef.current?.scrollTo(0, consoleRef.current.scrollHeight);
  }, [output]);

  const prettify = async (editor: Parameters<OnMount>[0]) => {
    const code = editor.getValue();

    const { prettifyTypescript } = await import('@/lib/prettier');

    const position = editor.getPosition();
    const model = editor.getModel();
    const offset = position && model ? model.getOffsetAt(position) : 0;

    const { formatted, cursorOffset } = await prettifyTypescript({
      code,
      printWidth: Math.min(100, editor.getLayoutInfo().viewportColumn),
      cursorOffset: offset,
    });

    // Make sure we're not going to override their edits
    if (code !== editor.getValue()) return;
    editor.setValue(formatted);
    const newOffset = editor.getModel()?.getPositionAt(cursorOffset);
    if (newOffset) {
      editor.setPosition(newOffset);
    }
  };

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

  const PresetManager = () => {
    return (
      <div className="flex items-center gap-2">
        <Select
          contentClassName="bg-white"
          onChange={(val) => {
            if (val) {
              loadPreset(val.value);
            }
          }}
          className="min-w-[200px]"
          visibleValue={
            hasUnsavedWork ? selectedSandbox + '*' : selectedSandbox
          }
          value={selectedSandbox || undefined}
          emptyLabel={<div className="opacity-50">Saved Sandboxes...</div>}
          noOptionsLabel={
            <div className="p-2 text-sm opacity-60">No Saved Sandboxes</div>
          }
          options={savedSandboxes.map((sandbox) => ({
            label: sandbox.name,
            value: sandbox.name,
          }))}
        ></Select>
        {selectedSandbox && (
          <>
            <IconButton
              variant="subtle"
              className="text-red-400 dark:text-red-300"
              onClick={() => {
                deleteSandbox(selectedSandbox);
              }}
              label="Delete Sandbox"
              icon={<TrashIcon />}
            />

            <IconButton
              disabled={!hasUnsavedWork}
              onClick={() => {
                saveCurrent(selectedSandbox.trim());
              }}
              icon={<Save strokeWidth={1.5} width={18} />}
              label={`Save "${selectedSandbox}" with current sandbox`}
              variant="subtle"
            />
          </>
        )}
        <IconButton
          icon={<PlusIcon />}
          label="Save As..."
          onClick={() => {
            saveCurrentDialog.onOpen();
          }}
          variant="subtle"
        ></IconButton>
      </div>
    );
  };

  return (
    <>
      <Dialog {...saveCurrentDialog}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveCurrent(newSaveName.trim());
            saveCurrentDialog.onClose();
            setSelectedSandbox(newSaveName);
            setNewSaveName('');
          }}
        >
          <div className="pb-2">
            Enter a name to save the current sandbox as.
          </div>
          <TextInput
            autoFocus
            className="mt-0"
            label={<div className="pb-0 pt-2 font-[400]">Sandbox Name</div>}
            value={newSaveName}
            onChange={setNewSaveName}
          />
          <div className="flex justify-end pt-2">
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Dialog>
      <div className="flex w-full justify-between border-b bg-white p-2 px-3 dark:border-b-neutral-600 dark:bg-neutral-800">
        <PresetManager />
        <div className="flex items-center gap-8">
          <IconButton
            variant="subtle"
            label="Copy link to sandbox"
            onClick={() => {
              copyLink();
            }}
            icon={<ClipboardIcon width={18} />}
          />

          <Checkbox
            label={<div className="text-sm">Write to DB</div>}
            checked={dangerouslyCommitTx}
            onChange={setDangerouslyCommitTx}
          />
          <Button onClick={() => execRef.current()} disabled={showRunning}>
            {showRunning ? (
              <ArrowPathIcon className="animate-spin" width={18} />
            ) : (
              <PlayIcon width={18} />
            )}

            {showRunning ? 'Running...' : 'Run'}
          </Button>
        </div>
      </div>
      {dangerouslyCommitTx ? (
        <div className="border-b border-b-amber-100 bg-amber-50 px-2 py-1 text-xs text-amber-600 dark:border-b-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          <strong>Use caution!</strong> Successful transactions will update your
          app's DB!
        </div>
      ) : (
        <div className="border-b border-b-sky-200 bg-sky-50 px-2 py-1 text-xs text-sky-600 dark:border-b-neutral-600 dark:bg-sky-900/80 dark:text-sky-400/90">
          <strong>Debug mode.</strong> Transactions will not update your app's
          DB.
        </div>
      )}
      <ResizablePanelGroup
        direction="horizontal"
        className="flex h-full flex-1 overflow-y-hidden"
      >
        <ResizablePanel className="flex min-w-[24em] flex-1 flex-col border-r dark:border-r-neutral-600">
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel
              minSize={20}
              className="flex flex-1 flex-col border-b dark:border-b-neutral-600"
            >
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
                  onMount={async (editor, monaco) => {
                    editor.addCommand(
                      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                      () => execRef.current(),
                    );

                    editor.addCommand(
                      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                      () => {},
                    );

                    editor.addCommand(
                      monaco.KeyMod.Alt |
                        monaco.KeyMod.Shift |
                        monaco.KeyCode.KeyF,
                      () => prettify(editor),
                    );

                    // Set a base global.ts while we're loading types
                    monaco.languages.typescript.typescriptDefaults.addExtraLib(
                      baseTsTypes,
                      'file:///global.d.ts',
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

                    // Load better types
                    await addInstantLibs(monaco);

                    monacoRef.current = monaco;
                    setIsMonacoLoaded(true);
                  }}
                />
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel
              minSize={10}
              className="flex flex-col border-b dark:border-b-neutral-700"
            >
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
                  email={runAsUserEmail || ''}
                  setEmail={setRunAsUserEmail}
                  onEnter={execRef.current}
                />
              </div>

              <div className="flex flex-1 flex-col">
                <div className="flex items-center gap-2 border-b bg-gray-50 px-2 py-1 text-xs dark:border-b-neutral-700 dark:bg-neutral-800">
                  Permissions
                  <div>
                    <Checkbox
                      label="Use saved app rules"
                      checked={useAppPerms}
                      onChange={(val) => setUseAppPerms(val)}
                    />
                  </div>
                </div>
                {useAppPerms ? null : (
                  <div className="border-b border-b-amber-100 bg-amber-50 px-2 py-1 text-xs text-amber-600 dark:border-b-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                    <strong>Use caution!</strong> Transactions above will be
                    evaluated with these rules.
                  </div>
                )}
                <div className="flex flex-1 overflow-hidden bg-white dark:bg-neutral-800">
                  <div
                    className={clsx('flex-1', useAppPerms ? 'opacity-50' : '')}
                  >
                    {useAppPerms ? (
                      <Editor
                        theme={darkMode ? 'vs-dark' : 'light'}
                        key="app"
                        path="app-permissions.json"
                        value={
                          app.rules ? JSON.stringify(app.rules, null, 2) : ''
                        }
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
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle></ResizableHandle>
        <ResizablePanel className="flex min-w-[24em] flex-1 flex-col overflow-hidden">
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
                  key={i}
                  className={clsx(
                    'rounded border bg-gray-50 shadow-sm transition-all hover:shadow dark:bg-neutral-800',
                    {
                      'border-sky-200 dark:border-sky-600/50': o.type === 'log',
                      'border-red-200 dark:border-red-600/50':
                        o.type === 'error',
                      'border-teal-200 dark:border-teal-600/50':
                        o.type === 'query',
                      'border-purple-200 dark:border-purple-600/50':
                        o.type === 'transaction',
                    },
                  )}
                >
                  <div
                    className={clsx(
                      'px-2 pt-1 text-center font-mono font-bold',
                      {
                        'text-sky-600 dark:text-sky-400': o.type === 'log',
                        'text-red-600 dark:text-red-400': o.type === 'error',
                        'text-teal-600 dark:text-teal-400': o.type === 'query',
                        'text-purple-600 dark:text-purple-400':
                          o.type === 'transaction',
                      },
                    )}
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
                                'border-rose-200 dark:border-rose-600':
                                  !Boolean(cr.check),
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
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
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

const baseTsTypes = /* ts */ `
type InstantDB = {
  transact: (steps) => Promise<number>;
  query: (iql, opts?: { ruleParams?: Record<string, any> }) => Promise<any>;
  tx: InstantTx;
};

type InstantTx = {
  [namespace: string]: {
    [id: string]: {
      create: (v: Record<string, any>) => any;
      update: (
        v: Record<string, any>,
        opts?: { upsert?: boolean | undefined },
      ) => any;
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

// Generates the `instant.schema.ts` file from the attrs
const schemaTs = (attrs: Record<string, DBAttr>) => {
  const schema = apiSchemaToInstantSchemaDef(
    attrsToSchema(Object.values(attrs)),
  );

  return generateSchemaTypescriptFile(schema, schema, '@instantdb/admin');
};

const tsTypesWithSchema = /* ts */ `
import {
  ValidQuery,
  InstaQLResponse,
  TransactionChunk,
  TxChunk,
} from '@instantdb/core';
import schema, { type AppSchema } from './instant.schema';

type InstantTx = TxChunk<AppSchema>;

type InstantDB = {
  query<Q extends ValidQuery<Q, AppSchema>>(
    query: Q,
    opts?: { ruleParams?: Record<string, any> },
  ): Promise<InstaQLResponse<AppSchema, Q, false>>;
  transact: (
    inputChunks: TransactionChunk<any, any> | TransactionChunk<any, any>[],
  ) => Promise<number>;
  tx: InstantTx;
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
