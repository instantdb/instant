import { test, expect } from 'vitest';
import { NetworkActor, NetworkListener } from '../../../src/actors/NetworkActor';

// Mock NetworkListener
class MockNetworkListener implements NetworkListener {
  private _isOnline: boolean = true;
  private _listeners: Array<(isOnline: boolean) => void> = [];

  async getIsOnline(): Promise<boolean> {
    return this._isOnline;
  }

  listen(callback: (isOnline: boolean) => void): () => void {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter((cb) => cb !== callback);
    };
  }

  // Test helper methods
  setOnline(value: boolean): void {
    this._isOnline = value;
    this._listeners.forEach((cb) => cb(value));
  }
}

test('NetworkActor - initializes with online status', async () => {
  const listener = new MockNetworkListener();
  const actor = new NetworkActor(listener);

  await actor.initialize();

  expect(actor.isOnline()).toBe(true);
});

test('NetworkActor - publishes online event when network comes online', async () => {
  const listener = new MockNetworkListener();
  listener.setOnline(false); // Start offline

  const actor = new NetworkActor(listener);
  await actor.initialize();

  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  listener.setOnline(true);

  expect(messages.some((m) => m.type === 'network:online')).toBe(true);
  expect(messages.some((m) => m.type === 'network:status' && m.isOnline === true)).toBe(true);
  expect(actor.isOnline()).toBe(true);
});

test('NetworkActor - publishes offline event when network goes offline', async () => {
  const listener = new MockNetworkListener();
  const actor = new NetworkActor(listener);
  await actor.initialize();

  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  listener.setOnline(false);

  expect(messages.some((m) => m.type === 'network:offline')).toBe(true);
  expect(messages.some((m) => m.type === 'network:status' && m.isOnline === false)).toBe(true);
  expect(actor.isOnline()).toBe(false);
});

test('NetworkActor - does not publish duplicate events', async () => {
  const listener = new MockNetworkListener();
  const actor = new NetworkActor(listener);
  await actor.initialize();

  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  // Trigger same state multiple times
  listener.setOnline(true);
  listener.setOnline(true);
  listener.setOnline(true);

  expect(messages).toHaveLength(0); // Already online, no events
});

test('NetworkActor - responds to status queries', async () => {
  const listener = new MockNetworkListener();
  const actor = new NetworkActor(listener);
  await actor.initialize();

  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({ type: 'network:query' });

  expect(messages).toHaveLength(1);
  expect(messages[0].type).toBe('network:status');
  expect(messages[0].isOnline).toBe(true);
});

test('NetworkActor - cleans up listener on shutdown', async () => {
  const listener = new MockNetworkListener();
  const actor = new NetworkActor(listener);
  await actor.initialize();

  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.shutdown();
  listener.setOnline(false);

  // Should not receive events after shutdown
  expect(messages).toHaveLength(0);
});
