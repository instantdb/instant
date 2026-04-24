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

export const OriginTypeSchema = Schema.Literal(
  'website',
  'vercel',
  'netlify',
  'custom-scheme',
);

type OriginParams = string[];

type Validated =
  | { type: 'success'; params: OriginParams }
  | { type: 'error'; message: string };

const validateGenericUrl = (input: string): Validated => {
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

const validateNetlifyUrl = (input: string): Validated => {
  const trimmed = input.trim();
  if (!trimmed) {
    return { type: 'error', message: 'Netlify site name is required.' };
  }
  return { type: 'success', params: [trimmed] };
};

const validateVercelUrl = (input: string): Validated => {
  const trimmed = input.trim();
  if (!trimmed) {
    return { type: 'error', message: 'Vercel project name is required.' };
  }
  return { type: 'success', params: ['vercel.app', trimmed] };
};

const validateCustomScheme = (input: string): Validated => {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const scheme = url.protocol.slice(0, -1);
    return { type: 'success', params: [scheme] };
  } catch {
    return { type: 'error', message: 'Invalid scheme.' };
  }
};

const addOriginHandler = Effect.fn(function* (
  type: Schema.Schema.Type<typeof OriginTypeSchema>,
  validated: { params: OriginParams },
) {
  const response = yield* addAuthorizedOrigin({
    service: type === 'website' ? 'generic' : type,
    params: validated.params,
  });

  yield* Effect.log(
    '\n' +
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

const handleGenericOrigin = Effect.fn(function* (
  opts: Record<string, unknown>,
) {
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

  yield* addOriginHandler('website', validated);
});

const handleVercelOrigin = Effect.fn(function* (opts: Record<string, unknown>) {
  const project = yield* optOrPrompt(opts.project, {
    simpleName: '--project',
    required: true,
    skipIf: false,
    prompt: {
      prompt: 'Vercel project name:',
      placeholder: 'vercel-project-name',
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
    },
  });

  const validated = validateVercelUrl(project ?? '');
  if (validated.type === 'error') {
    return yield* BadArgsError.make({ message: validated.message });
  }

  yield* addOriginHandler('vercel', validated);
});

const handleNetlifyOrigin = Effect.fn(function* (
  opts: Record<string, unknown>,
) {
  const site = yield* optOrPrompt(opts.site, {
    simpleName: '--site',
    required: true,
    skipIf: false,
    prompt: {
      prompt: 'Netlify site name:',
      placeholder: 'netlify-site-name',
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
    },
  });

  const validated = validateNetlifyUrl(site ?? '');
  if (validated.type === 'error') {
    return yield* BadArgsError.make({ message: validated.message });
  }

  yield* addOriginHandler('netlify', validated);
});

const handleCustomSchemeOrigin = Effect.fn(function* (
  opts: Record<string, unknown>,
) {
  const scheme = yield* optOrPrompt(opts.scheme, {
    simpleName: '--scheme',
    required: true,
    skipIf: false,
    prompt: {
      prompt: 'App scheme:',
      placeholder: 'app-scheme://',
      modifyOutput: UI.modifiers.piped([
        UI.modifiers.topPadding,
        UI.modifiers.dimOnComplete,
      ]),
    },
  });

  const validated = validateCustomScheme(scheme ?? '');
  if (validated.type === 'error') {
    return yield* BadArgsError.make({ message: validated.message });
  }

  yield* addOriginHandler('custom-scheme', validated);
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
            options: [
              { label: 'Website', value: 'website' },
              { label: 'Vercel previews', value: 'vercel' },
              { label: 'Netlify previews', value: 'netlify' },
              { label: 'App scheme', value: 'custom-scheme' },
            ],
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
      Match.when('website', () => handleGenericOrigin(opts)),
      Match.when('vercel', () => handleVercelOrigin(opts)),
      Match.when('netlify', () => handleNetlifyOrigin(opts)),
      Match.when('custom-scheme', () => handleCustomSchemeOrigin(opts)),
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
