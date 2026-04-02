import { Effect, Match, Option, Schema } from 'effect';
import type { authClientAddDef, OptsFromCommand } from '../../../index.ts';
import { BadArgsError } from '../../../errors.ts';
import { runUIEffect } from '../../../lib/ui.ts';
import { UI } from '../../../ui/index.ts';

const ClientTypeSchema = Schema.Literal(
  'google',
  'apple',
  'github',
  'linkedin',
  'clerk',
  'firebase',
);

export const authClientAddCmd = Effect.fn(function* (
  opts: OptsFromCommand<typeof authClientAddDef>,
) {
  const clientType = yield* Option.fromNullable(opts.type).pipe(
    Effect.catchTag('NoSuchElementException', () =>
      runUIEffect(
        new UI.Select({
          options: [
            { label: 'Google', value: 'google' },
            { label: 'Apple', value: 'apple' },
            { label: 'GitHub', value: 'github' },
            { label: 'LinkedIn', value: 'linkedin' },
            { label: 'Clerk', value: 'clerk' },
            { label: 'Firebase', value: 'firebase' },
          ],
          promptText: 'Select a client type',
          modifyOutput: UI.modifiers.dimOnComplete,
        }),
      ),
    ),
    Effect.andThen((s) => Schema.decodeUnknown(ClientTypeSchema)(s)),
    Effect.catchTag('ParseError', () =>
      BadArgsError.make({
        message:
          'Invalid client type, must be one of: google, apple, github, linkedin, clerk, firebase',
      }),
    ),
  );

  yield* Match.value(clientType).pipe(
    Match.withReturnType<Effect.Effect<void, any, any>>(),
    Match.when('google', () => Effect.succeed(undefined)),
    Match.when('apple', () => Effect.succeed(undefined)),
    Match.when('clerk', () => Effect.succeed(undefined)),
    Match.when('github', () => Effect.succeed(undefined)),
    Match.when('firebase', () => Effect.succeed(undefined)),
    Match.when('linkedin', () => Effect.succeed(undefined)),
    Match.exhaustive,
  );

  console.log(clientType);

  yield* Effect.log(opts);
});
