import { Effect, Match, Option, Schema } from 'effect';
import type { authOriginAddDef, OptsFromCommand } from '../../../index.ts';
import { BadArgsError } from '../../../errors.ts';
import { GlobalOpts } from '../../../context/globalOpts.ts';
import { optOrPrompt, runUIEffect } from '../../../lib/ui.ts';
import { addAuthorizedOrigin } from '../../../lib/oauth.ts';
import { UI } from '../../../ui/index.ts';
import chalk from 'chalk';
import boxen from 'boxen';
import { originDisplay, originSource } from './list.ts';

export const OriginTypeSchema = Schema.Literal('generic');

type OriginParams = string[];

const validateGenericUrl = (
  input: string,
): { type: 'success'; params: OriginParams } | { type: 'error'; message: string } => {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const host = url.host;
    if (!host) {
      throw new Error('missing host');
    }
    if (host.split('.').length === 1 && !url.port) {
      throw new Error('invalid url');
    }
    return { type: 'success', params: [host] };
  } catch {
    if (!trimmed.startsWith('http')) {
      return validateGenericUrl(`http://${trimmed}`);
    }
    return { type: 'error', message: 'Invalid URL.' };
  }
};

const handleGenericOrigin = Effect.fn(function* (
  opts: Record<string, unknown>,
) {
  const { yes } = yield* GlobalOpts;

  const url = yield* optOrPrompt(opts.url, {
    simpleName: '--url',
    required: true,
    skipIf: false,
    prompt: {
      prompt: 'Website URL:',
      placeholder: 'example.com',
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
    },
  });

  if (!url) {
    return yield* BadArgsError.make({ message: 'URL is required.' });
  }

  const validated = validateGenericUrl(url);
  if (validated.type === 'error') {
    return yield* BadArgsError.make({ message: validated.message });
  }

  const response = yield* addAuthorizedOrigin({
    service: 'generic',
    params: validated.params,
  });

  yield* Effect.log('\n' + 
    boxen(
      [
        `Origin added: ${originDisplay(response.origin)}`,
        `Type: ${originSource(response.origin)}`,
        `ID: ${response.origin.id}`,
      ].join('\n'),
      { dimBorder: true, padding: { right: 1, left: 1 } },
    ),
  );
});

export const authOriginAddCmd = Effect.fn(
  function* (
    opts: OptsFromCommand<typeof authOriginAddDef> & Record<string, unknown>,
  ) {
    const { yes } = yield* GlobalOpts;
    if (!opts.type && yes) {
      return yield* BadArgsError.make({
        message: `Missing required value for --type. Expected one of: ${OriginTypeSchema.literals.join(', ')}`,
      });
    }
    const originType = yield* Option.fromNullable(opts.type).pipe(
      Effect.catchTag('NoSuchElementException', () =>
        runUIEffect(
          new UI.Select({
            options: [{ label: 'Website', value: 'generic' }],
            promptText: 'Select an origin type:',
            modifyOutput: UI.modifiers.piped([UI.modifiers.dimOnComplete]),
          }),
        ),
      ),
      Effect.andThen((s) => Schema.decodeUnknown(OriginTypeSchema)(s)),
      Effect.catchTag('ParseError', () =>
        BadArgsError.make({
          message: `Invalid origin type, must be one of: ${OriginTypeSchema.literals.join(', ')}`,
        }),
      ),
    );

    yield* Match.value(originType).pipe(
      Match.withReturnType<Effect.Effect<void, any, any>>(),
      Match.when('generic', () => handleGenericOrigin(opts)),
      Match.exhaustive,
    );
  },
  Effect.catchTag('BadArgsError', (e) =>
    Effect.gen(function* () {
      yield* Effect.logError(e.message);
      yield* Effect.log(
        chalk.dim(
          'hint: run `instant-cli auth origin add --help` for available arguments',
        ),
      );
    }),
  ),
);
