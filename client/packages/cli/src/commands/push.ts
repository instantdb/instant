import { Effect } from 'effect';
import { BadArgsError } from '../errors.ts';
import { pushDef } from '../index.ts';
import type { OptsFromCommand } from '../index.ts';
import { pushPerms } from '../lib/pushPerms.ts';
import { pushSchema } from '../lib/pushSchema.ts';

export const pushCommand = (
  arg: string | undefined,
  opts: OptsFromCommand<typeof pushDef>,
) =>
  Effect.gen(function* () {
    arg ||= 'all';
    if (arg !== 'schema' && arg !== 'perms' && arg !== 'all') {
      return yield* new BadArgsError({
        message: `Invalid argument: ${arg}. Expected one of schema, perms, or all`,
      });
    }
    if (arg === 'schema' || arg === 'all') {
      yield* pushSchema(opts.rename);
    }
    if (arg === 'perms' || arg === 'all') {
      yield* pushPerms;
    }
  });
