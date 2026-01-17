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

// HOOKS
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
