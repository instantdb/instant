import { Effect } from 'effect';
import openInBrowser from 'open';
import { explorerDef, OptsFromCommand } from '../index.js';
import { CurrentApp } from '../context/currentApp.js';
import { WithAppLayer } from '../layer.js';
import { getDashUrl } from '../lib/http.js';

export const explorerCmd = (opts: OptsFromCommand<typeof explorerDef>) =>
  Effect.gen(function* () {
    const { appId } = yield* CurrentApp;
    const dashUrl = yield* getDashUrl;
    const url = `${dashUrl}/dash?s=main&app=${appId}&t=explorer`;
    yield* Effect.tryPromise(() => openInBrowser(url)).pipe(
      Effect.catchAll(() =>
        Effect.log(
          `Failed to open Explorer in browser\nOpen Explorer manually:\n${url}`,
        ),
      ),
    );
  }).pipe(
    Effect.provide(
      WithAppLayer({
        coerce: true,
        appId: opts.app,
      }),
    ),
  );
