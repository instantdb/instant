import { test, expect } from 'vitest';
import { MessageRouterActor, RoutedMessage } from '../../../src/actors/MessageRouterActor';

test('MessageRouterActor - routes messages by op field', () => {
  const router = new MessageRouterActor();
  const messages: RoutedMessage[] = [];

  router.subscribe((msg) => messages.push(msg));

  router.receive({
    type: 'ws:message',
    wsId: 1,
    message: {
      op: 'init-ok',
      attrs: [],
      'session-id': 'test-session',
    },
  });

  router.receive({
    type: 'ws:message',
    wsId: 1,
    message: {
      op: 'add-query-ok',
      q: { users: {} },
      result: [],
    },
  });

  expect(messages).toHaveLength(2);
  expect(messages[0].type).toBe('ws:init-ok');
  expect(messages[0].payload.op).toBe('init-ok');
  expect(messages[1].type).toBe('ws:add-query-ok');
  expect(messages[1].payload.op).toBe('add-query-ok');
});

test('MessageRouterActor - includes wsId in routed message', () => {
  const router = new MessageRouterActor();
  const messages: RoutedMessage[] = [];

  router.subscribe((msg) => messages.push(msg));

  router.receive({
    type: 'ws:message',
    wsId: 42,
    message: { op: 'test-op', data: 'test' },
  });

  expect(messages[0].wsId).toBe(42);
});

test('MessageRouterActor - tracks message count', () => {
  const router = new MessageRouterActor();

  expect(router.getMessageCount()).toBe(0);

  router.receive({
    type: 'ws:message',
    wsId: 1,
    message: { op: 'test-op' },
  });

  router.receive({
    type: 'ws:message',
    wsId: 1,
    message: { op: 'another-op' },
  });

  expect(router.getMessageCount()).toBe(2);
});

test('MessageRouterActor - handles messages without op gracefully', () => {
  const router = new MessageRouterActor();
  const messages: RoutedMessage[] = [];

  router.subscribe((msg) => messages.push(msg));

  // Should not crash or publish invalid message
  router.receive({
    type: 'ws:message',
    wsId: 1,
    message: { data: 'no-op-field' },
  });

  expect(messages).toHaveLength(0);
});

test('MessageRouterActor - ignores non-ws messages', () => {
  const router = new MessageRouterActor();
  const messages: RoutedMessage[] = [];

  router.subscribe((msg) => messages.push(msg));

  router.receive({ type: 'other-message', data: 'test' });

  expect(messages).toHaveLength(0);
  expect(router.getMessageCount()).toBe(0);
});
