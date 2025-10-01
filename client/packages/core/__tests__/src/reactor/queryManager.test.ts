import { beforeEach, describe, expect, test, vi } from 'vitest';

import { QueryManager } from '../../../src/reactor/queryManager';
import zenecaAttrs from '../data/zeneca/attrs.json';
import zenecaTriples from '../data/zeneca/triples.json';

class FakePersister {
  store = new Map();

  async getItem(key) {
    return this.store.get(key) ?? null;
  }

  async setItem(key, value) {
    this.store.set(key, value);
  }
}

const attrsById = zenecaAttrs.reduce((acc, attr) => {
  acc[attr.id] = attr;
  return acc;
}, {});

const makePendingMutations = () => {
  const state = {
    currentValue: new Map(),
    versionValue: 0,
  };
  return {
    currentValue: state.currentValue,
    isLoading: () => false,
    version: () => state.versionValue,
    set: (updater) => {
      const next = updater(state.currentValue);
      if (next !== state.currentValue) {
        state.currentValue = next;
      }
      state.versionValue += 1;
    },
  };
};

const makeManager = () => {
  const sentMessages = [];
  const pendingMutations = makePendingMutations();

  const manager = new QueryManager({
    config: { appId: 'app' },
    queryCacheLimit: 10,
    getError: () => null,
    getPendingMutations: () => pendingMutations,
    rewriteMutationsSorted: () => [],
    applyOptimisticUpdates: (store) => store,
    enableCardinalityInference: () => true,
    getLinkIndex: () => null,
    getAttrs: () => attrsById,
    sendAddQuery: (eventId, message) => {
      sentMessages.push({ eventId, message });
    },
    sendRemoveQuery: (eventId, message) => {
      sentMessages.push({ eventId, message });
    },
    notifyQueriesChanged: vi.fn(),
  });

  manager.initStorage({ persister: new FakePersister() });

  return { manager, sentMessages, pendingMutations };
};

describe('QueryManager', () => {
  test('subscribes and handles server results', async () => {
    const { manager, sentMessages } = makeManager();
    await manager.querySubs.waitForLoaded();

    const q = { users: {} };
    const callback = vi.fn();

    const unsubscribe = manager.subscribeQuery(q, callback);

    // wait for actor to process listener registration
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].message).toEqual({ op: 'add-query', q });

    manager.handleAddQueryOk(
      {
        q,
        result: [
          {
            data: {
              'datalog-result': {
                'join-rows': [zenecaTriples],
              },
            },
            'child-nodes': [],
          },
        ],
        'processed-tx-id': 0,
      },
      { processedTxId: 0 },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(callback).toHaveBeenCalledTimes(1);
    const result = callback.mock.calls[0][0];
    expect(result.data.users.map((user) => user.handle)).toEqual([
      'joe',
      'alex',
      'stopa',
      'nicolegf',
    ]);

    unsubscribe();
  });
});
