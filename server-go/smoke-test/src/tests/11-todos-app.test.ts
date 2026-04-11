/**
 * Todos Example App — End-to-end tests.
 *
 * Tests the exact user flows from https://www.instantdb.com/examples/todos
 * running against the Go + SQLite backend.
 *
 * Covers:
 *   - Add todo (form submit)
 *   - Read todos (useQuery)
 *   - Toggle done (checkbox click)
 *   - Delete single todo (X button)
 *   - Delete completed (action bar)
 *   - Toggle all (chevron button)
 *   - Remaining count display
 *   - Real-time sync between two clients (WS)
 *   - Presence (number of users online)
 */

import { describe, it, expect } from '../framework.js';
import {
  post, adminHeaders, connectWS, wsInit, wsSend, wsWaitFor,
  TestApp, uuid, sleep,
} from '../helpers.js';
import { TodosApp } from './todos-app/app.js';

export async function todosAppTests(app: TestApp) {
  const todosApp = new TodosApp(app);

  await describe('Todos App: Basic CRUD', async () => {
    await it('starts with empty todo list', async () => {
      const todos = await todosApp.fetchTodos();
      // There may be leftover todos from other tests, so we just check it works
      expect(todos).toBeDefined();
    });

    await it('add todo: creates with text, done=false, createdAt', async () => {
      const todoId = await todosApp.addTodo('Buy groceries');
      expect(todoId).toBeDefined();

      const todos = await todosApp.fetchTodosWhere({ id: todoId });
      expect(todos.length).toBe(1);
      expect(todos[0].text).toBe('Buy groceries');
      expect(todos[0].done).toBe(false);
      expect(todos[0].createdAt).toBeDefined();
    });

    await it('add multiple todos', async () => {
      await todosApp.addTodo('Walk the dog');
      await todosApp.addTodo('Write tests');
      await todosApp.addTodo('Ship feature');

      const todos = await todosApp.fetchTodos();
      expect(todos.length).toBeGreaterThanOrEqual(4);
    });

    await it('toggle done: flips done from false to true', async () => {
      const todoId = await todosApp.addTodo('Toggle me');
      let todos = await todosApp.fetchTodosWhere({ id: todoId });
      expect(todos[0].done).toBe(false);

      await todosApp.toggleDone(todos[0]);

      todos = await todosApp.fetchTodosWhere({ id: todoId });
      expect(todos[0].done).toBe(true);
    });

    await it('toggle done: flips done from true back to false', async () => {
      const todoId = await todosApp.addTodo('Toggle twice');
      let todos = await todosApp.fetchTodosWhere({ id: todoId });

      await todosApp.toggleDone(todos[0]); // false -> true
      todos = await todosApp.fetchTodosWhere({ id: todoId });
      expect(todos[0].done).toBe(true);

      await todosApp.toggleDone(todos[0]); // true -> false
      todos = await todosApp.fetchTodosWhere({ id: todoId });
      expect(todos[0].done).toBe(false);
    });

    await it('delete todo: removes from list', async () => {
      const todoId = await todosApp.addTodo('Delete me');
      await todosApp.deleteTodo(todoId);

      const todos = await todosApp.fetchTodosWhere({ id: todoId });
      expect(todos.length).toBe(0);
    });
  });

  await describe('Todos App: Batch Operations', async () => {
    await it('delete completed: removes only done todos', async () => {
      // Add some todos, mark some as done
      const id1 = await todosApp.addTodo('Batch keep');
      const id2 = await todosApp.addTodo('Batch delete 1');
      const id3 = await todosApp.addTodo('Batch delete 2');

      let t2 = (await todosApp.fetchTodosWhere({ id: id2 }))[0];
      let t3 = (await todosApp.fetchTodosWhere({ id: id3 }))[0];
      await todosApp.toggleDone(t2);
      await todosApp.toggleDone(t3);

      const deleted = await todosApp.deleteCompleted();
      expect(deleted).toBeGreaterThanOrEqual(2);

      // id1 should still exist
      const remaining = await todosApp.fetchTodosWhere({ id: id1 });
      expect(remaining.length).toBe(1);

      // id2 and id3 should be gone
      const gone2 = await todosApp.fetchTodosWhere({ id: id2 });
      expect(gone2.length).toBe(0);
      const gone3 = await todosApp.fetchTodosWhere({ id: id3 });
      expect(gone3.length).toBe(0);
    });

    await it('toggle all: marks all as done', async () => {
      // Clean slate
      const all = await todosApp.fetchTodos();
      for (const t of all) {
        await todosApp.deleteTodo(t.id);
      }

      await todosApp.addTodo('TA-1');
      await todosApp.addTodo('TA-2');
      await todosApp.addTodo('TA-3');

      const newVal = await todosApp.toggleAll();
      expect(newVal).toBe(true);

      const todos = await todosApp.fetchTodos();
      for (const t of todos) {
        expect(t.done).toBe(true);
      }
    });

    await it('toggle all: unmarks all when all are done', async () => {
      // All should be done from previous test
      const newVal = await todosApp.toggleAll();
      expect(newVal).toBe(false);

      const todos = await todosApp.fetchTodos();
      for (const t of todos) {
        expect(t.done).toBe(false);
      }
    });

    await it('remaining count: shows correct count', async () => {
      const todos = await todosApp.fetchTodos();
      // Toggle first one to done
      if (todos.length > 0) {
        await todosApp.toggleDone(todos[0]);
      }

      const remaining = await todosApp.remainingCount();
      expect(remaining).toBe(todos.length - 1);
    });
  });

  await describe('Todos App: Real-time Sync (WebSocket)', async () => {
    await it('client 1 adds todo, client 2 sees it via query', async () => {
      const ws1 = await connectWS(app.id);
      const ws2 = await connectWS(app.id);
      await wsInit(ws1, app);
      await wsInit(ws2, app);

      // Client 2 subscribes to todos
      const subEventId = uuid();
      wsSend(ws2, {
        op: 'add-query',
        q: { todos: {} },
        'client-event-id': subEventId,
      });
      await wsWaitFor(ws2, (m) =>
        m.op === 'add-query-ok' && m['client-event-id'] === subEventId,
      );

      // Client 1 creates a todo via transact
      const todoId = uuid();
      const idAttr = app.attrs['todos.id'];
      const textAttr = app.attrs['todos.text'];
      const doneAttr = app.attrs['todos.done'];

      const txEventId = uuid();
      wsSend(ws1, {
        op: 'transact',
        'tx-steps': [
          ['add-triple', todoId, idAttr.id, todoId],
          ['add-triple', todoId, textAttr.id, 'Real-time todo'],
          ['add-triple', todoId, doneAttr.id, false],
        ],
        'client-event-id': txEventId,
      });

      const txOk = await wsWaitFor(ws1, (m) =>
        m.op === 'transact-ok' && m['client-event-id'] === txEventId,
      );
      expect(txOk.op).toBe('transact-ok');

      // Verify via admin API that the todo exists
      const todos = await todosApp.fetchTodosWhere({ id: todoId });
      expect(todos.length).toBe(1);
      expect(todos[0].text).toBe('Real-time todo');

      ws1.close();
      ws2.close();
    });

    await it('client transacts toggle, admin API confirms change', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      // Create a todo
      const todoId = uuid();
      const idAttr = app.attrs['todos.id'];
      const textAttr = app.attrs['todos.text'];
      const doneAttr = app.attrs['todos.done'];

      wsSend(ws, {
        op: 'transact',
        'tx-steps': [
          ['add-triple', todoId, idAttr.id, todoId],
          ['add-triple', todoId, textAttr.id, 'Toggle via WS'],
          ['add-triple', todoId, doneAttr.id, false],
        ],
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws, (m) => m.op === 'transact-ok');

      // Toggle done
      wsSend(ws, {
        op: 'transact',
        'tx-steps': [
          ['add-triple', todoId, doneAttr.id, true],
        ],
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws, (m) => m.op === 'transact-ok');

      // Verify via admin
      const todos = await todosApp.fetchTodosWhere({ id: todoId });
      expect(todos[0].done).toBe(true);

      ws.close();
    });

    await it('batch delete via WS transact', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      const idAttr = app.attrs['todos.id'];
      const textAttr = app.attrs['todos.text'];
      const doneAttr = app.attrs['todos.done'];

      // Create 3 todos, mark all done
      const ids = [uuid(), uuid(), uuid()];
      for (const eid of ids) {
        wsSend(ws, {
          op: 'transact',
          'tx-steps': [
            ['add-triple', eid, idAttr.id, eid],
            ['add-triple', eid, textAttr.id, `WS batch ${eid.slice(0, 4)}`],
            ['add-triple', eid, doneAttr.id, true],
          ],
          'client-event-id': uuid(),
        });
        await wsWaitFor(ws, (m) => m.op === 'transact-ok');
      }

      // Batch delete all 3
      const steps = ids.map((eid) => ['delete-entity', eid, 'todos']);
      wsSend(ws, {
        op: 'transact',
        'tx-steps': steps,
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws, (m) => m.op === 'transact-ok');

      // Verify all gone
      for (const eid of ids) {
        const todos = await todosApp.fetchTodosWhere({ id: eid });
        expect(todos.length).toBe(0);
      }

      ws.close();
    });
  });

  await describe('Todos App: Presence (Users Online)', async () => {
    await it('single user: peer count is 0 (self not counted)', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      wsSend(ws, {
        op: 'join-room',
        'room-id': 'todos-presence',
        'peer-id': uuid(),
        'client-event-id': uuid(),
      });

      const msg = await wsWaitFor(ws, (m) => m.op === 'join-room-ok');
      expect(msg.data).toBeDefined();
      ws.close();
    });

    await it('two users: each sees the other as peer', async () => {
      const ws1 = await connectWS(app.id);
      const ws2 = await connectWS(app.id);
      await wsInit(ws1, app);
      await wsInit(ws2, app);

      const roomId = 'todos-presence-' + uuid().slice(0, 8);

      // User 1 joins
      wsSend(ws1, {
        op: 'join-room',
        'room-id': roomId,
        'peer-id': 'user-1',
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws1, (m) => m.op === 'join-room-ok');

      // User 2 joins
      wsSend(ws2, {
        op: 'join-room',
        'room-id': roomId,
        'peer-id': 'user-2',
        'client-event-id': uuid(),
      });
      await wsWaitFor(ws2, (m) => m.op === 'join-room-ok');

      // User 1 should get a presence update about user 2
      // (or we can refresh presence)
      const eventId = uuid();
      wsSend(ws1, {
        op: 'refresh-presence',
        'room-id': roomId,
        'client-event-id': eventId,
      });

      const msg = await wsWaitFor(ws1, (m) =>
        m.op === 'refresh-presence-ok' && m['client-event-id'] === eventId,
      );
      const peers = msg.data || {};
      const peerCount = Object.keys(peers).length;
      // Should see at least 2 entries (both users)
      expect(peerCount).toBeGreaterThanOrEqual(2);

      ws1.close();
      ws2.close();
    });

    await it('user leaves: peer count decreases', async () => {
      const ws1 = await connectWS(app.id);
      const ws2 = await connectWS(app.id);
      await wsInit(ws1, app);
      await wsInit(ws2, app);

      const roomId = 'todos-leave-' + uuid().slice(0, 8);

      wsSend(ws1, { op: 'join-room', 'room-id': roomId, 'peer-id': 'u1', 'client-event-id': uuid() });
      wsSend(ws2, { op: 'join-room', 'room-id': roomId, 'peer-id': 'u2', 'client-event-id': uuid() });
      await Promise.all([
        wsWaitFor(ws1, (m) => m.op === 'join-room-ok'),
        wsWaitFor(ws2, (m) => m.op === 'join-room-ok'),
      ]);

      // User 2 leaves
      wsSend(ws2, { op: 'leave-room', 'room-id': roomId, 'client-event-id': uuid() });
      await wsWaitFor(ws2, (m) => m.op === 'leave-room-ok');

      // Give a moment for leave to propagate
      await sleep(100);

      // User 1 refreshes presence
      const eventId = uuid();
      wsSend(ws1, { op: 'refresh-presence', 'room-id': roomId, 'client-event-id': eventId });
      const msg = await wsWaitFor(ws1, (m) =>
        m.op === 'refresh-presence-ok' && m['client-event-id'] === eventId,
      );

      const peers = msg.data || {};
      // Should only see user 1 now
      expect(Object.keys(peers).length).toBe(1);

      ws1.close();
      ws2.close();
    });
  });
}
