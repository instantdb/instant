import { describe, test, expect } from 'vitest';
import { i } from '@instantdb/core';
import { Webhooks, type WebhookHandlers } from '../../src/index';

const schema = i.schema({
  entities: {
    posts: i.entity({ title: i.string() }),
    comments: i.entity({ body: i.string() }),
  },
});

type Schema = typeof schema;

const { typedHandlers, combineHandlers } = Webhooks.helpers<Schema>();

describe('typedHandlers', () => {
  test('builds a single namespace.action entry', () => {
    const fn = () => {};
    expect(typedHandlers('posts', 'create', fn)).toEqual({
      posts: { create: fn },
    });
  });

  test('builds a namespace $default entry', () => {
    const fn = () => {};
    expect(typedHandlers('posts', '$default', fn)).toEqual({
      posts: { $default: fn },
    });
  });

  test('builds a top-level $default entry', () => {
    const fn = () => {};
    expect(typedHandlers('$default', fn)).toEqual({ $default: fn });
  });
});

describe('combineHandlers', () => {
  test('merges entries for different namespaces', () => {
    const onPostCreate = () => {};
    const onCommentDelete = () => {};

    const handlers = combineHandlers(
      typedHandlers('posts', 'create', onPostCreate),
      typedHandlers('comments', 'delete', onCommentDelete),
    );

    expect(handlers).toEqual({
      posts: { create: onPostCreate },
      comments: { delete: onCommentDelete },
    });
  });

  test('merges actions within the same namespace', () => {
    const onCreate = () => {};
    const onUpdate = () => {};
    const onNamespaceDefault = () => {};

    const handlers = combineHandlers(
      typedHandlers('posts', 'create', onCreate),
      typedHandlers('posts', 'update', onUpdate),
      typedHandlers('posts', '$default', onNamespaceDefault),
    );

    expect(handlers).toEqual({
      posts: {
        create: onCreate,
        update: onUpdate,
        $default: onNamespaceDefault,
      },
    });
  });

  test('later entries override earlier ones for the same namespace.action', () => {
    const first = () => {};
    const second = () => {};

    const handlers = combineHandlers(
      typedHandlers('posts', 'create', first),
      typedHandlers('posts', 'create', second),
    );

    expect(handlers.posts!.create).toBe(second);
  });

  test('later top-level $default replaces earlier one wholesale', () => {
    const firstDefault = () => {};
    const secondDefault = () => {};

    const handlers = combineHandlers(
      typedHandlers('$default', firstDefault),
      typedHandlers('$default', secondDefault),
    );

    expect(handlers.$default).toBe(secondDefault);
  });

  test('top-level $default does not affect per-namespace handlers', () => {
    const onPostCreate = () => {};
    const topDefault = () => {};

    const handlers = combineHandlers(
      typedHandlers('posts', 'create', onPostCreate),
      typedHandlers('$default', topDefault),
    );

    expect(handlers).toEqual({
      posts: { create: onPostCreate },
      $default: topDefault,
    });
  });

  test('accepts a pre-built WebhookHandlers map', () => {
    const onPostCreate = () => {};
    const onCommentDefault = () => {};

    const prebuilt: WebhookHandlers<Schema> = {
      posts: { create: onPostCreate },
    };

    const handlers = combineHandlers(
      prebuilt,
      typedHandlers('comments', '$default', onCommentDefault),
    );

    expect(handlers).toEqual({
      posts: { create: onPostCreate },
      comments: { $default: onCommentDefault },
    });
  });

  test('returns an empty object when given no entries', () => {
    expect(combineHandlers()).toEqual({});
  });
});
