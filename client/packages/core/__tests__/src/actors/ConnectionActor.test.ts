import { test, expect, vi } from 'vitest';
import {
  ConnectionActor,
  IWebSocket,
  WebSocketFactory,
} from '../../../src/actors/ConnectionActor';

const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSED = 3;

// Mock WebSocket
class MockWebSocket implements IWebSocket {
  readyState: number = WS_CONNECTING;
  _id?: number;
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;

  sentMessages: any[] = [];

  send(data: string): void {
    this.sentMessages.push(JSON.parse(data));
  }

  close(): void {
    this.readyState = WS_CLOSED;
    if (this.onclose) {
      this.onclose({});
    }
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = WS_OPEN;
    if (this.onopen) {
      this.onopen({});
    }
  }

  simulateMessage(message: any): void {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(message) });
    }
  }

  simulateError(error: any): void {
    if (this.onerror) {
      this.onerror(error);
    }
  }

  simulateClose(): void {
    this.readyState = WS_CLOSED;
    if (this.onclose) {
      this.onclose({});
    }
  }
}

class MockWebSocketFactory implements WebSocketFactory {
  createdSockets: MockWebSocket[] = [];

  create(_url: string): IWebSocket {
    const ws = new MockWebSocket();
    this.createdSockets.push(ws);
    return ws;
  }

  getLatest(): MockWebSocket | undefined {
    return this.createdSockets[this.createdSockets.length - 1];
  }
}

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};

test('ConnectionActor - starts socket on initialization', () => {
  const factory = new MockWebSocketFactory();
  const actor = new ConnectionActor('wss://test', 'app-id', factory, mockLogger);

  actor.receive({ type: 'connection:start' });

  expect(factory.createdSockets).toHaveLength(1);
  expect(actor.getStatus()).toBe('connecting');
});

test('ConnectionActor - updates status to opened on ws open', () => {
  const factory = new MockWebSocketFactory();
  const actor = new ConnectionActor('wss://test', 'app-id', factory, mockLogger);

  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({ type: 'connection:start' });
  const ws = factory.getLatest()!;
  ws.simulateOpen();

  expect(actor.getStatus()).toBe('opened');
  expect(messages.some((m) => m.type === 'connection:status' && m.status === 'opened')).toBe(true);
});

test('ConnectionActor - forwards websocket messages', () => {
  const factory = new MockWebSocketFactory();
  const actor = new ConnectionActor('wss://test', 'app-id', factory, mockLogger);

  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({ type: 'connection:start' });
  const ws = factory.getLatest()!;
  ws.simulateOpen();
  ws.simulateMessage({ op: 'init-ok', attrs: [] });

  const wsMessage = messages.find((m) => m.type === 'ws:message');
  expect(wsMessage).toBeDefined();
  expect(wsMessage.message.op).toBe('init-ok');
});

test('ConnectionActor - sends messages when connection is open', () => {
  const factory = new MockWebSocketFactory();
  const actor = new ConnectionActor('wss://test', 'app-id', factory, mockLogger);

  actor.receive({ type: 'connection:start' });
  const ws = factory.getLatest()!;
  ws.simulateOpen();

  actor.receive({
    type: 'connection:send',
    eventId: 'event-1',
    message: { op: 'add-query', q: {} },
  });

  expect(ws.sentMessages).toHaveLength(1);
  expect(ws.sentMessages[0]['client-event-id']).toBe('event-1');
  expect(ws.sentMessages[0].op).toBe('add-query');
});

test('ConnectionActor - does not send when connection is not open', () => {
  const factory = new MockWebSocketFactory();
  const actor = new ConnectionActor('wss://test', 'app-id', factory, mockLogger);

  actor.receive({ type: 'connection:start' });
  const ws = factory.getLatest()!;
  // Don't call simulateOpen

  actor.receive({
    type: 'connection:send',
    eventId: 'event-1',
    message: { op: 'add-query', q: {} },
  });

  expect(ws.sentMessages).toHaveLength(0);
});

test('ConnectionActor - handles network offline', () => {
  const factory = new MockWebSocketFactory();
  const actor = new ConnectionActor('wss://test', 'app-id', factory, mockLogger);

  actor.receive({ type: 'connection:start' });
  const ws = factory.getLatest()!;
  ws.simulateOpen();

  actor.receive({ type: 'network:offline' });

  expect(actor.getStatus()).toBe('closed');
});

test('ConnectionActor - reconnects on close with backoff', async () => {
  vi.useFakeTimers();
  const factory = new MockWebSocketFactory();
  const actor = new ConnectionActor('wss://test', 'app-id', factory, mockLogger);

  actor.receive({ type: 'connection:start' });
  const ws1 = factory.getLatest()!;
  ws1.simulateOpen();
  ws1.simulateClose();

  // Should schedule reconnect
  expect(factory.createdSockets).toHaveLength(1);

  // Fast-forward timers
  await vi.advanceTimersByTimeAsync(0);

  // Should have created new socket
  expect(factory.createdSockets).toHaveLength(2);

  vi.useRealTimers();
});

test('ConnectionActor - does not reconnect after shutdown', async () => {
  vi.useFakeTimers();
  const factory = new MockWebSocketFactory();
  const actor = new ConnectionActor('wss://test', 'app-id', factory, mockLogger);

  actor.receive({ type: 'connection:start' });
  const ws = factory.getLatest()!;
  ws.simulateOpen();

  actor.shutdown();
  ws.simulateClose();

  await vi.advanceTimersByTimeAsync(5000);

  // Should not create new socket
  expect(factory.createdSockets).toHaveLength(1);

  vi.useRealTimers();
});

test('ConnectionActor - authenticates on init-ok', () => {
  const factory = new MockWebSocketFactory();
  const actor = new ConnectionActor('wss://test', 'app-id', factory, mockLogger);

  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({ type: 'connection:start' });
  factory.getLatest()!.simulateOpen();

  actor.receive({
    type: 'ws:init-ok',
    wsId: 1,
    payload: { op: 'init-ok' },
  });

  expect(actor.getStatus()).toBe('authenticated');
  expect(messages.some((m) => m.type === 'connection:status' && m.status === 'authenticated')).toBe(true);
});
