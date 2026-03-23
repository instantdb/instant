import { HttpClient, HttpClientRequest } from '@effect/platform';
import chalk from 'chalk';
import { Effect } from 'effect';
import { CurrentApp } from '../context/currentApp.ts';
import { BadArgsError } from '../errors.ts';
import { WithAppLayer } from '../layer.ts';
import { InstantHttpAuthed } from '../lib/http.ts';

export const claimCommand = Effect.gen(function* () {
  const { appId, adminToken } = yield* CurrentApp;

  yield* Effect.log(`Found app: ${appId}`);

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

  yield* Effect.log(chalk.green('App claimed!'));
});
