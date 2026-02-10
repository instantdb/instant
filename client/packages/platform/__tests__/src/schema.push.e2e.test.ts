import { describe, expect, test } from 'vitest';
import { PlatformApi, i } from '../../src/index';

describe.concurrent('schemaPush e2e', () => {
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

  // todo-test: we throw an error if we pass in renames without overwrite: true

  test('planSchemaPush: overwrite flow handles deletes and renames', async () => {
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
    const plan = await appApi.planSchemaPush(app.id, {
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
        // TODO: somehow need to pass `ident-name` here
        'Delete attribute TODO.'
      ]),
    );
  });
});
