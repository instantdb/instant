import { Effect } from 'effect';
import { OptsFromCommand, pushDef } from '../index.js';
import { WithAppLayer } from '../layer.js';
import { PACKAGE_ALIAS_AND_FULL_NAMES } from '../context/projectInfo.js';
import { pushPerms } from '../lib/pushPerms.js';
import { pushSchema } from '../lib/pushSchema.js';
import { BadArgsError } from '../errors.js';

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
  }).pipe(
    Effect.provide(
      WithAppLayer({
        coerce: true,
        appId: opts.app,
        applyEnv: true,
        packageName: opts.package as keyof typeof PACKAGE_ALIAS_AND_FULL_NAMES,
      }),
    ),
  );
