import { Effect, Option } from 'effect';
import { OptsFromCommand, initDef } from '../index.ts';
import { readLocalPermsFile, readLocalSchemaFile } from '../old.js';
import { pullSchema } from '../lib/pullSchema.ts';
import { pullPerms } from '../lib/pullPerms.ts';
import { promptOk } from '../lib/ui.ts';
import { pushSchema } from '../lib/pushSchema.ts';
import { pushPerms } from '../lib/pushPerms.ts';

export const initCommand = (options: OptsFromCommand<typeof initDef>) =>
  Effect.gen(function* () {
    yield* Effect.matchEffect(
      Effect.tryPromise(readLocalSchemaFile).pipe(
        // Throws NoSuchElementException if no file found
        Effect.flatMap(Option.fromNullable),
      ),
      {
        onFailure: () => pullSchema({ experimentalTypePreservation: false }),
        onSuccess: () =>
          Effect.gen(function* () {
            const doSchemaPush = yield* promptOk(
              {
                promptText: 'Found local schema. Push it to the new app?',
                inline: true,
              },
              true,
            );
            if (doSchemaPush) {
              yield* pushSchema();
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
            const doPermsPush = yield* promptOk(
              {
                promptText: 'Found local perms. Push it to the new app?',
                inline: true,
              },
              true,
            );
            if (doPermsPush) {
              yield* pushPerms;
            }
          }),
      },
    );
  });
