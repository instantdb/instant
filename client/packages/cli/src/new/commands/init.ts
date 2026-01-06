import { Effect, Option } from 'effect';
import { OptsFromCommand, initDef } from '../index.js';
import { ProjectInfo } from '../context/projectInfo.js';
import { CurrentApp } from '../context/currentApp.js';
import { WithAppLayer } from '../layer.js';
import { readLocalPermsFile, readLocalSchemaFile } from '../../index.js';
import { pullSchema } from '../lib/pullSchema.js';
import { pullPerms } from '../lib/pullPerms.js';
import { promptOk } from '../lib/ui.js';
import { pushSchema } from '../lib/pushSchema.js';
import { pushPerms } from '../lib/pushPerms.js';

export const initCommand = (options: OptsFromCommand<typeof initDef>) =>
  Effect.gen(function* () {
    const _info = yield* ProjectInfo;
    const _app = yield* CurrentApp;

    yield* Effect.matchEffect(
      Effect.tryPromise(readLocalSchemaFile).pipe(
        // Throws NoSuchElementException if no file found
        Effect.flatMap(Option.fromNullable),
      ),
      {
        onFailure: () => pullSchema,
        onSuccess: () =>
          Effect.gen(function* () {
            const doSchemaPush = yield* promptOk({
              promptText: 'Found local schema. Push it to the new app?',
              inline: true,
            });
            if (doSchemaPush) {
              yield* pushSchema(undefined);
            }
          }),
      },
    );

    yield* Effect.matchEffect(
      Effect.tryPromise(readLocalPermsFile).pipe(
        // Throws NoSuchElementException if no file found
        Effect.flatMap(Option.fromNullable),
      ),
      {
        onFailure: () => pullPerms,
        onSuccess: () =>
          Effect.gen(function* () {
            const doPermsPush = yield* promptOk({
              promptText: 'Found local perms. Push it to the new app?',
              inline: true,
            });
            if (doPermsPush) {
              yield* pushPerms;
            }
          }),
      },
    );
  }).pipe(
    Effect.provide(
      WithAppLayer({
        coerce: true,
        title: options.title,
        appId: options.app,
        packageName: options.package as any,
        applyEnv: true,
      }),
    ),
  );
