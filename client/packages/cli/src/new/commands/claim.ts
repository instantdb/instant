import { HttpClient, HttpClientRequest } from '@effect/platform';
import chalk from 'chalk';
import { Effect } from 'effect';
import { CurrentApp } from '../context/currentApp.js';
import { BadArgsError } from '../errors.js';
import { WithAppLayer } from '../layer.js';
import { InstantHttpAuthed } from '../lib/http.js';

export const claimCommand = Effect.gen(function* () {
  const { appId, adminToken } = yield* CurrentApp;

  console.log(`Found app: ${appId}`);

  const http = yield* InstantHttpAuthed;

  if (!adminToken) {
    return yield* BadArgsError.make({ message: 'Missing app admin token' });
  }

  yield* http
    .pipe(
      HttpClient.mapRequestInputEffect(
        HttpClientRequest.bodyJson({
          app_id: appId,
          token: adminToken,
        }),
      ),
    )
    .post(`/dash/apps/ephemeral/${appId}/claim`);

  console.log(chalk.green('App claimed!'));
}).pipe(
  Effect.provide(
    WithAppLayer({
      coerce: false,
      applyEnv: false,
    }),
  ),
);
