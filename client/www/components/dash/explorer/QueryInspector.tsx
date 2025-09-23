import JsonParser from 'json5';
import { useEffect, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { StarIcon, TrashIcon } from '@heroicons/react/24/outline';
import { ArrowRightIcon } from '@heroicons/react/24/solid';

import { Button, CodeEditor, cn } from '@/components/ui';
import { errorToast, infoToast } from '@/lib/toast';
import { InstantReactWebDatabase } from '@instantdb/react';
import { SchemaNamespace } from '@/lib/types';

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

export function QueryInspector({
  className,
  appId,
  db,
  namespaces,
}: {
  className?: string;
  appId: string;
  db: InstantReactWebDatabase<any>;
  namespaces: SchemaNamespace[] | null;
}) {
  const cache = new QueryInspectorCache(appId);
  const [query, setQuery] = useState<Record<string, any>>({});
  const [draft, setQueryDraft] = useState('{}');
  const [history, setQueryHistory] = useState<CachedQueryItem[]>([]);
  const [saved, setSavedQueries] = useState<CachedQueryItem[]>([]);
  const { data, isLoading, error } = db.useQuery(query);

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
    <div className={cn('flex flex-1', className)}>
      <div className="flex max-w-lg flex-1 flex-col dark:bg-neutral-800">
        <h2 className="mb-1 mt-4 px-3 text-sm font-semibold">InstaQL query</h2>

        <div className="relative h-64 overflow-hidden rounded border-y dark:border-y-neutral-800">
          <CodeEditor
            language="json"
            value={draft}
            onChange={(code) => setQueryDraft(code)}
            onMount={(editor, monaco) => {
              // cmd+S/cmd+Enter bindings to run query
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
          <div className="absolute bottom-0 flex w-full items-center justify-between gap-4 px-3 py-2">
            <Button
              className="group"
              variant="secondary"
              size="mini"
              onClick={handleSaveQuery}
            >
              <StarIcon className="mr-0.5 h-4 w-4 transition-colors group-hover:text-amber-500" />
              Save
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="mini"
                onClick={handleClearQuery}
              >
                Clear
              </Button>
              <Button variant="primary" size="mini" onClick={handleRunQuery}>
                Run
              </Button>
            </div>
          </div>
        </div>

        <div className="">
          <h2 className="mb-1 mt-4 px-3 text-sm font-semibold">
            Saved queries
          </h2>

          <div className="px-3 text-sm">
            {saved.length > 0 ? (
              saved.map((item) => {
                return (
                  <div
                    key={item.ts}
                    className="group mb-1 flex items-center justify-between gap-2 text-gray-700 dark:text-neutral-200"
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
                            className="z-50 overflow-hidden rounded-md border bg-white px-3 py-1 text-sm text-gray-900 shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:border-neutral-800"
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
                        className="px-1 opacity-0 transition-opacity group-hover:opacity-100"
                        variant="destructive"
                        size="mini"
                        onClick={() => handleRemoveFromSaved(item.ts)}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        className="px-1 opacity-0 transition-opacity group-hover:opacity-100"
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
              <div className="py-1 text-gray-400">Nothing here yet!</div>
            )}
          </div>
        </div>

        <div className="mt-4 border-t py-4 dark:border-t-neutral-700">
          <h2 className="mb-1 px-3 text-sm font-semibold">Query history</h2>

          <div className="px-3 text-sm">
            {history.length > 0 ? (
              history.slice(0, 20).map((item) => {
                return (
                  <div
                    key={item.ts}
                    className="group mb-1 flex items-center justify-between gap-2 text-gray-700 dark:text-neutral-300"
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
                            className="z-50 overflow-hidden rounded-md border bg-white px-3 py-1 text-sm text-gray-900 shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
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
                        className="px-1 opacity-0 transition-opacity group-hover:opacity-100"
                        variant="destructive"
                        size="mini"
                        onClick={() => handleRemoveFromHistory(item.ts)}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                      <Button
                        className="px-1 opacity-0 transition-opacity group-hover:opacity-100"
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
              <div className="py-1 text-gray-400">Nothing here yet!</div>
            )}
          </div>
        </div>
      </div>
      <div className="flex max-h-full flex-1 flex-col overflow-scroll border-l dark:border-l-neutral-700 dark:bg-neutral-800">
        <h2 className="mb-1 mt-4 px-3 text-sm font-semibold">Query results</h2>
        <div className="flex-1 overflow-hidden rounded border-y dark:border-y-neutral-700">
          <CodeEditor
            loading={isLoading}
            language={'json'}
            value={JSON.stringify(data || error || {}, null, 2)}
            onChange={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
