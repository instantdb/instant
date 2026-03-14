import { Effect } from 'effect';
import { OptsFromCommand, pullDef } from '../index.js';
import { pullSchema } from '../lib/pullSchema.js';
import { WithAppLayer } from '../layer.js';
import { pullPerms } from '../lib/pullPerms.js';

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
  }).pipe(
    Effect.provide(
      WithAppLayer({
        coerce: true,
        packageName: opts.package as
          | 'react'
          | 'react-native'
          | 'core'
          | 'admin'
          | undefined,
        appId: opts.app,
      }),
    ),
  );
