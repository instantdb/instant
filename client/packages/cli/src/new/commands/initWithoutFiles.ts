import { Effect } from 'effect';
import { ArgsFromCommand, initDef, initWithoutFilesDef } from '../index.js';
import { BadArgsError } from '../errors.js';
import { AuthToken } from '../context/authToken.js';

export const initWithoutFilesCommand = Effect.fn(function* (
  opts: ArgsFromCommand<typeof initWithoutFilesDef>,
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
});
