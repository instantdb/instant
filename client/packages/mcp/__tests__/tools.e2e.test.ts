import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { PlatformApi } from '@instantdb/platform';
import { handleQuery, handleTransact } from '../src/tools.ts';

const API_URL = process.env.INSTANT_API_URL || 'https://api.instantdb.com';

async function createTempApp(): Promise<{
  appId: string;
  api: PlatformApi;
}> {
  const response = await fetch(`${API_URL}/dash/apps/ephemeral`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'mcp-tools-test' }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to create ephemeral app: ${response.status} ${await response.text()}`,
    );
  }
  const { app } = await response.json();
  return {
    appId: app.id,
    api: new PlatformApi({ auth: { token: app['admin-token'] } }),
  };
}

describe.concurrent('MCP tools e2e', { timeout: 10_000 }, () => {
  describe('query', () => {
    it('returns empty results for a fresh app', async () => {
      const { appId, api } = await createTempApp();
      const result = await handleQuery(api, appId, { $users: {} });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.$users).toEqual([]);
    });

    it('returns data after transacting', async () => {
      const { appId, api } = await createTempApp();
      const todoId = randomUUID();

      await handleTransact(api, appId, [
        ['update', 'todos', todoId, { title: 'Buy milk', done: false }],
      ]);

      const result = await handleQuery(api, appId, { todos: {} });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.todos).toHaveLength(1);
      expect(data.todos[0].title).toBe('Buy milk');
      expect(data.todos[0].done).toBe(false);
    });

    it('supports where clauses', async () => {
      const { appId, api } = await createTempApp();

      await handleTransact(api, appId, [
        ['update', 'todos', randomUUID(), { title: 'Buy milk', done: false }],
        ['update', 'todos', randomUUID(), { title: 'Walk dog', done: true }],
      ]);

      const result = await handleQuery(api, appId, {
        todos: { $: { where: { done: true } } },
      });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.todos).toHaveLength(1);
      expect(data.todos[0].title).toBe('Walk dog');
    });

    it('returns error for bad credentials', async () => {
      const badApi = new PlatformApi({ auth: { token: randomUUID() } });
      const result = await handleQuery(badApi, randomUUID(), {
        todos: {},
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error');
    });
  });

  describe('transact', () => {
    it('creates entities', async () => {
      const { appId, api } = await createTempApp();
      const result = await handleTransact(api, appId, [
        ['update', 'posts', randomUUID(), { title: 'Hello world' }],
      ]);

      expect(result.isError).toBeFalsy();
    });

    it('links entities', async () => {
      const { appId, api } = await createTempApp();
      const postId = randomUUID();
      const commentId = randomUUID();

      await handleTransact(api, appId, [
        ['update', 'posts', postId, { title: 'My post' }],
        ['update', 'comments', commentId, { text: 'Great!' }],
        ['link', 'posts', postId, { comments: commentId }],
      ]);

      const result = await handleQuery(api, appId, {
        posts: { comments: {} },
      });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.posts).toHaveLength(1);
      expect(data.posts[0].comments).toHaveLength(1);
      expect(data.posts[0].comments[0].text).toBe('Great!');
    });

    it('deletes entities', async () => {
      const { appId, api } = await createTempApp();
      const todoId = randomUUID();

      await handleTransact(api, appId, [
        ['update', 'todos', todoId, { title: 'Temp' }],
      ]);

      await handleTransact(api, appId, [['delete', 'todos', todoId]]);

      const result = await handleQuery(api, appId, { todos: {} });
      const data = JSON.parse(result.content[0].text);
      expect(data.todos).toEqual([]);
    });

    it('returns error for bad credentials', async () => {
      const badApi = new PlatformApi({ auth: { token: randomUUID() } });
      const result = await handleTransact(badApi, randomUUID(), [
        ['update', 'todos', randomUUID(), { title: 'Nope' }],
      ]);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error');
    });
  });
});
