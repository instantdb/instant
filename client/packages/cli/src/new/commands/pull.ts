import { Effect } from 'effect';
import { ArgsFromCommand, pullDef } from '../index.js';
import { pullSchema } from '../lib/pullSchema.js';
import { WithAppLayer } from '../layer.js';

export type SchemaPermsOrBoth = 'schema' | 'perms' | 'all';

export const pullCommand = (
  arg: SchemaPermsOrBoth,
  opts: ArgsFromCommand<typeof pullDef>,
) =>
  Effect.gen(function* () {
    arg ||= 'all';
    if (arg === 'schema' || arg === 'all') {
      yield* pullSchema();
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
      }),
    ),
  );
