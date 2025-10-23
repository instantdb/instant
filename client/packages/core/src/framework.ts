import {
  coerceQuery,
  InstantCoreDatabase,
  InstantDBAttr,
  weakHash,
} from './index.ts';
import * as s from './store.js';
import instaql from './instaql.js';
import { RuleParams } from './schemaTypes.ts';

export const isServer = typeof window === 'undefined' || 'Deno' in globalThis;

export type FrameworkConfig = {
  token?: string;
  db: InstantCoreDatabase<any, any>;
};

export class FrameworkClient {
  private params: FrameworkConfig;
  private db: InstantCoreDatabase<any, any>;
  public resultMap: Map<
    string,
    {
      status: 'pending' | 'success' | 'error';
      promise?: Promise<any>;
      data?: any;
      error?: any;
    }
  > | null = null;

  private queryResolvedCallbacks: ((result: {
    triples: any;
    attrs: any;
    queryHash: any;
    pageInfo?: any;
  }) => void)[] = [];

  constructor(params: FrameworkConfig) {
    this.params = params;
    this.db = params.db;
    this.resultMap = new Map<
      string,
      {
        status: 'pending' | 'success' | 'error';
        promise?: Promise<any>;
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
      status: 'success',
      data: value,
      promise: null,
      error: null,
    });
  };

  public query = (
    _query: any,
    opts?: {
      ruleParams: RuleParams;
    },
  ) => {
    if (_query && opts && 'ruleParams' in opts) {
      _query = { $$ruleParams: opts['ruleParams'], ..._query };
    }
    const query = _query ? coerceQuery(_query) : null;
    const queryHash = weakHash(query);

    const promise = this.getTriplesAndAttrsForQuery(query);
    let entry = {
      status: 'pending' as 'pending' | 'success' | 'error',
      data: undefined,
      error: undefined,
      promise,
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
          queryHash,
          attrs: result.attrs,
          triples: result.triples,
          pageInfo: result.pageInfo,
        });
      });
    });

    this.resultMap.set(queryHash, entry);
    return entry;
  };

  public getExistingResultForQuery = (
    _query: any,
    opts: {
      ruleParams?: RuleParams;
    },
  ) => {
    if (_query && opts && 'ruleParams' in opts) {
      _query = { $$ruleParams: opts['ruleParams'], ..._query };
    }
    const query = _query ? coerceQuery(_query) : null;
    const queryHash = weakHash(query);
    return this.resultMap.get(queryHash);
  };

  public completeIsoMorphic = (
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

    const store = s.createStore(
      attrMap,
      triples,
      enableCardinalityInference,
      undefined,
      this.params.db._reactor.config.useDateObjects || false,
    );
    const resp = instaql(
      { store: store, pageInfo: pageInfo, aggregate: undefined },
      query,
    );
    return resp;
  };

  public getTriplesAndAttrsForQuery = async (
    query: any,
  ): Promise<{
    triples: any[];
    attrs: InstantDBAttr[];
    pageInfo?: any;
  }> => {
    const response = await fetch(
      `${this.db._reactor.config.apiURI}/runtime/triples`,
      {
        method: 'POST',
        headers: {
          'app-id': this.params.db._reactor.config.appId,
          'Content-Type': 'application/json',
          Authorization: this.params.token
            ? `Bearer ${this.params.token}`
            : undefined,
        },
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
      pageInfo,
    };
  };
}
