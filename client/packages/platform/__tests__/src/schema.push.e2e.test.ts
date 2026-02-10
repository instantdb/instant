import { describe, expect, test } from 'vitest';
import { PlatformApi, i } from '../../src/index';

describe.concurrent('schemaPush e2e', () => {
  test('overwrite: handles validation errors', async () => {
    const initialSchema = i.schema({
      entities: {
        posts: i.entity({
          name: i.string(),
          details: i.string(),
        }),
      },
    });
    
    const tempApi = new PlatformApi({});
    const { app } = await tempApi.createTemporaryApp({
      schema: initialSchema,
      title: 'tempApp',
    });
    
    const overwriteSchema = i.schema({
      entities: {
        posts: i.entity({
          title: i.string(),
          slug: i.string(),
        }),
      },
    });
    const appApi = new PlatformApi({ auth: { token: app.adminToken } });
    await expect(
      appApi.planSchemaPush(app.id, {
        schema: overwriteSchema,
        // @ts-expect-error
        renames: ['posts.name:posts.title'],
      }),
    ).rejects.toThrowError(
      'If you pass in `renames`, you _must_ pass in `overwrite: true`',
    );
    
    await expect(
      appApi.planSchemaPush(app.id, {
        schema: overwriteSchema,
        overwrite: true,
        // @ts-expect-error
        renames: ['posts.nameposts.title'],
      }),
    ).rejects.toThrowError(
      "Invalid rename command: posts.nameposts.title. We could not parse a distinct 'from' and 'to'. The structure should look like 'from:to'. For example: 'posts.name:posts.title'"
    );
  });


  test('planSchemaPush: normal flow ignores deletes & renames', async () => {
    const initialSchema = i.schema({
      entities: {
        posts: i.entity({
          name: i.string(),
        }),
      },
    });
    const tempApi = new PlatformApi({});
    const { app } = await tempApi.createTemporaryApp({
      schema: initialSchema,
      title: 'tempApp',
    });

    const additiveSchema = i.schema({
      entities: {
        posts: i.entity({
          title: i.string(),
          slug: i.string(),
        }),
      },
    });
    
    const appApi = new PlatformApi({ auth: { token: app.adminToken } });
    const plan = await appApi.planSchemaPush(app.id, {
      schema: additiveSchema,
    });
    const friendlyDescs = new Set(plan.steps.map((s) => s.friendlyDescription));
    expect(friendlyDescs).toEqual(
      new Set(['Add attribute posts.slug.', 'Add attribute posts.title.']),
    );
  });

  test('planSchemaPush: overwrite flow handles deletes and renames', async () => {
    const initialSchema = i.schema({
      entities: {
        comments: i.entity({ 
          body: i.string(),
        }),
        posts: i.entity({
          name: i.string(),
          details: i.string(),
        }),
      },
      links: {
        postComments: {
          forward: { on: 'posts', has:'many', label: 'comments'}, 
          reverse: { on: "comments", has: 'many', label: 'posts'}
        },
        postParents: {
          forward: { on: 'posts', has:'many', label: 'parentPosts'}, 
          reverse: { on: "posts", has: 'many', label: 'childPosts'}
        }
      }
    });

    const tempApi = new PlatformApi({});
    const { app } = await tempApi.createTemporaryApp({
      schema: initialSchema,
      title: 'tempApp',
    });

    const overwriteSchema = i.schema({
      entities: {
        comments: i.entity({ 
          body: i.string(),
        }),
        posts: i.entity({
          title: i.string(),
          slug: i.string(),
        }),
      },
      links: {
        postComments: {
          forward: { on: 'posts', has: 'many', label: 'ownComments'}, 
          reverse: { on: "comments", has: 'many', label: 'posts'}
        },
        postParents: {
          forward: { on: 'posts', has:'many', label: 'parentPosts'}, 
          reverse: { on: "posts", has: 'many', label: 'childPosts'}
        }
      }
    });
    const appApi = new PlatformApi({ auth: { token: app.adminToken } });
    const res = await appApi.planSchemaPush(app.id, {
      schema: overwriteSchema,
      overwrite: true,
      renames: ['posts.name:posts.title', 'posts.comments:post.ownComments'],
    });
    const friendlyDescs = new Set(res.steps.map((s) => s.friendlyDescription));
    expect(friendlyDescs).toEqual(
      new Set([
        'Add attribute posts.slug.',
        'Make posts.slug a required attribute.',
        'Update attribute posts.title.',
        'Delete attribute posts.details.',
      ]),
    );
  });

  test('schemaPush: overwrite flow handles deletes and renames', async () => {
    const initialSchema = i.schema({
      entities: {
        posts: i.entity({
          name: i.string(),
          details: i.string(),
        }),
      },
    });
    expect(1).toEqual(1);
    const tempApi = new PlatformApi({});
    const { app } = await tempApi.createTemporaryApp({
      schema: initialSchema,
      title: 'tempApp',
    });

    const overwriteSchema = i.schema({
      entities: {
        posts: i.entity({
          title: i.string(),
          slug: i.string(),
        }),
      },
    });
    const appApi = new PlatformApi({ auth: { token: app.adminToken } });
    const plan = await appApi.schemaPush(app.id, {
      schema: overwriteSchema,
      overwrite: true,
      renames: ['posts.name:posts.title'],
    });
    const friendlyDescs = new Set(plan.steps.map((s) => s.friendlyDescription));
    expect(friendlyDescs).toEqual(
      new Set([
        'Add attribute posts.slug.',
        'Make posts.slug a required attribute.',
        'Update attribute posts.title.',
        'Delete attribute posts.details.',
      ]),
    );
  });
});
