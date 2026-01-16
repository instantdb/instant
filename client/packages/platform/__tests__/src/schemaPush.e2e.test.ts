import { describe, expect, test } from 'vitest';
import { PlatformApi, i } from '../../src/index';

const uniqueTitle = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getPostAttrs = (schema: any) =>
  Object.keys(schema.entities?.posts?.attrs || {});

const getStepTypes = (steps: { type: string }[]) =>
  steps.map((step) => step.type).sort();

const getPostLinks = (schema: any) =>
  Object.keys(schema.entities?.posts?.links || {});

const waitForPostAttrs = async (
  api: PlatformApi,
  appId: string,
  predicate: (attrs: string[]) => boolean,
  timeoutMs = 15000,
) => {
  const start = Date.now();
  let lastAttrs: string[] = [];
  while (Date.now() - start < timeoutMs) {
    const { schema } = await api.getSchema(appId);
    lastAttrs = getPostAttrs(schema);
    if (predicate(lastAttrs)) {
      return lastAttrs;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Timed out waiting for schema attrs. Last seen: ${lastAttrs.join(', ')}`,
  );
};

const waitForPostLinks = async (
  api: PlatformApi,
  appId: string,
  predicate: (links: string[]) => boolean,
  timeoutMs = 15000,
) => {
  const start = Date.now();
  let lastLinks: string[] = [];
  while (Date.now() - start < timeoutMs) {
    const { schema } = await api.getSchema(appId);
    lastLinks = getPostLinks(schema);
    if (predicate(lastLinks)) {
      return lastLinks;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Timed out waiting for schema links. Last seen: ${lastLinks.join(', ')}`,
  );
};

const createTempApp = async (schema: any) => {
  const api = new PlatformApi({});
  const { app } = await api.createTemporaryApp({
    title: uniqueTitle('platform-schema-push-e2e'),
    schema,
  });
  return {
    appId: app.id,
    adminApi: new PlatformApi({ auth: { token: app.adminToken } }),
  };
};

describe.sequential('schemaPush e2e', () => {
  test('additive push keeps removed attrs', async () => {
    const initialSchema = i.schema({
      entities: {
        posts: i.entity({
          title: i.string(),
        }),
      },
    });
    const { appId, adminApi } = await createTempApp(initialSchema);
    const additiveSchema = i.schema({
      entities: {
        posts: i.entity({
          slug: i.string(),
        }),
      },
    });

    const plan = await adminApi.planSchemaPush(appId, {
      schema: additiveSchema,
    });
    expect(plan.steps.some((step) => step.type === 'delete-attr')).toBe(false);

    const push = await adminApi.schemaPush(appId, { schema: additiveSchema });
    expect(getStepTypes(push.steps)).toEqual(getStepTypes(plan.steps));

    const attrs = await waitForPostAttrs(
      adminApi,
      appId,
      (nextAttrs) =>
        nextAttrs.includes('title') && nextAttrs.includes('slug'),
    );
    expect(attrs).toContain('title');
    expect(attrs).toContain('slug');
  }, 60000);

  test('overwrite push supports deletes only', async () => {
    const initialSchema = i.schema({
      entities: {
        posts: i.entity({
          title: i.string(),
          slug: i.string(),
        }),
      },
    });
    const { appId, adminApi } = await createTempApp(initialSchema);

    const plan = await adminApi.planSchemaPush(appId, {
      schema: i.schema({
        entities: {
          posts: i.entity({
            title: i.string(),
          }),
        },
      }),
      overwrite: true,
    });

    const hasDelete = plan.steps.some((step) => step.type === 'delete-attr');
    expect(hasDelete).toBe(true);
    expect(plan.steps.some((step) => step.type === 'add-attr')).toBe(false);

    const push = await adminApi.schemaPush(appId, {
      schema: i.schema({
        entities: {
          posts: i.entity({
            title: i.string(),
          }),
        },
      }),
      overwrite: true,
    });
    expect(getStepTypes(push.steps)).toEqual(getStepTypes(plan.steps));

    const attrs = await waitForPostAttrs(
      adminApi,
      appId,
      (nextAttrs) => nextAttrs.includes('title') && !nextAttrs.includes('slug'),
    );
    expect(attrs).toContain('title');
    expect(attrs).not.toContain('slug');
  }, 60000);

  test('overwrite push supports link renames via renames map', async () => {
    const initialSchema = i.schema({
      entities: {
        users: i.entity({
          name: i.string(),
        }),
        posts: i.entity({
          title: i.string(),
        }),
      },
      links: {
        usersPosts: {
          forward: {
            on: 'users',
            has: 'many',
            label: 'posts',
          },
          reverse: {
            on: 'posts',
            has: 'one',
            label: 'author',
          },
        },
      },
    });
    const { appId, adminApi } = await createTempApp(initialSchema);

    const renamedSchema = i.schema({
      entities: {
        users: i.entity({
          name: i.string(),
        }),
        posts: i.entity({
          title: i.string(),
        }),
      },
      links: {
        usersPosts: {
          forward: {
            on: 'users',
            has: 'many',
            label: 'posts',
          },
          reverse: {
            on: 'posts',
            has: 'one',
            label: 'writer',
          },
        },
      },
    });

    const renames = { 'posts.author': 'posts.writer' };
    const plan = await adminApi.planSchemaPush(appId, {
      schema: renamedSchema,
      overwrite: true,
      renames,
    });
    expect(plan.steps.some((step) => step.type === 'delete-attr')).toBe(false);
    expect(plan.steps.some((step) => step.type === 'add-attr')).toBe(false);
    expect(plan.steps.some((step) => step.type === 'update-attr')).toBe(true);

    const push = await adminApi.schemaPush(appId, {
      schema: renamedSchema,
      overwrite: true,
      renames,
    });
    expect(getStepTypes(push.steps)).toEqual(getStepTypes(plan.steps));

    const links = await waitForPostLinks(
      adminApi,
      appId,
      (nextLinks) =>
        nextLinks.includes('writer') && !nextLinks.includes('author'),
    );
    expect(links).toContain('writer');
    expect(links).not.toContain('author');
  }, 60000);
});
