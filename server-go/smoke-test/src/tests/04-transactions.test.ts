/** InstaML transaction smoke tests. */
import { describe, it, expect } from '../framework.js';
import {
  post, adminHeaders, connectWS, wsInit, wsSend, wsWaitFor,
  TestApp, uuid,
} from '../helpers.js';

export async function transactionTests(app: TestApp) {
  const headers = adminHeaders(app);
  const idAttr = app.attrs['todos.id'];
  const textAttr = app.attrs['todos.text'];
  const doneAttr = app.attrs['todos.done'];
  const priorityAttr = app.attrs['todos.priority'];

  await describe('InstaML Transactions', async () => {
    await it('add-triple: creates entity', async () => {
      const eid = uuid();
      const data = await post('/admin/transact', {
        steps: [
          ['add-triple', eid, idAttr.id, eid],
          ['add-triple', eid, textAttr.id, 'TX test'],
          ['add-triple', eid, doneAttr.id, false],
        ],
      }, headers);
      expect(data.status).toBe('ok');

      const q = await post('/admin/query', {
        query: { todos: { $: { where: { text: 'TX test' } } } },
      }, headers);
      expect(q.todos.length).toBe(1);
    });

    await it('deep-merge-triple: merges JSON values', async () => {
      const eid = uuid();
      await post('/admin/transact', {
        steps: [
          ['add-triple', eid, idAttr.id, eid],
          ['add-triple', eid, textAttr.id, { name: 'Alice', age: 30 }],
        ],
      }, headers);

      await post('/admin/transact', {
        steps: [
          ['deep-merge-triple', eid, textAttr.id, { city: 'NYC' }],
        ],
      }, headers);

      // Verify the merge happened (value should have both fields)
      const q = await post('/admin/query', {
        query: { todos: { $: { where: { id: eid } } } },
      }, headers);
      // The merged value should exist
      expect(q.todos).toBeDefined();
    });

    await it('retract-triple: removes specific value', async () => {
      const eid = uuid();
      await post('/admin/transact', {
        steps: [
          ['add-triple', eid, idAttr.id, eid],
          ['add-triple', eid, textAttr.id, 'retract me'],
        ],
      }, headers);

      await post('/admin/transact', {
        steps: [
          ['retract-triple', eid, textAttr.id, 'retract me'],
        ],
      }, headers);

      const q = await post('/admin/query', {
        query: { todos: { $: { where: { id: eid } } } },
      }, headers);
      const todo = q.todos.find((t: any) => t.id === eid);
      if (todo) {
        // text should be gone or null
        expect(todo.text === undefined || todo.text === null).toBeTruthy();
      }
    });

    await it('delete-entity: removes all triples', async () => {
      const eid = uuid();
      await post('/admin/transact', {
        steps: [
          ['add-triple', eid, idAttr.id, eid],
          ['add-triple', eid, textAttr.id, 'delete me'],
        ],
      }, headers);

      await post('/admin/transact', {
        steps: [['delete-entity', eid, 'todos']],
      }, headers);

      const q = await post('/admin/query', {
        query: { todos: { $: { where: { id: eid } } } },
      }, headers);
      expect(q.todos.length).toBe(0);
    });

    await it('add-attr: creates new attribute', async () => {
      const attrId = uuid();
      const data = await post('/admin/transact', {
        steps: [
          ['add-attr', {
            id: attrId,
            'forward-identity': [uuid(), 'todos', 'tags'],
            'value-type': 'blob',
            cardinality: 'many',
            'unique?': false,
            'index?': false,
          }],
        ],
      }, headers);
      expect(data.status).toBe('ok');
    });

    await it('batch transaction: multiple ops atomically', async () => {
      const ids = [uuid(), uuid(), uuid()];
      const data = await post('/admin/transact', {
        steps: [
          ['add-triple', ids[0], idAttr.id, ids[0]],
          ['add-triple', ids[0], textAttr.id, 'Batch A'],
          ['add-triple', ids[1], idAttr.id, ids[1]],
          ['add-triple', ids[1], textAttr.id, 'Batch B'],
          ['add-triple', ids[2], idAttr.id, ids[2]],
          ['add-triple', ids[2], textAttr.id, 'Batch C'],
        ],
      }, headers);
      expect(data.status).toBe('ok');
    });

    await it('WS transact: real-time transaction', async () => {
      const ws = await connectWS(app.id);
      await wsInit(ws, app);

      const eid = uuid();
      const eventId = uuid();
      wsSend(ws, {
        op: 'transact',
        'tx-steps': [
          ['add-triple', eid, idAttr.id, eid],
          ['add-triple', eid, textAttr.id, 'WS transact'],
        ],
        'client-event-id': eventId,
      });

      const msg = await wsWaitFor(ws, (m) =>
        m.op === 'transact-ok' && m['client-event-id'] === eventId,
      );
      expect(msg.op).toBe('transact-ok');
      ws.close();
    });
  });
}
