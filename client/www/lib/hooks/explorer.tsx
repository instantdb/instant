import { InstantReactWebDatabase } from '@instantdb/react';
import { useEffect, useState } from 'react';
import { DBAttr, SchemaNamespace } from '@/lib/types';
import { dbAttrsToExplorerSchema } from '@/lib/schema';

export type SearchFilterOp =
  | '='
  | '$ilike'
  | '$like'
  | '$gt'
  | '$lt'
  | '$isNull';
export type SearchFilter = [string, SearchFilterOp, any];

function makeWhere(
  navWhere: null | undefined | [string, any],
  searchFilters: null | undefined | SearchFilter[],
) {
  const where: { [key: string]: any } = {};
  if (navWhere) {
    where[navWhere[0]] = navWhere[1];
  }
  if (searchFilters?.length) {
    where.or = searchFilters.map(([attr, op, val]) => {
      switch (op) {
        case '=':
          return { [attr]: val };
        case '$isNull':
          return { [attr]: { [op]: true } };
        default:
          return { [attr]: { [op]: val } };
      }
    });
  }
  return where;
}

// HOOKS
export function useNamespacesQuery(
  db: InstantReactWebDatabase<any>,
  selectedNs?: SchemaNamespace,
  navWhere?: [string, any],
  searchFilters?: SearchFilter[],
  limit?: number,
  offset?: number,
  sortAttr?: string,
  sortAsc?: boolean,
) {
  const direction: 'asc' | 'desc' = sortAsc ? 'asc' : 'desc';

  const where = makeWhere(navWhere, searchFilters);

  const iql = selectedNs
    ? {
        [selectedNs.name]: {
          ...Object.fromEntries(
            selectedNs.attrs
              .filter((a) => a.type === 'ref')
              .map((a) => [a.name, { $: { fields: ['id'] } }]),
          ),
          $: {
            ...(where ? { where: where } : {}),
            ...(limit ? { limit } : {}),
            ...(offset ? { offset } : {}),
            ...(sortAttr ? { order: { [sortAttr]: direction } } : {}),
          },
        },
      }
    : {};

  const itemsRes = db.useQuery(iql);

  const allRes = db.useQuery(
    selectedNs
      ? {
          [selectedNs.name]: {
            $: {
              aggregate: 'count',
              ...(where ? { where: where } : {}),
            },
          },
        }
      : {},
  );

  // @ts-expect-error: admin-only feature
  const allCount = allRes.aggregate?.[selectedNs?.name ?? '']?.count ?? null;

  return {
    itemsRes,
    allCount,
  };
}
export function useSchemaQuery(db: InstantReactWebDatabase<any>) {
  const [state, setState] = useState<
    | {
        namespaces: SchemaNamespace[];
        attrs: Record<string, DBAttr>;
      }
    | { namespaces: null; attrs: null }
  >({ namespaces: null, attrs: null });

  // (XXX)
  // This is a hack so we can listen to all attr changes
  //
  // Context:
  // The backend only sends attr changes to relevant queries.
  // The ___explorer__ is a dummy query, which refreshes when _anything_
  // happens.
  //
  // In the future, we may want a special `attr-changed` event.
  db.useQuery({ ____explorer___: {} });

  useEffect(() => {
    function onAttrs(_oAttrs: Record<string, DBAttr>) {
      setState({
        attrs: _oAttrs,
        namespaces: dbAttrsToExplorerSchema(_oAttrs),
      });
    }
    return db._core._reactor.subscribeAttrs(onAttrs);
  }, [db]);

  return state;
}
