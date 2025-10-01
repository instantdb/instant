import { beforeEach, describe, expect, test, vi } from 'vitest';

import { MutationManager } from '../../../src/reactor/mutationManager';

class FakePersister {
  store = new Map();

  async getItem(key) {
    return this.store.get(key) ?? null;
  }

  async setItem(key, value) {
    this.store.set(key, value);
  }
}

describe('MutationManager', () => {
  const baseAttr = { id: 'attr1', 'forward-identity': ['fwd', 'user', 'name'] };
  let manager;
  let sent;
  let attrs;
  let querySubs;
  let queriesNotified;

  beforeEach(async () => {
    sent = [];
    queriesNotified = 0;
    attrs = { [baseAttr.id]: baseAttr };
    querySubs = {};

    manager = new MutationManager({
      config: { appId: 'app' },
      getAttrs: () => attrs,
      setAttrs: (next) => {
        attrs = next.reduce((acc, attr) => {
          acc[attr.id] = attr;
          return acc;
        }, {});
      },
      getQuerySubscriptions: () => querySubs,
      notifyQueriesUpdated: () => {
        queriesNotified += 1;
      },
      notifyAttrsSubs: vi.fn(),
      isOnline: () => true,
      isAuthenticated: () => true,
      send: (eventId, message) => sent.push({ eventId, message }),
    });

    manager.initStorage({ persister: new FakePersister() });
    await manager.pendingMutations.waitForLoaded();
  });

  test('enqueueMutation sends mutation and resolves on ack', async () => {
    const txSteps = [['add-attr', { id: 'attr2', 'forward-identity': ['fwd', 'user', 'email'] }]];

    const promise = manager.enqueueMutation(txSteps);

    expect(sent).toHaveLength(1);
    const [{ eventId }] = sent;

    manager.handleTransactOk(eventId, 10);
    manager.cleanupPendingMutationsQueries();

    await expect(promise).resolves.toEqual({ status: 'synced', eventId });
    expect(Object.keys(attrs)).toContain('attr2');
    expect(queriesNotified).toBeGreaterThan(0);
  });

  test('enqueueMutation with error rejects and notifies', async () => {
    const errors = [];
    manager.subscribeMutationErrors((error) => errors.push(error));

    await expect(manager.enqueueMutation([], new Error('boom'))).rejects.toThrow(
      /boom/,
    );

    expect(errors).toEqual([{ message: 'boom', hint: undefined }]);
    expect(manager.pendingMutations.currentValue.size).toBe(0);
  });
});
