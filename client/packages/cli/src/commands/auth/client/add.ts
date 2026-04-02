import { Effect, Match, Option, Schema } from 'effect';
import type { authClientAddDef, OptsFromCommand } from '../../../index.ts';
import { BadArgsError } from '../../../errors.ts';
import { GlobalOpts } from '../../../context/globalOpts.ts';
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

const GoogleArgs = Schema.Struct({
  clientName: Schema.String,
  clientId: Schema.String,
  clientSecret: Schema.String,
  customRedirectUri: Schema.String.pipe(Schema.optional),
});

const optOrPrompt = (value: unknown, prompt: string, placeholder?: string) =>
  Effect.gen(function* () {
    const { yes } = yield* GlobalOpts;
    return yield* Option.fromNullable(value).pipe(
      Effect.catchTag('NoSuchElementException', () => {
        if (yes) {
          return BadArgsError.make({
            message: `Missing required value for: ${prompt}`,
          });
        }
        return runUIEffect(
          new UI.TextInput({
            prompt,
            ...(placeholder ? { placeholder } : {}),
          }),
        ).pipe(
          Effect.catchTag('UIError', (e) =>
            BadArgsError.make({
              message: `UI error for ${prompt}: ${e.message}`,
            }),
          ),
        );
      }),
      Effect.andThen(Schema.decodeUnknown(Schema.String)),
      Effect.catchTag('ParseError', () =>
        BadArgsError.make({ message: `Invalid value for: ${prompt}` }),
      ),
    );
  });

export const authClientAddCmd = Effect.fn(function* (
  // allowUnknownOption is true
  opts: OptsFromCommand<typeof authClientAddDef> & Record<string, unknown>,
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
    Effect.catchTag('UIError', (e) =>
      BadArgsError.make({ message: `UI error: ${e.message}` }),
    ),
    Effect.andThen((s) => Schema.decodeUnknown(ClientTypeSchema)(s)),
    Effect.catchTag('ParseError', () =>
      BadArgsError.make({
        message:
          'Invalid client type, must be one of: google, apple, github, linkedin, clerk, firebase',
      }),
    ),
  );
  console.log(opts);

  yield* Match.value(clientType).pipe(
    Match.withReturnType<Effect.Effect<void, any, any>>(),
    Match.when('google', () =>
      Effect.gen(function* () {
        const clientName = yield* optOrPrompt(opts.clientName, 'Client name');
        const clientId = yield* optOrPrompt(opts.clientId, 'Client ID');
        const clientSecret = yield* optOrPrompt(
          opts.clientSecret,
          'Client secret',
        );
        const customRedirectUri = opts.customRedirectUri as string | undefined;

        const args = yield* Schema.decodeUnknown(GoogleArgs)({
          clientName,
          clientId,
          clientSecret,
          ...(customRedirectUri ? { customRedirectUri } : {}),
        }).pipe(
          Effect.catchTag('ParseError', (e) =>
            BadArgsError.make({ message: `Invalid Google args: ${e.message}` }),
          ),
        );

        yield* Effect.log(args);
      }),
    ),
    Match.when('apple', () => Effect.succeed(undefined)),
    Match.when('clerk', () => Effect.succeed(undefined)),
    Match.when('github', () => Effect.succeed(undefined)),
    Match.when('firebase', () => Effect.succeed(undefined)),
    Match.when('linkedin', () => Effect.succeed(undefined)),
    Match.exhaustive,
  );
});
