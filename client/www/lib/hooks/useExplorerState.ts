import { Explorer, ExplorerNav } from '@instantdb/components';
import { useCallback, useMemo } from 'react';
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsJson,
  parseAsString,
  useQueryStates,
} from 'nuqs';

type ExplorerState = [
  Parameters<typeof Explorer>[0]['explorerState'],
  Parameters<typeof Explorer>[0]['setExplorerState'],
];

type SearchFilterOp = '=' | '$ilike' | '$like' | '$gt' | '$lt' | '$isNull';
type SearchFilter = [string, SearchFilterOp, any];

const parseAsWhere = parseAsJson<[string, any]>((v) =>
  Array.isArray(v) && v.length === 2 ? (v as [string, any]) : null,
);

const parseAsFilters = parseAsJson<SearchFilter[]>((v) =>
  Array.isArray(v) ? (v as SearchFilter[]) : null,
);

const explorerParsers = {
  ns: parseAsString, // namespace
  where: parseAsWhere,
  sortAttr: parseAsString,
  sortAsc: parseAsBoolean,
  filters: parseAsFilters,
  limit: parseAsInteger,
  page: parseAsInteger,
};

const explorerParserOptions = {
  // Use shallow routing to avoid full page re-renders
  shallow: true,
};

export const useExplorerState = (): ExplorerState => {
  const [state, setState] = useQueryStates(
    explorerParsers,
    explorerParserOptions,
  );

  const explorerState: ExplorerNav | null = useMemo(() => {
    if (!state.ns) return null;
    return {
      namespace: state.ns,
      ...(state.where && { where: state.where }),
      ...(state.sortAttr && { sortAttr: state.sortAttr }),
      ...(state.sortAsc !== null && { sortAsc: state.sortAsc }),
      ...(state.filters && { filters: state.filters }),
      ...(state.limit !== null && { limit: state.limit }),
      ...(state.page !== null && { page: state.page }),
    };
  }, [state]);

  const setExplorerState = useCallback(
    (action: React.SetStateAction<ExplorerNav | null>) => {
      setState(
        (prev) => {
          const prevNav: ExplorerNav | null = prev.ns
            ? {
                namespace: prev.ns,
                ...(prev.where && { where: prev.where }),
                ...(prev.sortAttr && { sortAttr: prev.sortAttr }),
                ...(prev.sortAsc !== null && { sortAsc: prev.sortAsc }),
                ...(prev.filters && { filters: prev.filters }),
                ...(prev.limit !== null && { limit: prev.limit }),
                ...(prev.page !== null && { page: prev.page }),
              }
            : null;

          const next = typeof action === 'function' ? action(prevNav) : action;

          if (!next) {
            return {
              ns: null,
              where: null,
              sortAttr: null,
              sortAsc: null,
              filters: null,
              limit: null,
              page: null,
            };
          }

          return {
            ns: next.namespace,
            where: next.where ?? null,
            sortAttr: next.sortAttr ?? null,
            sortAsc: next.sortAsc ?? null,
            filters: next.filters ?? null,
            limit: next.limit ?? null,
            page: next.page ?? null,
          };
        },
        { history: 'push' },
      );
    },
    [setState],
  );

  return [explorerState, setExplorerState];
};
