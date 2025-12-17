import {
  coerceQuery,
  InstantCoreDatabase,
  InstantDBAttr,
  weakHash,
} from './index.ts';
import * as s from './store.js';
import instaql from './instaql.js';
import { RuleParams } from './schemaTypes.ts';
import { createLinkIndex } from './utils/linkIndex.ts';

export const isServer = typeof window === 'undefined' || 'Deno' in globalThis;

export type FrameworkConfig = {
  token?: string | null;
  db: InstantCoreDatabase<any, any>;
};

type QueryPromise =
  | {
      type: 'http';
      triples: any;
      attrs: any;
      queryHash: any;
      query: any;
      pageInfo?: any;
    }
  | {
      type: 'session';
      queryResult: any;
    };

export class FrameworkClient {
  private params: FrameworkConfig;
  private db: InstantCoreDatabase<any, any>;
  public resultMap: Map<
    string,
    {
      status: 'pending' | 'success' | 'error';
      type: 'http' | 'session';
      promise?: Promise<QueryPromise> | null;
      data?: any;
      error?: any;
    }
  > = new Map();

  private queryResolvedCallbacks: ((result: {
    triples: any;
    attrs: any;
    queryHash: any;
    query: any;
    pageInfo?: any;
  }) => void)[] = [];

  constructor(params: FrameworkConfig) {
    this.params = params;
    this.db = params.db;
    this.resultMap = new Map<
      string,
      {
        type: 'http' | 'session';
        status: 'pending' | 'success' | 'error';
        promise?: Promise<QueryPromise>;
        data?: any;
        error?: any;
      }
    >();
  }

  public subscribe = (
    callback: (result: {
      triples: any;
      attrs: any;
      queryHash: string;
      pageInfo?: any;
    }) => void,
  ) => {
    this.queryResolvedCallbacks.push(callback);
  };

  // Runs on the client when ssr gets html script tags
  public addQueryResult = (queryKey: string, value: any) => {
    this.resultMap.set(queryKey, {
      type: value.type,
      status: 'success',
      data: value,
      promise: null,
      error: null,
    });
    // send the result to the client
    if (!isServer) {
      // make sure the attrs are there to create stores
      if (!this.db._reactor.attrs) {
        this.db._reactor._setAttrs(value.attrs);
      }
      this.db._reactor._addQueryData(
        value.query,
        value,
        !!this.db._reactor.config.schema,
      );
    }
  };

  public query = (
    _query: any,
    opts?: {
      ruleParams: RuleParams;
    },
  ): {
    type: 'http' | 'session';
    status: 'pending' | 'success' | 'error';
    promise?: Promise<QueryPromise>;
    data?: any;
    error?: any;
  } => {
    const { hash, query } = this.hashQuery(_query, opts);

    if (this.db._reactor.status === 'authenticated') {
      const promise = this.db.queryOnce(_query, opts);
      let entry = {
        status: 'pending' as 'pending' | 'success' | 'error',
        type: 'session' as 'http' | 'session',
        data: undefined as any,
        error: undefined as any,
        promise: promise as any,
      };
      promise.then((result) => {
        entry.status = 'success';
        entry.data = result;
        entry.promise = null;
      });
      promise.catch((error) => {
        entry.status = 'error';
        entry.error = error;
        entry.promise = null;
      });
      this.resultMap.set(hash, entry);
      return entry as any;
    }

    const promise = this.getTriplesAndAttrsForQuery(query);
    let entry = {
      status: 'pending' as 'pending' | 'success' | 'error',
      type: 'http' as 'http' | 'session',
      data: undefined as any,
      error: undefined as any,
      promise: promise as any,
    };

    promise.then((result) => {
      entry.status = 'success';
      entry.data = result;
      entry.promise = null;
    });
    promise.catch((error) => {
      entry.status = 'error';
      entry.error = error;
      entry.promise = null;
    });

    promise.then((result) => {
      this.queryResolvedCallbacks.forEach((callback) => {
        callback({
          queryHash: hash,
          query: query,
          attrs: result.attrs,
          triples: result.triples,
          pageInfo: result.pageInfo,
        });
      });
    });

    this.resultMap.set(hash, entry);
    return entry;
  };

  public getExistingResultForQuery = (
    _query: any,
    opts?: {
      ruleParams: RuleParams;
    },
  ) => {
    const { hash } = this.hashQuery(_query, opts);
    return this.resultMap.get(hash);
  };

  public completeIsomorphic = (
    query: any,
    triples: any[],
    attrs: InstantDBAttr[],
    pageInfo?: any,
  ) => {
    const attrMap = {};
    attrs.forEach((attr) => {
      attrMap[attr.id] = attr;
    });

    const enableCardinalityInference =
      Boolean(this.db?._reactor?.config?.schema) &&
      ('cardinalityInference' in this.db?._reactor?.config
        ? Boolean(this.db?._reactor.config?.cardinalityInference)
        : true);

    const attrsStore = new s.AttrsStoreClass(
      attrs.reduce((acc, attr) => {
        acc[attr.id] = attr;
        return acc;
      }, {}),
      createLinkIndex(this.db?._reactor.config.schema),
    );

    const store = s.createStore(
      attrsStore,
      triples,
      enableCardinalityInference,
      this.params.db._reactor.config.useDateObjects || false,
    );
    const resp = instaql(
      {
        store: store,
        attrsStore: attrsStore,
        pageInfo: pageInfo,
        aggregate: undefined,
      },
      query,
    );
    return resp;
  };

  public hashQuery = (
    _query: any,
    opts?: {
      ruleParams: RuleParams;
    },
  ): { hash: string; query: any } => {
    if (_query && opts && 'ruleParams' in opts) {
      _query = { $$ruleParams: opts['ruleParams'], ..._query };
    }
    const query = _query ? coerceQuery(_query) : null;
    return { hash: weakHash(query), query: query };
  };

  public getTriplesAndAttrsForQuery = async (
    query: any,
  ): Promise<{
    triples: any[];
    attrs: InstantDBAttr[];
    query: any;
    queryHash: string;
    type: 'http';
    pageInfo?: any;
  }> => {
    const response = await fetch(
      `${this.db._reactor.config.apiURI}/runtime/framework/query`,
      {
        method: 'POST',
        headers: {
          'app-id': this.params.db._reactor.config.appId,
          'Content-Type': 'application/json',
          Authorization: this.params.token
            ? `Bearer ${this.params.token}`
            : undefined,
        } as Record<string, string>,
        body: JSON.stringify({
          query: query,
        }),
      },
    );

    if (!response.ok) {
      throw new Error('Error getting triples from server');
    }

    const data = await response.json();

    const attrs = data?.attrs;
    if (!attrs) {
      throw new Error('No attrs');
    }

    // TODO: make safer
    const triples = data.result?.[0].data?.['datalog-result']?.['join-rows'][0];

    const pageInfo = data.result?.[0]?.data?.['page-info'];

    return {
      attrs,
      triples,
      type: 'http',
      queryHash: this.hashQuery(query).hash,
      query,
      pageInfo,
    };
  };
}
