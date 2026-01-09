import { beforeAll, describe, expect, test } from 'vitest';
import { PlatformApi, i } from '../../src/index';

const uniqueTitle = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getPostAttrs = (schema: any) =>
  Object.keys(schema.entities?.posts?.attrs || {});

const getStepTypes = (steps: { type: string }[]) =>
  steps.map((step) => step.type).sort();

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

describe.sequential('schemaPush e2e', () => {
  let appId: string;
  let adminToken: string;
  let adminApi: PlatformApi;

  beforeAll(async () => {
    const api = new PlatformApi({});
    const initialSchema = i.schema({
      entities: {
        posts: i.entity({
          title: i.string(),
        }),
      },
    });

    const { app } = await api.createTemporaryApp({
      title: uniqueTitle('platform-schema-push-e2e'),
      schema: initialSchema,
    });

    appId = app.id;
    adminToken = app.adminToken;
    adminApi = new PlatformApi({ auth: { token: adminToken } });
  }, 60000);

  test('additive push keeps removed attrs', async () => {
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

  test('overwrite push supports renames and deletes', async () => {
    const overwriteSchema = i.schema({
      entities: {
        posts: i.entity({
          headline: i.string(),
        }),
      },
    });

    const renames = { 'posts.title': 'posts.headline' };
    const plan = await adminApi.planSchemaPush(appId, {
      schema: overwriteSchema,
      overwrite: true,
      renames,
    });

    const hasDelete = plan.steps.some((step) => step.type === 'delete-attr');
    const hasUpdate = plan.steps.some((step) => step.type === 'update-attr');
    expect(hasDelete).toBe(true);
    expect(hasUpdate).toBe(true);
    expect(plan.steps.some((step) => step.type === 'add-attr')).toBe(false);

    const push = await adminApi.schemaPush(appId, {
      schema: overwriteSchema,
      overwrite: true,
      renames,
    });
    expect(getStepTypes(push.steps)).toEqual(getStepTypes(plan.steps));

    const attrs = await waitForPostAttrs(
      adminApi,
      appId,
      (nextAttrs) =>
        nextAttrs.includes('headline') &&
        !nextAttrs.includes('title') &&
        !nextAttrs.includes('slug'),
    );
    expect(attrs).toContain('headline');
    expect(attrs).not.toContain('title');
    expect(attrs).not.toContain('slug');
  }, 60000);
});
