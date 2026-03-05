import { vi, expect } from 'vitest';
import { e2eTest as test } from './utils/e2e';
import { id } from '../../src';

const throwIfFalse = (condition: boolean) => {
  if (!condition) throw new Error('Condition not met');
};

test('can make a subscribe query', async ({ db }) => {
  let data = {};
  const callback = vi.fn<(repsonse: Record<string, any[]>) => void>((resp) => {
    data = resp;
  });
  const cancel = db.subscribeInfiniteQuery({ todos: {} }, callback);

  expect(cancel).toBeTypeOf('function');
  expect.poll(() => expect(cancel).toHaveBeenCalled());
});

test('gets updates', async ({ db }) => {
  let data: Record<string, any> = {};
  const callback = vi.fn<(repsonse: Record<string, any[]>) => void>((resp) => {
    data = resp;
  });
  const cancel = db.subscribeInfiniteQuery({ todos: {} }, callback);

  await db.transact(db.tx.todos[id()].create({ title: 'new todo' }));

  expect.poll(() => expect(data.todos.length).toBeGreaterThan(0));

  console.log(data);
});
