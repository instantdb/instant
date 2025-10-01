import { test, expect } from 'vitest';
import { AuthActor, User } from '../../../src/actors/AuthActor';

test('AuthActor - sets and publishes user', () => {
  const actor = new AuthActor();
  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  const user: User = { id: 'user-1', email: 'test@example.com' };
  actor.receive({ type: 'auth:set-user', user });

  expect(actor.getUser()).toEqual(user);
  expect(actor.isAuthenticated()).toBe(true);

  const authMsg = messages.find((m) => m.type === 'auth:changed');
  expect(authMsg).toBeDefined();
  expect(authMsg.user).toEqual(user);
});

test('AuthActor - signs out', () => {
  const user: User = { id: 'user-1', email: 'test@example.com' };
  const actor = new AuthActor(user);

  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({ type: 'auth:sign-out' });

  expect(actor.getUser()).toBe(null);
  expect(actor.isAuthenticated()).toBe(false);

  const authMsg = messages.find((m) => m.type === 'auth:changed');
  expect(authMsg.user).toBe(null);
});

test('AuthActor - responds to get-user requests', () => {
  const user: User = { id: 'user-1' };
  const actor = new AuthActor(user);

  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({ type: 'auth:get-user' });

  const authMsg = messages.find((m) => m.type === 'auth:changed');
  expect(authMsg.user).toEqual(user);
});
