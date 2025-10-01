import { test, expect } from 'vitest';
import { BaseActor, EventBus, Message } from '../../../src/actors/BaseActor';

// Concrete implementation for testing
class TestActor extends BaseActor<{ count: number }> {
  receive(message: Message): void {
    if (message.type === 'increment') {
      this.state = { count: this.state.count + 1 };
      this.publish({ type: 'incremented', count: this.state.count });
    }
  }
}

test('BaseActor - subscribes and publishes messages', () => {
  const actor = new TestActor('test', { count: 0 });
  const messages: Message[] = [];

  actor.subscribe((msg) => messages.push(msg));
  actor.receive({ type: 'increment' });

  expect(messages).toHaveLength(1);
  expect(messages[0]).toEqual({ type: 'incremented', count: 1 });
  expect(actor.getState().count).toBe(1);
});

test('BaseActor - unsubscribe works', () => {
  const actor = new TestActor('test', { count: 0 });
  const messages: Message[] = [];

  const unsub = actor.subscribe((msg) => messages.push(msg));
  actor.receive({ type: 'increment' });

  unsub();
  actor.receive({ type: 'increment' });

  expect(messages).toHaveLength(1);
});

test('BaseActor - shutdown clears subscribers', () => {
  const actor = new TestActor('test', { count: 0 });
  const messages: Message[] = [];

  actor.subscribe((msg) => messages.push(msg));
  actor.shutdown();
  actor.receive({ type: 'increment' });

  expect(messages).toHaveLength(0);
});

test('EventBus - routes messages by type', () => {
  const bus = new EventBus();
  const messages: { [key: string]: Message[] } = {
    foo: [],
    bar: [],
  };

  bus.on('foo', (msg) => messages.foo.push(msg));
  bus.on('bar', (msg) => messages.bar.push(msg));

  bus.emit({ type: 'foo', data: 1 });
  bus.emit({ type: 'bar', data: 2 });

  expect(messages.foo).toHaveLength(1);
  expect(messages.foo[0].data).toBe(1);
  expect(messages.bar).toHaveLength(1);
  expect(messages.bar[0].data).toBe(2);
});

test('EventBus - unsubscribe works', () => {
  const bus = new EventBus();
  const messages: Message[] = [];

  const unsub = bus.on('test', (msg) => messages.push(msg));
  bus.emit({ type: 'test', data: 1 });

  unsub();
  bus.emit({ type: 'test', data: 2 });

  expect(messages).toHaveLength(1);
});

test('EventBus - clear removes all handlers', () => {
  const bus = new EventBus();
  const messages: Message[] = [];

  bus.on('test', (msg) => messages.push(msg));
  bus.clear();
  bus.emit({ type: 'test', data: 1 });

  expect(messages).toHaveLength(0);
});
