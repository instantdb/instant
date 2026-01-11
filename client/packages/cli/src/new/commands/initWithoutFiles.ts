import { Effect } from 'effect';
import { PlatformApi } from '../context/platformApi.js';
import { BadArgsError } from '../errors.js';
import { ArgsFromCommand, initWithoutFilesDef } from '../index.js';
import { createApp } from '../lib/createApp.js';
import { GlobalOpts } from '../context/globalOpts.js';

export const initWithoutFilesCommand = Effect.fn(function* (
  opts: ArgsFromCommand<typeof initWithoutFilesDef>,
) {
  const { yes } = yield* GlobalOpts;

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
    const app = yield* createApp(opts.title, opts.orgId);
    console.log(app);
  } else {
    // TODO: fix formatting
    const platform = yield* PlatformApi;
    const app = yield* platform.use((api) =>
      api.createTemporaryApp({
        title: opts.title!,
      }),
    );
    console.log(app);
  }
});
