/** InstaQL query smoke tests. */
import { describe, it, expect } from '../framework.js';
import {
  post, adminHeaders, connectWS, wsInit, wsSend, wsWaitFor,
  TestApp, uuid, sleep,
} from '../helpers.js';

export async function queryTests(app: TestApp) {
  // Seed data via admin API
  const idAttr = app.attrs['todos.id'];
  const textAttr = app.attrs['todos.text'];
  const doneAttr = app.attrs['todos.done'];
  const priorityAttr = app.attrs['todos.priority'];
  const createdAtAttr = app.attrs['todos.createdAt'];

  const todoIds = Array.from({ length: 5 }, () => uuid());
  const headers = adminHeaders(app);

  for (let i = 0; i < 5; i++) {
    await post('/admin/transact', {
      steps: [
        ['add-triple', todoIds[i], idAttr.id, todoIds[i]],
        ['add-triple', todoIds[i], textAttr.id, `Todo ${i}`],
        ['add-triple', todoIds[i], doneAttr.id, i % 2 === 0],
        ['add-triple', todoIds[i], priorityAttr.id, i + 1],
        ['add-triple', todoIds[i], createdAtAttr.id, Date.now() + i * 1000],
      ],
    }, headers);
  }

  await describe('InstaQL Queries', async () => {
    await it('basic query: fetch all todos', async () => {
      const data = await post('/admin/query', { query: { todos: {} } }, headers);
      expect(data.todos).toBeDefined();
      expect(data.todos.length).toBeGreaterThanOrEqual(5);
    });

    await it('where: equality filter', async () => {
      const data = await post('/admin/query', {
        query: { todos: { $: { where: { text: 'Todo 0' } } } },
      }, headers);
      expect(data.todos.length).toBe(1);
      expect(data.todos[0].text).toBe('Todo 0');
    });

    await it('where: $gt filter', async () => {
      const data = await post('/admin/query', {
        query: { todos: { $: { where: { priority: { $gt: 3 } } } } },
      }, headers);
      expect(data.todos.length).toBeGreaterThanOrEqual(2);
    });

    await it('where: $lte filter', async () => {
      const data = await post('/admin/query', {
        query: { todos: { $: { where: { priority: { $lte: 2 } } } } },
      }, headers);
      expect(data.todos.length).toBeGreaterThanOrEqual(2);
    });

    await it('where: $ne filter', async () => {
      const data = await post('/admin/query', {
        query: { todos: { $: { where: { text: { $ne: 'Todo 0' } } } } },
      }, headers);
      for (const t of data.todos) {
        expect(t.text !== 'Todo 0').toBeTruthy();
      }
    });

    await it('where: $like filter', async () => {
      const data = await post('/admin/query', {
        query: { todos: { $: { where: { text: { $like: 'Todo%' } } } } },
      }, headers);
      expect(data.todos.length).toBeGreaterThanOrEqual(5);
    });

    await it('where: $isNull filter', async () => {
      const data = await post('/admin/query', {
        query: { todos: { $: { where: { text: { $isNull: false } } } } },
      }, headers);
      expect(data.todos.length).toBeGreaterThanOrEqual(5);
    });

    await it('limit and offset', async () => {
      const data = await post('/admin/query', {
        query: { todos: { $: { limit: 2 } } },
      }, headers);
      expect(data.todos.length).toBe(2);
    });

    await it('aggregate count', async () => {
      const data = await post('/admin/query', {
        query: { todos: { $: { aggregate: 'count' } } },
      }, headers);
      expect(data.todos.aggregate).toBeDefined();
      expect(data.todos.aggregate.count).toBeGreaterThanOrEqual(5);
    });

    await it('WS: add-query returns InstaQL tree', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      const eventId = uuid();
      wsSend(ws, {
        op: 'add-query',
        q: { todos: {} },
        'client-event-id': eventId,
      });

      const msg = await wsWaitFor(ws, (m) =>
        m.op === 'add-query-ok' && m['client-event-id'] === eventId,
      );
      expect(msg.result).toBeDefined();
      expect(Array.isArray(msg.result)).toBeTruthy();
      ws.close();
    });

    await it('WS: add-query with where filter', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      const eventId = uuid();
      wsSend(ws, {
        op: 'add-query',
        q: { todos: { $: { where: { done: true } } } },
        'client-event-id': eventId,
      });

      const msg = await wsWaitFor(ws, (m) =>
        m.op === 'add-query-ok' && m['client-event-id'] === eventId,
      );
      expect(msg.result).toBeDefined();
      ws.close();
    });
  });
}
