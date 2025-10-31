import { PersistedObject } from './utils/PersistedObject.ts';
import * as s from './store.js';
import weakHash from './utils/weakHash.ts';
import uuid from './utils/uuid.ts';
import { Logger } from './Reactor.js';
import instaql from './instaql.js';

type SubState = {
  txId?: number;
  subscriptionId: string;
  token: string;
};

type SubResult = {
  store: any;
  // XXX: We don't need to store the result, we could recreate it from the store each time
  result: any;
};

type Sub = {
  query: any;
  hash: string;
  state?: SubState;
  result?: SubResult;
};

// We could make a better type for this if we had a return type for s.toJSON
type SubsInStorage = Subs;

type Subs = { [hash: string]: Sub };

type fixme = any;

type StartMsg = {
  op: 'start-sync';
  q: string;
};

type ResyncMsg = {
  op: 'resync-table';
  'subscription-id': string;
  'tx-id': number;
  token: string;
};

type SendMsg = StartMsg | ResyncMsg;

type StartSyncOkMsg = {
  'subscription-id': string;
  'client-event-id': string;
  q: string;
  token: string;
};

type Triple = [string, string, any, number];

type SyncLoadBatchMsg = {
  'subscription-id': string;
  'join-rows': Array<Triple[]>;
};

type SyncInitFinishMsg = {
  'subscription-id': string;
  'tx-id': number;
};

type SyncUpdateTriplesMsg = {
  'subscription-id': string;
  txes: {
    'tx-id': number;
    changes: { action: 'added' | 'removed'; triple: Triple }[];
  }[];
};

type TrySend = (eventId: string, msg: SendMsg) => void;

type Config = { useDateObjects: boolean };

// Modifies the data in place because it comes directly from storage
function syncSubsFromStorage(
  parsed: SubsInStorage,
  useDateObjects: boolean,
): Subs {
  for (const key in parsed) {
    const sub = parsed[key];
    if (sub.result?.store) {
      const storeJSON = sub.result.store;
      storeJSON.useDateObjects = useDateObjects;
      sub.result.store = s.fromJSON(storeJSON);
    }
  }
  return parsed;
}

function syncSubsToStorage(subs: Subs): SubsInStorage {
  const jsonSubs = {};
  for (const key in subs) {
    const sub = subs[key];
    if (sub.result) {
      const { store, ...result } = sub.result;
      (result as SubResult).store = s.toJSON(store);
      jsonSubs[key] = { ...sub, result };
    } else {
      jsonSubs[key] = sub;
    }
  }
  return jsonSubs;
}

function onMergeSubs(storageSubs: Subs | null, inMemorySubs: Subs): Subs {
  const subs = {};
  for (const [k, v] of Object.entries(inMemorySubs)) {
    subs[k] = v;
  }
  if (storageSubs) {
    for (const [k, v] of Object.entries(storageSubs)) {
      subs[k] = v;
    }
  }
  return subs;
}

type SyncCallback = (result: any) => void;

export class SyncTable {
  private trySend: TrySend;
  private subs: PersistedObject<Subs>;
  private callbacks: { [hash: string]: SyncCallback[] } = {};
  private config: Config;
  private idToHash: { [subscriptionId: string]: string } = {};
  private log: Logger;
  private createStore: (triples: Triple[]) => any;

  constructor(
    trySend: TrySend,
    persister: Storage,
    config: Config,
    log: Logger,
    createStore: (triples: Triple[]) => any,
  ) {
    this.trySend = trySend;
    this.config = config;
    this.log = log;
    this.createStore = createStore;

    this.subs = new PersistedObject<Subs>(
      persister,
      'subs',
      {},
      onMergeSubs,
      syncSubsToStorage,
      (x) => syncSubsFromStorage(x, this.config.useDateObjects),
    );
  }

  public beforeUnload() {
    this.subs.flush();
  }

  public subscribe(q: any, cb: SyncCallback): () => void {
    const hash = weakHash(q);
    this.callbacks[hash] = this.callbacks[hash] || [];
    this.callbacks[hash].push(cb);

    this.initSubscription(q, hash, cb);

    return () => {
      this.unsubscribe(hash, cb);
    };
  }

  private unsubscribe(hash: string, cb: SyncCallback) {
    const cbs = (this.callbacks[hash] || []).filter((x) => x !== cb);
    this.callbacks[hash] = cbs;

    if (!cbs.length) {
      delete this.callbacks[hash];
      // XXX: Should we send a note to the server that it's being deleted?
      // XXX: We may want to keep this around for a bit?
      this.subs.set((prev) => {
        delete prev[hash];
        return prev;
      });
    }
  }

  private sendStart(query: string) {
    // XXX: Maybe the client id would be good for something?
    this.trySend(uuid(), {
      op: 'start-sync',
      q: query,
    });
  }

