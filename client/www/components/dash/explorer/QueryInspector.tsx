import JsonParser from 'json5';
import { useEffect, useMemo, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { StarIcon, TrashIcon } from '@heroicons/react/24/outline';
import { ArrowRightIcon } from '@heroicons/react/24/solid';

import { Button, CodeEditor, cn } from '@/components/ui';
import { errorToast } from '@/lib/toast';
import { init, InstantReactWebDatabase } from '@instantdb/react';
import { DBAttr, SchemaNamespace } from '@/lib/types';
import { attrsToSchema } from '@/lib/schema';
import { apiSchemaToInstantSchemaDef } from '@instantdb/platform';
import { useDarkMode } from '../DarkModeToggle';

const SAVED_QUERIES_CACHE_KEY = '__instant:explorer-saved-queries';
const QUERY_HISTORY_CACHE_KEY = '__instant:explorer-query-history';

type CachedQueryItem = {
  ts: number;
  query: string;
};

class QueryInspectorCache {
  savedQueriesCacheKey: string;
  queryHistoryCacheKey: string;

  constructor(appId: string) {
    this.savedQueriesCacheKey = `${SAVED_QUERIES_CACHE_KEY}:${appId}`;
    this.queryHistoryCacheKey = `${QUERY_HISTORY_CACHE_KEY}:${appId}`;
  }

  get(key: string) {
    try {
      const raw = localStorage.getItem(key);

      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  set(key: string, value: any) {
    localStorage.setItem(key, JSON.stringify(value));

    return value;
  }
  getQueryHistory() {
    return this.get(this.queryHistoryCacheKey) || [];
  }
  setQueryHistory(history: CachedQueryItem[]) {
    return this.set(this.queryHistoryCacheKey, history);
  }
  getSavedQueries() {
    return this.get(this.savedQueriesCacheKey) || [];
  }
  setSavedQueries(queries: CachedQueryItem[]) {
    return this.set(this.savedQueriesCacheKey, queries);
  }
}

function dbForAttrs(
  baseDb: InstantReactWebDatabase<any>,
  attrs: Record<string, DBAttr> | null,
): InstantReactWebDatabase<any> {
  if (!attrs) {
    return baseDb;
  }
  const schema = apiSchemaToInstantSchemaDef(
    attrsToSchema(Object.values(attrs)),
  );
  return init({
    ...baseDb.core._reactor.config,
    disableValidation: true,
    schema,
  });
}

export function QueryInspector({
  className,
  appId,
  db: baseDb,
  namespaces,
  attrs,
}: {
  className?: string;
  appId: string;
  db: InstantReactWebDatabase<any>;
  namespaces: SchemaNamespace[] | null;
  attrs: Record<string, DBAttr> | null;
}) {
  const db = useMemo(() => dbForAttrs(baseDb, attrs), [baseDb, attrs]);
  const cache = new QueryInspectorCache(appId);
  const [query, setQuery] = useState<Record<string, any>>({});
  const [draft, setQueryDraft] = useState('{}');
  const [history, setQueryHistory] = useState<CachedQueryItem[]>([]);
  const [saved, setSavedQueries] = useState<CachedQueryItem[]>([]);

  const { data, isLoading, error } = (
    db as InstantReactWebDatabase<any>
  ).useQuery(query);

  const { darkMode } = useDarkMode();

  useEffect(() => {
    const saved = cache.getSavedQueries();
    const history = cache.getQueryHistory();
    const previousQueryItem = history[0] || saved[0];

    if (previousQueryItem) {
      const { query: stringified } = previousQueryItem;

      setQuery(JSON.parse(stringified));
      setQueryDraft(stringified);
    } else {
      setQuery({});
      setQueryDraft('{}');
    }

    setSavedQueries(saved);
    setQueryHistory(history);
  }, [appId]);

  useEffect(() => {
    if (!namespaces) {
      return;
    }

    const isQueryEmpty = Object.keys(query).length === 0;

    if (isQueryEmpty && namespaces.length > 0) {
      const [first] = namespaces;
      const defaultQuery = {
        [first.name]: { $: { limit: 5 } },
      };

      setQuery(defaultQuery);
      setQueryDraft(JSON.stringify(defaultQuery, null, 2));
    }
  }, [namespaces]);

  const handleClearQuery = () => {
    setQuery({});
    setQueryDraft('{}');
  };

  const run = (val: string) => {
    try {
      const parsed = JsonParser.parse(val);
      const stringified = JSON.stringify(parsed, null, 2);
      setQuery(parsed);
      setQueryDraft(stringified);
      setQueryHistory((prev) => {
        const [latest] = prev;

        if (latest && latest.query === stringified) {
          return prev;
        }

        const item = { ts: Date.now(), query: stringified };
        const history = [item, ...prev];
        cache.setQueryHistory(history);

        return history;
      });
    } catch (e) {
      errorToast('Unable to run query: Invalid JSON');
    }
  };

  const handleRunQuery = () => run(draft);

  const handleSaveQuery = () => {
    try {
      const parsed = JsonParser.parse(draft);
      const stringified = JSON.stringify(parsed, null, 2);
      setSavedQueries((prev) => {
        const item = { ts: Date.now(), query: stringified };
        // If query was already saved, move it to the top
        if (prev.some((i) => i.query === stringified)) {
          const saved = [item, ...prev.filter((i) => i.query !== stringified)];
          cache.setSavedQueries(saved);
          return saved;
        } else {
          const saved = [item, ...prev];
          cache.setSavedQueries(saved);
          return saved;
        }
      });
    } catch (e) {
      errorToast('Unable to save query: Invalid JSON');
    }
  };

  const handleRemoveFromSaved = (ts: number) => {
    setSavedQueries((prev) => {
      const saved = prev.filter((i) => i.ts !== ts);
      cache.setSavedQueries(saved);

      return saved;
    });
  };

  const handleRemoveFromHistory = (ts: number) => {
    setQueryHistory((prev) => {
      const history = prev.filter((i) => i.ts !== ts);
      cache.setQueryHistory(history);

      return history;
    });
  };

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 bg-[#fbfaf8] text-gray-950 dark:bg-neutral-950 dark:text-white',
        className,
      )}
    >
      <div className="flex w-full max-w-[520px] shrink-0 flex-col gap-4 border-r border-gray-200 p-4 dark:border-neutral-800">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-4 py-3 dark:border-neutral-800">
            <div>
              <h2 className="text-sm font-semibold">InstaQL query</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">
                Write JSON, then run it against the active app.
              </p>
            </div>
            <Button
              className="group"
              variant="secondary"
              size="mini"
              onClick={handleSaveQuery}
            >
              <StarIcon className="h-4 w-4 transition-colors group-hover:text-amber-500" />
              Save
            </Button>
          </div>

          <div className="relative h-72 overflow-hidden border-b border-gray-200 dark:border-neutral-800">
            <CodeEditor
              darkMode={darkMode}
              language="json"
              value={draft}
              onChange={(code) => setQueryDraft(code)}
              onMount={(editor, monaco) => {
                editor.addCommand(
                  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                  () => run(editor.getValue()),
                );
                editor.addCommand(
                  monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                  () => run(editor.getValue()),
                );
              }}
            />
          </div>
          <div className="flex items-center justify-end gap-2 px-4 py-3">
            <Button variant="secondary" size="mini" onClick={handleClearQuery}>
              Clear
            </Button>
            <Button variant="primary" size="mini" onClick={handleRunQuery}>
              Run
            </Button>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Saved queries</h2>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-sm">
            {saved.length > 0 ? (
              saved.map((item) => {
                return (
                  <div
                    key={item.ts}
                    className="group flex items-center justify-between gap-2 rounded-md border border-transparent px-2 py-2 text-gray-700 transition-colors hover:border-gray-200 hover:bg-[#fbfaf8] dark:text-neutral-200 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    <Tooltip.Provider>
                      <Tooltip.Root delayDuration={200}>
                        <Tooltip.Trigger asChild>
                          <div className="truncate font-mono text-xs">
                            {item.query}
                          </div>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content
                            className="animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 overflow-hidden rounded-md border bg-white px-3 py-1 text-sm text-gray-900 shadow-md dark:border-neutral-800"
                            side="top"
                            align="start"
                            sideOffset={8}
                          >
                            <pre>
                              <code className="text-xs">{item.query}</code>
                            </pre>
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    </Tooltip.Provider>
                    <div className="flex items-center gap-1">
                      <Button
                        className="px-1 opacity-50 transition-opacity group-hover:opacity-100"
                        variant="destructive"
                        size="mini"
                        onClick={() => handleRemoveFromSaved(item.ts)}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        className="px-1 opacity-50 transition-opacity group-hover:opacity-100"
                        variant="primary"
                        size="mini"
                        onClick={() => run(item.query)}
                      >
                        <ArrowRightIcon className="h-4 w-4 -rotate-45" />
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-2 py-2 text-gray-400">Nothing here yet.</div>
            )}
          </div>

          <div className="border-t border-gray-200 px-4 py-3 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Query history</h2>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-sm">
            {history.length > 0 ? (
              history.slice(0, 20).map((item) => {
                return (
                  <div
                    key={item.ts}
                    className="group flex items-center justify-between gap-2 rounded-md border border-transparent px-2 py-2 text-gray-700 transition-colors hover:border-gray-200 hover:bg-[#fbfaf8] dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    <Tooltip.Provider>
                      <Tooltip.Root delayDuration={200}>
                        <Tooltip.Trigger asChild>
                          <div className="truncate font-mono text-xs">
                            {item.query}
                          </div>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content
                            className="animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 overflow-hidden rounded-md border bg-white px-3 py-1 text-sm text-gray-900 shadow-md"
                            side="top"
                            align="start"
                            sideOffset={8}
                          >
                            <pre>
                              <code className="text-xs">{item.query}</code>
                            </pre>
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    </Tooltip.Provider>
                    <div className="flex items-center gap-1">
                      <Button
                        className="px-1 opacity-50 transition-opacity group-hover:opacity-100"
                        variant="destructive"
                        size="mini"
                        onClick={() => handleRemoveFromHistory(item.ts)}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        className="px-1 opacity-50 transition-opacity group-hover:opacity-100"
                        variant="primary"
                        size="mini"
                        onClick={() => run(item.query)}
                      >
                        <ArrowRightIcon className="h-4 w-4 -rotate-45" />
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-2 py-2 text-gray-400">Nothing here yet.</div>
            )}
          </div>
        </section>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Query results</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <CodeEditor
              darkMode={darkMode}
              loading={isLoading}
              language={'json'}
              value={JSON.stringify(data || error || {}, null, 2)}
              onChange={() => {}}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
