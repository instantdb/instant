import { test, expect } from 'vitest';
import { StorageActor } from '../../../src/actors/StorageActor';

test('StorageActor - handles upload', async () => {
  const actor = new StorageActor();
  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({
    type: 'storage:upload',
    path: 'test.jpg',
    file: new Blob(['test']),
    opts: {},
  });

  // Wait a bit for async operation
  await new Promise((resolve) => setTimeout(resolve, 10));

  const uploadMsg = messages.find((m) => m.type === 'storage:upload-complete');
  expect(uploadMsg).toBeDefined();
  expect(uploadMsg.path).toBe('test.jpg');
});

test('StorageActor - handles delete', async () => {
  const actor = new StorageActor();
  const messages: any[] = [];
  actor.subscribe((msg) => messages.push(msg));

  actor.receive({
    type: 'storage:delete',
    path: 'test.jpg',
  });

  // Wait a bit for async operation
  await new Promise((resolve) => setTimeout(resolve, 10));

  const deleteMsg = messages.find((m) => m.type === 'storage:delete-complete');
  expect(deleteMsg).toBeDefined();
  expect(deleteMsg.path).toBe('test.jpg');
});
