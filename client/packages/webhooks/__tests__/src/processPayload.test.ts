import { describe, test, expect, vi } from 'vitest';
import { i } from '@instantdb/core';
import { Webhooks, type WebhookPayload } from '../../src/index';

const schema = i.schema({
  entities: {
    posts: i.entity({ title: i.string() }),
    comments: i.entity({ body: i.string() }),
  },
});

type Schema = typeof schema;

function makeWebhooks() {
  return new Webhooks<Schema>({ appId: 'app', adminToken: 'tok', schema });
}

function record(
  etype: 'posts' | 'comments',
  action: 'create' | 'update' | 'delete',
  id = 'r1',
) {
  return {
    etype,
    id,
    action,
    before: action === 'create' ? null : { id, title: 'b', body: 'b' },
    after: action === 'delete' ? null : { id, title: 'a', body: 'a' },
    idempotencyKey: `${etype}-${action}-${id}`,
  };
}

function payload(records: any[]): WebhookPayload<Schema> {
  return { data: records, idempotencyKey: 'k' };
}

describe('processPayload dispatch precedence', () => {
  test('exact etype+action wins over etype $default and top-level $default', async () => {
    const wh = makeWebhooks();
    const exact = vi.fn();
    const etypeDefault = vi.fn();
    const topDefault = vi.fn();

    await wh.processPayload(
      {
        posts: { create: exact, $default: etypeDefault },
        $default: topDefault,
      },
      payload([record('posts', 'create')]),
    );

    expect(exact).toHaveBeenCalledTimes(1);
    expect(etypeDefault).not.toHaveBeenCalled();
    expect(topDefault).not.toHaveBeenCalled();
  });

  test('etype $default wins over top-level $default when no exact handler', async () => {
    const wh = makeWebhooks();
    const etypeDefault = vi.fn();
    const topDefault = vi.fn();

    await wh.processPayload(
      {
        posts: { $default: etypeDefault },
        $default: topDefault,
      },
      payload([record('posts', 'update')]),
    );

    expect(etypeDefault).toHaveBeenCalledTimes(1);
    expect(topDefault).not.toHaveBeenCalled();
  });

  test('top-level $default catches records with no etype match', async () => {
    const wh = makeWebhooks();
    const topDefault = vi.fn();

    await wh.processPayload(
      {
        posts: { create: vi.fn() },
        $default: topDefault,
      },
      payload([record('comments', 'delete')]),
    );

    expect(topDefault).toHaveBeenCalledTimes(1);
    expect(topDefault.mock.calls[0][0].etype).toBe('comments');
  });

  test('records with no matching handler are skipped without error', async () => {
    const wh = makeWebhooks();
    const postsCreate = vi.fn();

    await expect(
      wh.processPayload(
        { posts: { create: postsCreate } },
        payload([
          record('posts', 'create', 'a'),
          record('posts', 'update', 'b'),
          record('comments', 'delete', 'c'),
        ]),
      ),
    ).resolves.toBeUndefined();

    expect(postsCreate).toHaveBeenCalledTimes(1);
    expect(postsCreate.mock.calls[0][0].id).toBe('a');
  });

  test('each record routes to its own most-specific handler', async () => {
    const wh = makeWebhooks();
    const postsCreate = vi.fn();
    const postsDefault = vi.fn();
    const topDefault = vi.fn();

    await wh.processPayload(
      {
        posts: { create: postsCreate, $default: postsDefault },
        $default: topDefault,
      },
      payload([
        record('posts', 'create', 'a'),
        record('posts', 'update', 'b'),
        record('comments', 'delete', 'c'),
      ]),
    );

    expect(postsCreate).toHaveBeenCalledTimes(1);
    expect(postsCreate.mock.calls[0][0].id).toBe('a');
    expect(postsDefault).toHaveBeenCalledTimes(1);
    expect(postsDefault.mock.calls[0][0].id).toBe('b');
    expect(topDefault).toHaveBeenCalledTimes(1);
    expect(topDefault.mock.calls[0][0].id).toBe('c');
  });

  test('rejects when any handler rejects', async () => {
    const wh = makeWebhooks();
    const ok = vi.fn().mockResolvedValue(undefined);
    const bad = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(
      wh.processPayload(
        { posts: { create: ok, update: bad } },
        payload([
          record('posts', 'create', 'a'),
          record('posts', 'update', 'b'),
        ]),
      ),
    ).rejects.toThrow('boom');

    expect(ok).toHaveBeenCalledTimes(1);
    expect(bad).toHaveBeenCalledTimes(1);
  });
});
