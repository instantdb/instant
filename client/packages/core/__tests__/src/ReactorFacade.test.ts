import { test, expect, vi } from 'vitest';
import { ReactorFacade } from '../../src/ReactorFacade';
import { v4 as uuidv4 } from 'uuid';

// Mock dependencies
const mockStorage = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
};

const mockNetworkListener = {
  getIsOnline: vi.fn().mockResolvedValue(true),
  listen: vi.fn().mockReturnValue(() => {}),
};

const mockConfig = {
  appId: uuidv4(),
  disableValidation: true,
};

test('ReactorFacade - initializes without errors', () => {
  const facade = new ReactorFacade(
    mockConfig,
    mockStorage as any,
    mockNetworkListener as any,
  );

  expect(facade).toBeDefined();
  expect(facade.config.appId).toBe(mockConfig.appId);
});

test('ReactorFacade - throws on invalid appId', () => {
  expect(() => {
    new ReactorFacade(
      { appId: 'invalid-id' },
      mockStorage as any,
      mockNetworkListener as any,
    );
  }).toThrow('not a valid uuid');
});

test('ReactorFacade - throws on missing appId', () => {
  expect(() => {
    new ReactorFacade({}, mockStorage as any, mockNetworkListener as any);
  }).toThrow('must be initialized with an appId');
});

test('ReactorFacade - query subscription', async () => {
  const facade = new ReactorFacade(
    mockConfig,
    mockStorage as any,
    mockNetworkListener as any,
  );

  const callback = vi.fn();
  const query = { users: {} };

  const unsubscribe = facade.subscribeQuery(query, callback);

  expect(typeof unsubscribe).toBe('function');

  unsubscribe();
});

test('ReactorFacade - auth subscription', async () => {
  const facade = new ReactorFacade(
    mockConfig,
    mockStorage as any,
    mockNetworkListener as any,
  );

  const callback = vi.fn();
  const unsubscribe = facade.subscribeAuth(callback);

  // Should call immediately with current state
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(callback).toHaveBeenCalled();
  expect(typeof unsubscribe).toBe('function');

  unsubscribe();
});

test('ReactorFacade - presence operations', () => {
  const facade = new ReactorFacade(
    mockConfig,
    mockStorage as any,
    mockNetworkListener as any,
  );

  // Join room
  facade.joinRoom('room-1');

  // Publish presence
  facade.publishPresence('chat', 'room-1', { name: 'Alice' });

  // Subscribe presence
  const callback = vi.fn();
  const unsubscribe = facade.subscribePresence('chat', 'room-1', {}, callback);

  expect(typeof unsubscribe).toBe('function');

  unsubscribe();
});

test('ReactorFacade - broadcast operations', () => {
  const facade = new ReactorFacade(
    mockConfig,
    mockStorage as any,
    mockNetworkListener as any,
  );

  // Subscribe to topic
  const callback = vi.fn();
  const unsubscribe = facade.subscribeTopic('room-1', 'chat', callback);

  // Publish to topic
  facade.publishTopic({
    roomType: 'chat',
    roomId: 'room-1',
    topic: 'messages',
    data: { text: 'Hello' },
  });

  expect(typeof unsubscribe).toBe('function');

  unsubscribe();
});

test('ReactorFacade - connection status subscription', () => {
  const facade = new ReactorFacade(
    mockConfig,
    mockStorage as any,
    mockNetworkListener as any,
  );

  const callback = vi.fn();
  const unsubscribe = facade.subscribeConnectionStatus(callback);

  expect(typeof unsubscribe).toBe('function');

  unsubscribe();
});

test('ReactorFacade - shutdown', () => {
  const facade = new ReactorFacade(
    mockConfig,
    mockStorage as any,
    mockNetworkListener as any,
  );

  // Should not throw
  facade.shutdown();
});

test('ReactorFacade - mutation operations', () => {
  const facade = new ReactorFacade(
    mockConfig,
    mockStorage as any,
    mockNetworkListener as any,
  );

  const txSteps = [
    ['add-triple', 'user-1', 'name', 'Alice'],
  ];

  const eventId = facade.pushOps(txSteps);

  expect(typeof eventId).toBe('string');
});

test('ReactorFacade - storage operations', async () => {
  const facade = new ReactorFacade(
    mockConfig,
    mockStorage as any,
    mockNetworkListener as any,
  );

  // Note: These will timeout in the test since we're not mocking the actual
  // storage backend, but they verify the API surface is correct
  const uploadPromise = facade.uploadFile('test.jpg', new Blob(['test']), {});
  const deletePromise = facade.deleteFile('test.jpg');

  expect(uploadPromise).toBeInstanceOf(Promise);
  expect(deletePromise).toBeInstanceOf(Promise);
});
