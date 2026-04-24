import chalk from 'chalk';
import { Effect, Schema } from 'effect';
import type { authOriginListDef, OptsFromCommand } from '../../../index.ts';
import { AuthorizedOrigin, getAppsAuth } from '../../../lib/oauth.ts';

export const originSource = (
  origin: Schema.Schema.Type<typeof AuthorizedOrigin>,
) => {
  switch (origin.service) {
    case 'generic':
      return 'Website';
    case 'netlify':
      return 'Netlify site';
    case 'vercel':
      if (origin.params[0] !== 'vercel.app') {
        return `Vercel project (${origin.params[0]})`;
      }
      return 'Vercel project';
    case 'custom-scheme':
      return 'Native app';
    default:
      return origin.service;
  }
};

export const originDisplay = (
  origin: Schema.Schema.Type<typeof AuthorizedOrigin>,
) => {
  switch (origin.service) {
    case 'generic':
      return origin.params[0];
    case 'netlify':
      return origin.params[0];
    case 'vercel':
      return origin.params[1];
    case 'custom-scheme':
      return `${origin.params[0]}://`;
    default:
      return origin.params[0];
  }
};

export const authOriginListCmd = Effect.fn(function* (
  _opts: OptsFromCommand<typeof authOriginListDef>,
) {
  const info = yield* getAppsAuth();
  if (_opts.json) {
    yield* Effect.log(
      JSON.stringify(info.authorized_redirect_origins, null, 2),
    );
    return;
  }

  const origins = info.authorized_redirect_origins ?? [];

  if (origins.length === 0) {
    yield* Effect.log('No authorized redirect origins configured.');
    return;
  }

  for (const origin of origins) {
    yield* Effect.log(chalk.cyan(originDisplay(origin)));
    yield* Effect.log(`  Type: ${originSource(origin)}`);
    yield* Effect.log(`  ID: ${origin.id}`);
  }
});
