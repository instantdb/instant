import { InstantCoreDatabase } from './index.ts';
import {
  ValidQuery,
  InstaQLResponse,
  InstaQLOptions,
  Cursor,
  ValidQueryObject,
} from './queryTypes.ts';
import { InstantSchemaDef } from './schemaTypes.ts';

export type ChunkStatus = 'bootstrapping' | 'frozen';
interface Chunk {
  status: ChunkStatus;
  data: any[];
  hasMore?: boolean;
  endCursor?: Cursor;
}

const getSubquery = <Q extends ValidQuery<Q, any>>(
  query: Q,
): ValidQueryObject<any, any, any, true> => {
  const entity = Object.keys(query)[0];
  if (!entity) {
    throw new Error('No entity specified in query');
  }
  if (!query[entity]) {
    throw new Error('No query specified for entity');
  }
  return query[entity] as ValidQueryObject<any, any, any, true>;
};

export const subscribeInfiniteQuery = <
  Schema extends InstantSchemaDef<any, any, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDatesLocal extends boolean,
>(
  db: InstantCoreDatabase<Schema, UseDatesLocal>,
  query: Q,
  cb: (resp: InstaQLResponse<Schema, Q, UseDatesLocal>) => void,
  opts?: InstaQLOptions,
): (() => void) => {
  const subquery = getSubquery(query);
  const forwardChunks = new Map<string, Chunk>();
  const reverseChunks = new Map<string, Chunk>();
  let hasKickstarted = false;

  const starterSub = db.subscribeQuery(query, (starterData) => {
    if (starterData.data) {
      cb(starterData.data);
    }
  });

  return () => {
    starterSub();
  };
};
