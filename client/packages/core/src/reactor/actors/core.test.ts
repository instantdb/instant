import { describe, expect, it, vi } from 'vitest';
import { Actor, ActorStoppedError } from './core.ts';
import { Supervisor } from './supervisor.ts';

interface CounterEvent {
  type: 'inc' | 'dec' | 'ask';
}

describe('Actor', () => {
  it('processes events sequentially', async () => {
    const history: number[] = [];
    const actor = new Actor<CounterEvent, number>({
      id: 'counter',
      initialState: 0,
      reducer: async (state, event) => {
        await Promise.resolve();
        if (event.type === 'inc') return state + 1;
        if (event.type === 'dec') return state - 1;
        return state;
      },
      onStateChange: (state) => history.push(state),
    });

    actor.send({ type: 'inc' });
    actor.send({ type: 'inc' });
    actor.send({ type: 'dec' });

    await actor.ask({ type: 'ask' });

    expect(history).toEqual([1, 2, 1]);
  });

  it('supports ask/reply', async () => {
    const actor = new Actor<CounterEvent, number>({
      id: 'counter',
      initialState: 0,
      reducer: (state, event, ctx) => {
        if (event.type === 'inc') return state + 1;
        if (event.type === 'ask') {
          ctx.reply(state);
        }
        return state;
      },
    });

    actor.send({ type: 'inc' });
    actor.send({ type: 'inc' });

    const result = await actor.ask<number>({ type: 'ask' });
    expect(result).toBe(2);
  });

  it('propagates reducer failures to crash handler', async () => {
    const onCrash = vi.fn();
    const actor = new Actor<CounterEvent, number>({
      id: 'counter',
      initialState: 0,
      reducer: () => {
        throw new Error('boom');
      },
      onCrash,
    });

    await expect(actor.ask({ type: 'inc' })).rejects.toThrowError('boom');
    expect(onCrash).toHaveBeenCalledTimes(1);
  });

  it('prevents sending once stopped', () => {
    const actor = new Actor<CounterEvent, number>({
      id: 'counter',
      initialState: 0,
      reducer: (state) => state,
    });

    actor.stop();
    expect(actor.isStopped()).toBe(true);
    expect(() => actor.send({ type: 'inc' })).toThrow(ActorStoppedError);
  });

  it('subscribes to state updates', async () => {
    const actor = new Actor<CounterEvent, number>({
      id: 'counter',
      initialState: 0,
      reducer: (state, event) => {
        if (event.type === 'inc') {
          return state + 1;
        }
        return state;
      },
    });

    const seen: number[] = [];
    const unsubscribe = actor.subscribe((state) => seen.push(state));

    actor.send({ type: 'inc' });
    await actor.ask({ type: 'ask' });

    expect(seen).toEqual([0, 1]);

    unsubscribe();
    actor.send({ type: 'inc' });
    await actor.ask({ type: 'ask' });
    expect(seen).toEqual([0, 1]);
  });
});

describe('Supervisor', () => {
  it('spawns child actors with scoped ids', async () => {
    const supervisor = new Supervisor({ id: 'root' });

    const actor = supervisor.spawn<CounterEvent, number>('counter', {
      initialState: 0,
      reducer: (state, event) => {
        if (event.type === 'inc') return state + 1;
        return state;
      },
    });

    actor.send({ type: 'inc' });
    await actor.ask({ type: 'ask' });

    const instance = supervisor.get<CounterEvent, number>('counter');
    expect(instance?.snapshot).toBe(1);

    supervisor.stopAll();
    expect(instance?.isStopped()).toBe(true);
  });

  it('bubbles child crashes', async () => {
    const onChildCrash = vi.fn();
    const supervisor = new Supervisor({ id: 'root', onChildCrash });

    const actor = supervisor.spawn<CounterEvent, number>('counter', {
      initialState: 0,
      reducer: () => {
        throw new Error('boom');
      },
    });

    await expect(actor.ask({ type: 'inc' })).rejects.toThrow('boom');
    expect(onChildCrash).toHaveBeenCalledTimes(1);
  });
});
