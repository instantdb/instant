/** Schema and permissions smoke tests. */
import { describe, it, expect } from '../framework.js';
import { post, get, adminHeaders, TestApp, uuid } from '../helpers.js';

export async function schemaTests(app: TestApp) {
  const headers = adminHeaders(app);

  await describe('Schema & Permissions', async () => {
    await it('push schema creates attrs', async () => {
      const data = await post('/admin/schema', {
        schema: {
          entities: {
            categories: {
              attrs: {
                id: { unique: true, indexed: true },
                name: {},
                color: {},
              },
            },
          },
        },
      }, headers);
      expect(data.status).toBe('ok');
      expect(data.attrs).toBeDefined();

      const nameAttr = data.attrs.find((a: any) =>
        a['forward-identity'][1] === 'categories' && a['forward-identity'][2] === 'name',
      );
      expect(nameAttr).toBeDefined();
    });

    await it('push schema with links', async () => {
      const data = await post('/admin/schema', {
        schema: {
          entities: {
            authors: {
              attrs: {
                id: { unique: true, indexed: true },
                name: {},
              },
            },
            books: {
              attrs: {
                id: { unique: true, indexed: true },
                title: {},
              },
            },
          },
          links: {
            authorBooks: {
              forward: { on: 'authors', has: 'many', label: 'books' },
              reverse: { on: 'books', has: 'one', label: 'author' },
            },
          },
        },
      }, headers);
      expect(data.status).toBe('ok');
    });

    await it('push schema with unique and indexed attrs', async () => {
      const data = await post('/admin/schema', {
        schema: {
          entities: {
            emails: {
              attrs: {
                id: { unique: true, indexed: true },
                address: { unique: true, indexed: true },
                verified: {},
              },
            },
          },
        },
      }, headers);

      const addrAttr = data.attrs.find((a: any) =>
        a['forward-identity'][1] === 'emails' && a['forward-identity'][2] === 'address',
      );
      expect(addrAttr).toBeDefined();
      expect(addrAttr['unique?']).toBe(true);
      expect(addrAttr['index?']).toBe(true);
    });

    await it('set and get rules', async () => {
      const rules = {
        todos: {
          allow: {
            view: 'true',
            create: "auth.id != null",
            update: "data.creatorId == auth.id",
            delete: "false",
          },
        },
        projects: {
          allow: {
            '$default': "auth.id != null",
          },
        },
      };

      await post('/admin/rules', { code: rules }, headers);

      const data = await get(`/admin/rules?app_id=${app.id}`, headers);
      expect(data.rules).toBeDefined();
      const parsed = typeof data.rules === 'string' ? JSON.parse(data.rules) : data.rules;
      expect(parsed.todos).toBeDefined();
      expect(parsed.todos.allow.view).toBe('true');
      expect(parsed.todos.allow.delete).toBe('false');
    });

    await it('get schema returns all attrs', async () => {
      const data = await get(`/admin/schema?app_id=${app.id}`, headers);
      expect(data.attrs).toBeDefined();
      expect(data.attrs.length).toBeGreaterThan(5);

      // Verify attr structure
      const first = data.attrs[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('forward-identity');
      expect(first).toHaveProperty('value-type');
      expect(first).toHaveProperty('cardinality');
    });
  });
}
