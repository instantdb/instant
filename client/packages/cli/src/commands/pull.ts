import { Effect } from 'effect';
import { OptsFromCommand, pullDef } from '../index.ts';
import { pullSchema } from '../lib/pullSchema.ts';
import { pullPerms } from '../lib/pullPerms.ts';

export type SchemaPermsOrBoth = 'schema' | 'perms' | 'all';

export const pullCommand = (
  arg: SchemaPermsOrBoth,
  opts: OptsFromCommand<typeof pullDef>,
) =>
  Effect.gen(function* () {
    arg ||= 'all';
    if (arg === 'schema' || arg === 'all') {
      yield* pullSchema({
        experimentalTypePreservation: opts.experimentalTypePreservation,
      });
    }
    if (arg === 'perms' || arg === 'all') {
      yield* pullPerms;
    }
  });
