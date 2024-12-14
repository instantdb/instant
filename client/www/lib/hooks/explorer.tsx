import { InstantReactWebDatabase } from '@instantdb/react';
import { useEffect, useState } from 'react';
import { DBAttr, SchemaNamespace } from '@/lib/types';
import { dbAttrsToExplorerSchema } from '@/lib/schema';

// HOOKS
export function useNamespacesQuery(
  db: InstantReactWebDatabase<any>,
  selectedNs?: SchemaNamespace,
  where?: [string, any],
  limit?: number,
  offset?: number,
) {
  const iql = selectedNs
    ? {
        [selectedNs.name]: {
          ...Object.fromEntries(
            selectedNs.attrs
              .filter((a) => a.type === 'ref')
              .map((a) => [a.name, {}]),
          ),
          $: {
            ...(where ? { where: { [where[0]]: where[1] } } : {}),
            ...(limit ? { limit } : {}),
            ...(offset ? { offset } : {}),
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
              ...(where ? { where: { [where[0]]: where[1] } } : {}),
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
  const [namespaces, setNamespaces] = useState<SchemaNamespace[] | null>(null);
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
      setNamespaces(dbAttrsToExplorerSchema(_oAttrs));
    }
    return db._core._reactor.subscribeAttrs(onAttrs);
  }, [db]);

  return { namespaces };
}
