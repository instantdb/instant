import { expect } from 'vitest';
import { e2eTest as test } from './utils/e2e';

test('can make a query', async ({ db }) => {
  const result = await db.queryOnce({ todos: {} });

  document.body.innerHTML = '<h1>Hello</h1>';

  expect(result.data.todos.length).toBe(0);
});
