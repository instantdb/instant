import chalk from 'chalk';
import { Effect } from 'effect';
import type { authOriginDeleteDef, OptsFromCommand } from '../../../index.ts';
import { BadArgsError } from '../../../errors.ts';
import { getAppsAuth, removeAuthorizedOrigin } from '../../../lib/oauth.ts';
import { GlobalOpts } from '../../../context/globalOpts.ts';
import { runUIEffect } from '../../../lib/ui.ts';
import { UI } from '../../../ui/index.ts';
import { originDisplay, originSource } from './list.ts';

export const authOriginDeleteCmd = Effect.fn(function* (
  opts: OptsFromCommand<typeof authOriginDeleteDef>,
) {
  const info = yield* getAppsAuth();
  const origins = info.authorized_redirect_origins ?? [];

  if (origins.length === 0) {
    yield* Effect.log('No authorized redirect origins configured.');
    return;
  }

  if (!opts.id) {
    const { yes } = yield* GlobalOpts;
    if (yes) {
      return yield* BadArgsError.make({
        message: 'Must specify --id',
      });
    }

    const picked = yield* runUIEffect(
      new UI.Select({
        options: origins.map((origin) => ({
          label:
            `${originSource(origin)} — ${originDisplay(origin)} ` +
            chalk.dim(`(${origin.id})`),
          value: origin,
        })),
        promptText: 'Select an origin to delete:',
      }),
    );

    yield* removeAuthorizedOrigin(picked.id);
  }

  if (opts.id) {
    yield* removeAuthorizedOrigin(opts.id);
  }

  yield* Effect.log('Origin deleted!');
});
