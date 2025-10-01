import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ConnectionManager } from '../../../src/reactor/connectionManager';

const WS_OPEN = 1;

class FakeSocket {
  static nextId = 1;
  readyState = 0;
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  sent: Array<string> = [];

  constructor() {
    (this as any)._id = FakeSocket.nextId++;
  }

  send = vi.fn((payload: string) => {
    this.sent.push(payload);
  });

  close = vi.fn(() => {
    this.readyState = 3;
    this.onclose?.({ target: this });
  });
}

describe('ConnectionManager', () => {
  let sockets: FakeSocket[];
  let createSocket: ReturnType<typeof vi.fn>;
  let manager: ConnectionManager;
  let setStatus: ReturnType<typeof vi.fn>;
  let handleReceive: ReturnType<typeof vi.fn>;
  let getCurrentUser: ReturnType<typeof vi.fn>;
  let buildInitMessage: ReturnType<typeof vi.fn>;
  let onSocketClosed: ReturnType<typeof vi.fn>;
  let logger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const depsFactory = () => ({
    websocketURI: 'wss://example.com',
    appId: 'app-123',
    log: logger,
    isShutdown: () => false,
    isOnline: () => true,
    setStatus,
    getCurrentUser,
    buildInitMessage,
    generateEventId: () => 'event-1',
    shouldLog: () => true,
    handleReceive,
    onSocketClosed,
  });

  beforeEach(() => {
    sockets = [];
    createSocket = vi.fn(() => {
      const instance = new FakeSocket();
      sockets.push(instance);
      return instance as unknown as WebSocket;
    });
    setStatus = vi.fn();
    handleReceive = vi.fn();
    getCurrentUser = vi.fn(async () => ({ user: { refresh_token: 'token' } }));
    buildInitMessage = vi.fn((refreshToken?: string) => ({ op: 'init', refreshToken }));
    onSocketClosed = vi.fn();
    logger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    manager = new ConnectionManager({
      createSocket,
      ...depsFactory(),
    });
  });

  test('starts connection and sends init on open', async () => {
    manager.start();

    expect(createSocket).toHaveBeenCalledWith('wss://example.com?app_id=app-123');

    const socket = sockets[0];
    socket.readyState = WS_OPEN;
    socket.onopen?.({ target: socket });

    await vi.waitFor(() => {
      expect(buildInitMessage).toHaveBeenCalledWith('token');
    });

    expect(setStatus).toHaveBeenCalledWith('opened');
    expect(socket.send).toHaveBeenCalled();
    const payload = JSON.parse(socket.send.mock.calls[0][0]);
    expect(payload).toMatchObject({ 'client-event-id': 'event-1', op: 'init' });
  });

  test('reconnects after close', () => {
    vi.useFakeTimers();
    manager.start();
    expect(createSocket).toHaveBeenCalledTimes(1);

    const firstSocket = sockets[0];
    firstSocket.onclose?.({ target: firstSocket });

    expect(onSocketClosed).toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith('closed');

    vi.runAllTimers();

    expect(createSocket).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  test('resetBackoff clears pending reconnect', () => {
    vi.useFakeTimers();
    manager.start();

    const firstSocket = sockets[0];
    firstSocket.onclose?.({ target: firstSocket });
    manager.resetBackoff();

    expect(vi.getTimerCount()).toBe(0);

    vi.useRealTimers();
  });
});