  private sendResync(sub: Sub, state: SubState) {
    // Make sure we can find the hash from the subscriptionId
    this.idToHash[state.subscriptionId] = sub.hash;
    this.trySend(state.subscriptionId, {
      op: 'resync-table',
      'subscription-id': state.subscriptionId,
      // XXX: Figure out why this isn't complaining
      'tx-id': state.txId,
      token: state.token,
    });
  }

  // XXX: maybe not always cb?

  private async initSubscription(query: any, hash: string, cb?: SyncCallback) {
    // Wait for storage to load so that we know if we already have an existing subscription
    await this.subs.waitForLoaded();
    const existingSub = this.subs.currentValue[hash];

    if (existingSub && existingSub.state && existingSub.state.txId) {
      this.sendResync(existingSub, existingSub.state);
      if (existingSub.result && cb) {
        cb(existingSub.result.result);
      }
      return;
    }

    this.subs.set((prev) => {
      prev[hash] = {
        query,
        hash: hash,
      };
      return prev;
    });

    this.sendStart(query);
  }

  public async flushPending() {
    await this.subs.waitForLoaded();
    for (const hash of Object.keys(this.callbacks)) {
      const sub = this.subs.currentValue[hash];
      if (sub) {
        await this.initSubscription(sub.query, sub.hash);
      } else {
        this.log.error('Missing sub for hash in flushPending', hash);
      }
    }
    // XXX: Do we need to run a cb here? Probably not? If it's in the store, we should have already run the callback
  }

  public onStartSyncOk(msg: StartSyncOkMsg) {
    const subscriptionId = msg['subscription-id'];
    const q = msg.q;
    const hash = weakHash(q);

    this.idToHash[subscriptionId] = hash;

    // XXX: Need to figure out how to tie it back to some
    //      thing that will get notified of changes
    this.subs.set((prev) => {
      const sub = prev[hash];
      if (!sub) {
        this.log.error(
          'Missing sub for hash',
          hash,
          'subscription-id',
          subscriptionId,
          'query',
          q,
        );
        return prev;
      }

      sub.state = {
        subscriptionId: subscriptionId,
        token: msg.token,
      };
      return prev;
    });
  }

  private notifyCbs(hash: string) {
    const result = this.subs.currentValue[hash]?.result?.result;
    if (!result) {
      this.log.error('No result ready when notifyCbs was called', { hash });
      return;
    }
    for (const cb of this.callbacks[hash] || []) {
      cb(result);
    }
  }

  public onSyncLoadBatch(msg: SyncLoadBatchMsg) {
    const subscriptionId = msg['subscription-id'];
    const joinRows = msg['join-rows'];
    const hash = this.idToHash[subscriptionId];
    if (!hash) {
      this.log.error('Missing hash for subscription', msg);
      return;
    }
    this.subs.set((prev) => {
      const sub = prev[hash];
      if (!sub) {
        this.log.error('Missing sub for hash', hash, msg);
        return prev;
      }

      const store = sub.result?.store ?? this.createStore([]);

      for (const entRows of joinRows) {
        for (const triple of entRows) {
          s.addTriple(store, triple);
        }
      }

      sub.result = {
        store,
        result: instaql({ store, pageInfo: null, aggregate: null }, sub.query),
      };

      return prev;
    });

    this.notifyCbs(hash);
  }

  public onSyncInitFinish(msg: SyncInitFinishMsg) {
    const subscriptionId = msg['subscription-id'];
    const hash = this.idToHash[subscriptionId];
    if (!hash) {
      this.log.error('Missing hash for subscription', msg);
      return;
    }
    this.subs.set((prev) => {
      const sub = prev[hash];
      if (!sub) {
        this.log.error('Missing sub for hash', hash, msg);
        return prev;
      }
      const state = sub.state;
      if (!state) {
        this.log.error('Sub never set init, missing result', sub, msg);
        return prev;
      }
      state.txId = msg['tx-id'];
      return prev;
    });
  }

  public onSyncUpdateTriples(msg: SyncUpdateTriplesMsg) {
    const subscriptionId = msg['subscription-id'];
    const hash = this.idToHash[subscriptionId];
    if (!hash) {
      this.log.error('Missing hash for subscription', msg);
      return;
    }
    this.subs.set((prev) => {
      const sub = prev[hash];
      if (!sub) {
        this.log.error('Missing sub for hash', hash, msg);
        return prev;
      }

      const state = sub.state;
      if (!state) {
        this.log.error('Missing state for sub', sub, msg);
        return prev;
      }

      const store = sub.result?.store ?? this.createStore([]);

      let changed = false;
      for (const tx of msg.txes) {
        if (state.txId > tx['tx-id']) {
          continue;
        }

        for (const { action, triple } of tx.changes) {
          changed = true;
          switch (action) {
            case 'added':
              s.addTriple(store, triple);
              break;
            case 'removed':
              s.retractTriple(store, triple);
              break;
          }
        }

        state.txId = tx['tx-id'];
      }

      sub.result = {
        store,
        result: instaql({ store, pageInfo: null, aggregate: null }, sub.query),
      };

      return prev;
    });

    this.notifyCbs(hash);
  }
}
