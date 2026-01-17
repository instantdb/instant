import { PageInfoResponse } from './queryTypes.ts';
import { AttrsStore, AttrsStoreJson, Store, StoreJson } from './store.ts';

export type QuerySubResult = {
  store: Store;
  attrsStore: AttrsStore;
  pageInfo?: PageInfoResponse<any> | null | undefined;
  aggregate?: any;
  processedTxId?: number;
  isExternal?: boolean;
};

export type QuerySub = {
  q: Object;
  eventId?: string;
  lastAccessed?: number | null | undefined;
  result?: QuerySubResult;
};

export type QuerySubResultInStorage = {
  store: StoreJson;
  attrsStore: AttrsStoreJson;
  pageInfo?: PageInfoResponse<any> | null | undefined;
  aggregate?: any;
  processedTxId?: number;
};

export type QuerySubInStorage = {
  q: Object;
  eventId?: string;
  lastAccessed?: number | null | undefined;
  result?: QuerySubResultInStorage;
};
