import { Effect } from 'effect';
import { PlatformApi } from '../context/platformApi.js';
import { BadArgsError } from '../errors.js';
import { OptsFromCommand, initWithoutFilesDef } from '../index.js';
import { createApp } from '../lib/createApp.js';
import { AuthTokenLive } from '../context/authToken.js';
import { AuthLayerLive } from '../layer.js';
import chalk from 'chalk';

export const initWithoutFilesCommand = Effect.fn(function* (
  opts: OptsFromCommand<typeof initWithoutFilesDef>,
) {
  if (!opts?.title) {
    return yield* BadArgsError.make({
      message: 'Title is required for creating a new app without local files.',
    });
  }

  if (opts.title.startsWith('-')) {
    return yield* BadArgsError.make({
      message: `Invalid title: "${opts.title}". Title cannot be a flag.`,
    });
  }

  if (opts?.temp && opts?.orgId) {
    return yield* BadArgsError.make({
      message: 'Cannot use --temp and --org-id flags together.',
    });
  }

  if (!opts.temp) {
    const app = yield* createApp(opts.title, opts.orgId).pipe(
      Effect.provide(AuthLayerLive(false)),
    );
    console.error(`${chalk.green('Successfully created new app!')}\n`);
    yield* Effect.log(
      JSON.stringify(
        {
          app: {
            appId: app.app.id,
            adminToken: app.app['admin-token'],
          },
          error: null,
        },
        null,
        2,
      ),
    );
  } else {
    const platform = yield* PlatformApi;
    const app = yield* platform.use((api) =>
      api.createTemporaryApp({
        title: opts.title!,
      }),
    );

    console.error(`${chalk.green('Successfully created new app!')}\n`);
    yield* Effect.log(
      JSON.stringify(
        {
          app: {
            appId: app.app.id,
            adminToken: app.app.adminToken,
          },
          error: null,
        },
        null,
        2,
      ),
    );
  }
});
