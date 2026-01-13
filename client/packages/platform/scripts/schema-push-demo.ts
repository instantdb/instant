import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { PlatformApi, i } from '../src/index.ts';

const getToken = () => process.env.INSTANT_PLATFORM_TOKEN?.trim();

const uniqueTitle = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const renderSteps = (steps: { friendlyDescription: string }[]) => {
  if (!steps.length) {
    console.log('- No schema changes detected.');
    return;
  }
  steps.forEach((step) => {
    console.log(`- ${step.friendlyDescription}`);
  });
};

const renderExpectations = (title: string, expectations: string[]) => {
  console.log(title);
  expectations.forEach((item) => {
    console.log(`- ${item}`);
  });
  console.log('');
};

const pause = async (rl: ReturnType<typeof createInterface>, message: string) =>
  rl.question(`${message}\n`);

const initialSchema = i.schema({
  entities: {
    posts: i.entity({
      title: i.string(),
    }),
  },
});

const addSchema = i.schema({
  entities: {
    posts: i.entity({
      title: i.string(),
      slug: i.string(),
    }),
  },
});

const renameSchema = i.schema({
  entities: {
    posts: i.entity({
      headline: i.string(),
      slug: i.string(),
    }),
  },
});

const deleteSchema = i.schema({
  entities: {
    posts: i.entity({
      headline: i.string(),
    }),
  },
});

const run = async () => {
  const token = getToken();
  if (!token) {
    throw new Error('Missing INSTANT_PLATFORM_TOKEN.');
  }

  const api = new PlatformApi({ auth: { token } });
  const rl = createInterface({ input, output });

  try {
    console.log('Instant Platform schemaPush demo');
    console.log('Creating demo app...');

    const { app } = await api.createApp({
      title: uniqueTitle('schema-push-demo'),
      schema: initialSchema,
    });

    console.log(`App created: ${app.id}`);
    console.log('');

    await pause(rl, 'Step 1: Add posts.slug (additive). Press Enter to plan.');
    renderExpectations('Expected changes:', ['Add attribute posts.slug.']);
    const addPlan = await api.planSchemaPush(app.id, { schema: addSchema });
    renderSteps(addPlan.steps);
    await pause(rl, 'Press Enter to apply step 1.');
    await api.schemaPush(app.id, { schema: addSchema });
    console.log('Step 1 applied.');
    console.log('');

    await pause(
      rl,
      'Step 2: Rename posts.title -> posts.headline (overwrite). Press Enter to plan.',
    );
    renderExpectations('Expected changes:', [
      'Rename posts.title to posts.headline.',
      'No new attribute created.',
    ]);
    const renamePlan = await api.planSchemaPush(app.id, {
      schema: renameSchema,
      overwrite: true,
      renames: {
        'posts.title': 'posts.headline',
      },
    });
    renderSteps(renamePlan.steps);
    await pause(rl, 'Press Enter to apply step 2.');
    await api.schemaPush(app.id, {
      schema: renameSchema,
      overwrite: true,
      renames: {
        'posts.title': 'posts.headline',
      },
    });
    console.log('Step 2 applied.');
    console.log('');

    await pause(
      rl,
      'Step 3: Delete posts.slug (overwrite). Press Enter to plan.',
    );
    renderExpectations('Expected changes:', ['Delete attribute posts.slug.']);
    const deletePlan = await api.planSchemaPush(app.id, {
      schema: deleteSchema,
      overwrite: true,
    });
    renderSteps(deletePlan.steps);
    await pause(rl, 'Press Enter to apply step 3.');
    await api.schemaPush(app.id, {
      schema: deleteSchema,
      overwrite: true,
    });
    console.log('Step 3 applied.');
    console.log('');

    console.log('Done! Final schema for posts includes: headline');
    console.log(`App id: ${app.id}`);
  } finally {
    rl.close();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
