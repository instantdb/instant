import {
  EditSchemaScreen,
  Explorer,
  ExplorerDialog,
  ExplorerNav,
} from '@instantdb/components';
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
  NonNullable<Parameters<typeof Explorer>[0]['setExplorerState']>,
];

type SearchFilterOp = '=' | '$ilike' | '$like' | '$gt' | '$lt' | '$isNull';
type SearchFilter = [string, SearchFilterOp, any];

const parseAsWhere = parseAsJson<[string, any]>((v) =>
  Array.isArray(v) && v.length === 2 ? (v as [string, any]) : null,
);

const parseAsFilters = parseAsJson<SearchFilter[]>((v) =>
  Array.isArray(v) ? (v as SearchFilter[]) : null,
);

function validateEditSchemaScreen(v: unknown): EditSchemaScreen | null {
  if (!v || typeof v !== 'object') return null;
  const obj = v as Record<string, unknown>;
  switch (obj.kind) {
    case 'main':
      return { kind: 'main' };
    case 'rename':
      return { kind: 'rename' };
    case 'add-attr':
      if (obj.attrKind !== 'data' && obj.attrKind !== 'link') return null;
      return { kind: 'add-attr', attrKind: obj.attrKind };
    case 'edit-attr':
      if (typeof obj.attrId !== 'string') return null;
      if (typeof obj.isForward !== 'boolean') return null;
      return {
        kind: 'edit-attr',
        attrId: obj.attrId,
        isForward: obj.isForward,
      };
    default:
      return null;
  }
}

function validateExplorerDialog(v: unknown): ExplorerDialog | null {
  if (!v || typeof v !== 'object') return null;
  const obj = v as Record<string, unknown>;
  switch (obj.type) {
    case 'add-row':
      return { type: 'add-row' };
    case 'new-namespace':
      return { type: 'new-namespace' };
    case 'recently-deleted-ns':
      return { type: 'recently-deleted-ns' };
    case 'edit-row':
      if (typeof obj.rowId !== 'string') return null;
      return { type: 'edit-row', rowId: obj.rowId };
    case 'edit-schema': {
      const screen = validateEditSchemaScreen(obj.screen);
      if (!screen) return null;
      return { type: 'edit-schema', screen };
    }
    default:
      return null;
  }
}

const parseAsExplorerDialog = parseAsJson<ExplorerDialog>(
  validateExplorerDialog,
);

const explorerParsers = {
  ns: parseAsString, // namespace
  where: parseAsWhere,
  sortAttr: parseAsString,
  sortAsc: parseAsBoolean,
  filters: parseAsFilters,
  limit: parseAsInteger,
  page: parseAsInteger,
  dialog: parseAsExplorerDialog,
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
      ...(state.dialog && { dialog: state.dialog }),
    };
  }, [state]);

  const setExplorerState = useCallback(
    (
      action: React.SetStateAction<ExplorerNav | null>,
      options?: { history?: 'push' | 'replace' },
    ) => {
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
                ...(prev.dialog && { dialog: prev.dialog }),
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
              dialog: null,
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
            dialog: next.dialog ?? null,
          };
        },
        { history: options?.history ?? 'push' },
      );
    },
    [setState],
  );

  return [explorerState, setExplorerState];
};
