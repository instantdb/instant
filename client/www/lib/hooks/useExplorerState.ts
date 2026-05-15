import { Explorer, ExplorerDialog, ExplorerNav } from '@instantdb/components';
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
  dialog: parseAsString,
  dialogRowId: parseAsString,
};

const explorerParserOptions = {
  // Use shallow routing to avoid full page re-renders
  shallow: true,
};

const VALID_DIALOG_TYPES = [
  'add-row',
  'edit-row',
  'edit-schema',
  'new-namespace',
  'recently-deleted-ns',
] as const;

function parseDialog(
  dialogType: string | null,
  rowId: string | null,
): ExplorerDialog | null {
  if (!dialogType) return null;
  if (!(VALID_DIALOG_TYPES as readonly string[]).includes(dialogType))
    return null;
  if (dialogType === 'edit-row') {
    if (!rowId) return null;
    return { type: 'edit-row', rowId };
  }
  return { type: dialogType } as ExplorerDialog;
}

export const useExplorerState = (): ExplorerState => {
  const [state, setState] = useQueryStates(
    explorerParsers,
    explorerParserOptions,
  );

  const explorerState: ExplorerNav | null = useMemo(() => {
    const dialog = parseDialog(state.dialog, state.dialogRowId);
    if (!state.ns && !dialog) return null;
    return {
      namespace: state.ns ?? '',
      ...(state.where && { where: state.where }),
      ...(state.sortAttr && { sortAttr: state.sortAttr }),
      ...(state.sortAsc !== null && { sortAsc: state.sortAsc }),
      ...(state.filters && { filters: state.filters }),
      ...(state.limit !== null && { limit: state.limit }),
      ...(state.page !== null && { page: state.page }),
      ...(dialog && { dialog }),
    };
  }, [state]);

  const setExplorerState = useCallback(
    (action: React.SetStateAction<ExplorerNav | null>) => {
      setState(
        (prev) => {
          const prevDialog = parseDialog(prev.dialog, prev.dialogRowId);
          const prevNav: ExplorerNav | null =
            prev.ns || prevDialog
              ? {
                  namespace: prev.ns ?? '',
                  ...(prev.where && { where: prev.where }),
                  ...(prev.sortAttr && { sortAttr: prev.sortAttr }),
                  ...(prev.sortAsc !== null && { sortAsc: prev.sortAsc }),
                  ...(prev.filters && { filters: prev.filters }),
                  ...(prev.limit !== null && { limit: prev.limit }),
                  ...(prev.page !== null && { page: prev.page }),
                  ...(prevDialog && { dialog: prevDialog }),
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
              dialogRowId: null,
            };
          }

          return {
            ns: next.namespace ? next.namespace : null,
            where: next.where ?? null,
            sortAttr: next.sortAttr ?? null,
            sortAsc: next.sortAsc ?? null,
            filters: next.filters ?? null,
            limit: next.limit ?? null,
            page: next.page ?? null,
            dialog: next.dialog?.type ?? null,
            dialogRowId:
              next.dialog?.type === 'edit-row' ? next.dialog.rowId : null,
          };
        },
        { history: 'push' },
      );
    },
    [setState],
  );

  return [explorerState, setExplorerState];
};
