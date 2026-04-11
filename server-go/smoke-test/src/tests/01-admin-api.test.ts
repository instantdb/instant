/** Admin REST API smoke tests. */
import { describe, it, expect } from '../framework.js';
import { get, post, del, adminHeaders, TestApp } from '../helpers.js';

export async function adminAPITests(app: TestApp) {
  await describe('Admin REST API', async () => {
    await it('GET /health returns ok', async () => {
      const data = await get('/health');
      expect(data.status).toBe('ok');
    });

    await it('GET /admin/apps returns app info', async () => {
      const data = await get(`/admin/apps?app_id=${app.id}`, adminHeaders(app));
      expect(data.app).toBeDefined();
      expect(data.app.id).toBe(app.id);
    });

    await it('GET /admin/schema returns attrs', async () => {
      const data = await get(`/admin/schema?app_id=${app.id}`, adminHeaders(app));
      expect(data.attrs).toBeDefined();
      expect(data.attrs.length).toBeGreaterThan(0);
    });

    await it('POST /admin/query executes InstaQL', async () => {
      const data = await post('/admin/query', { query: { todos: {} } }, adminHeaders(app));
      expect(data.todos).toBeDefined();
    });

    await it('POST /admin/transact creates data', async () => {
      const idAttr = app.attrs['todos.id'];
      const textAttr = app.attrs['todos.text'];
      const todoId = crypto.randomUUID();

      const data = await post('/admin/transact', {
        steps: [
          ['add-triple', todoId, idAttr.id, todoId],
          ['add-triple', todoId, textAttr.id, 'Admin API todo'],
        ],
      }, adminHeaders(app));
      expect(data.status).toBe('ok');
    });

    await it('POST /admin/query returns created data', async () => {
      const data = await post('/admin/query', { query: { todos: {} } }, adminHeaders(app));
      expect(data.todos.length).toBeGreaterThan(0);
    });

    await it('POST /admin/rules sets permission rules', async () => {
      const data = await post('/admin/rules', {
        code: {
          todos: {
            allow: {
              view: 'true',
              create: 'auth.id != null',
              update: 'auth.id != null',
              delete: 'auth.id != null',
            },
          },
        },
      }, adminHeaders(app));
      expect(data.status).toBe('ok');
    });

    await it('GET /admin/rules returns rules', async () => {
      const data = await get(`/admin/rules?app_id=${app.id}`, adminHeaders(app));
      expect(data.rules).toBeDefined();
    });

    await it('POST /admin/users creates a user', async () => {
      const data = await post('/admin/users', { email: 'smoke@test.com' }, adminHeaders(app));
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe('smoke@test.com');
    });

    await it('GET /admin/users lists users', async () => {
      const data = await get(`/admin/users?app_id=${app.id}`, adminHeaders(app));
      expect(data.users).toBeDefined();
      expect(data.users.length).toBeGreaterThan(0);
    });

    await it('DELETE /admin/users deletes a user', async () => {
      const createData = await post('/admin/users', { email: 'delete-me@test.com' }, adminHeaders(app));
      const data = await del('/admin/users', { 'user-id': createData.user.id }, adminHeaders(app));
      expect(data.status).toBe('ok');
    });
  });
}
