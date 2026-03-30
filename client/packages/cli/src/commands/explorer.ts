import { Effect } from 'effect';
import openInBrowser from 'open';
import { explorerDef } from '../index.ts';
import type { OptsFromCommand } from '../index.ts';
import { CurrentApp } from '../context/currentApp.ts';
import { getDashUrl } from '../lib/http.ts';

export const explorerCmd = (_opts: OptsFromCommand<typeof explorerDef>) =>
  Effect.gen(function* () {
    const { appId } = yield* CurrentApp;
    const dashUrl = yield* getDashUrl;
    yield* Effect.log('Opening Explorer...');
    const url = `${dashUrl}/dash?s=main&app=${appId}&t=explorer`;
    yield* Effect.tryPromise(() => openInBrowser(url)).pipe(
      Effect.catchAll(() =>
        Effect.log(
          `Failed to open Explorer in browser\nOpen Explorer manually:\n${url}`,
        ),
      ),
    );
  });
