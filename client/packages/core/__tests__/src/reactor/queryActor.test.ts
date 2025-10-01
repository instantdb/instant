import { describe, expect, test } from 'vitest';

import { createQueryActor } from '../../../src/reactor/queryActor';
import { Deferred } from '../../../src/utils/Deferred.js';

describe('query actor', () => {
  test('adds and removes listeners in order', async () => {
    const actor = createQueryActor();
    const cb = () => {};
    const addResult = await actor.addListener('hash', { q: {}, cb });
    expect(addResult.isFirstListener).toBe(true);

    const addAgain = await actor.addListener('hash', { q: {}, cb });
    expect(addAgain.isFirstListener).toBe(false);

    const removal = await actor.removeListener('hash', cb);
    expect(removal.remaining).toBe(0);
    expect(removal.once).toBe(0);
  });

  test('tracks query once records', async () => {
    const actor = createQueryActor();
    const dfd = new Deferred();
    await actor.addOnce('hash', { q: {}, eventId: 'evt', dfd });
    expect(actor.getOnce('hash')).toHaveLength(1);

    await actor.resolveOnce('hash', dfd);
    expect(actor.getOnce('hash')).toHaveLength(0);
  });

  test('reject once removes matching event', async () => {
    const actor = createQueryActor();
    const dfd1 = new Deferred();
    const dfd2 = new Deferred();
    await actor.addOnce('hash', { q: {}, eventId: 'a', dfd: dfd1 });
    await actor.addOnce('hash', { q: {}, eventId: 'b', dfd: dfd2 });

    await actor.rejectOnce('hash', 'a');
    expect(actor.getOnce('hash').map((r) => r.eventId)).toEqual(['b']);
    expect(actor.hashesWithOnce()).toEqual(['hash']);
  });

  test('clear removes listeners and once records', async () => {
    const actor = createQueryActor();
    const cb = () => {};
    await actor.addListener('hash', { q: {}, cb });
    await actor.addOnce('hash', { q: {}, eventId: 'z', dfd: new Deferred() });

    await actor.clear('hash');

    expect(actor.getCallbacks('hash')).toHaveLength(0);
    expect(actor.getOnce('hash')).toHaveLength(0);
  });
});
