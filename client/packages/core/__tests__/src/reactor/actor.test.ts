import { describe, expect, test, vi } from 'vitest';

import { createActor } from '../../../src/reactor/actor';

describe('createActor', () => {
  test('processes messages sequentially', async () => {
    const order: number[] = [];
    const actor = createActor<{ value: number }, number>({
      initialState: { value: 0 },
      reducer: async (state, message) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return {
          state: { value: state.value + message },
          effects: [() => order.push(message)],
        };
      },
    });

    const p1 = actor.dispatch(1);
    const p2 = actor.dispatch(2);
    await Promise.all([p1, p2]);

    expect(actor.getState().value).toBe(3);
    expect(order).toEqual([1, 2]);
  });

  test('notifies subscribers on state change', async () => {
    const actor = createActor<number, number>({
      initialState: 0,
      reducer: (state, message) => state + message,
    });

    const listener = vi.fn();
    const unsubscribe = actor.subscribe(listener);

    await actor.dispatch(2);

    expect(listener).toHaveBeenCalledWith(2);

    unsubscribe();
    await actor.dispatch(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('awaits effects before processing next message', async () => {
    const events: string[] = [];
    const actor = createActor<number, string>({
      initialState: 0,
      reducer: (state, message) => ({
        state: state + 1,
        effects: [
          async () => {
            events.push(`${message}-effect`);
            await new Promise((resolve) => setTimeout(resolve, 5));
          },
        ],
      }),
    });

    const p1 = actor.dispatch('a');
    const p2 = actor.dispatch('b');
    await Promise.all([p1, p2]);

    expect(events).toEqual(['a-effect', 'b-effect']);
  });

  test('stop prevents further dispatches', async () => {
    const actor = createActor<number, number>({
      initialState: 0,
      reducer: (state, message) => state + message,
    });

    await actor.dispatch(1);
    actor.stop();
    await actor.dispatch(5);

    expect(actor.getState()).toBe(1);
  });
});
