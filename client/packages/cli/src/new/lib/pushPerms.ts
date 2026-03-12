import { Effect, Option, Schema } from 'effect';
import jsonDiff from 'json-diff';
import { readLocalPermsFile } from '../../index.js';
import { InstantHttpAuthed, withCommand } from './http.js';
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from '@effect/platform';
import { CurrentApp } from '../context/currentApp.js';
import { promptOk } from './ui.js';
import boxen from 'boxen';
import chalk from 'chalk';

export class NoPermsFileError extends Schema.TaggedError<NoPermsFileError>(
  'NoPermsFileError',
)('NoPermsFileError', {
  message: Schema.String,
}) {}

const PullPermsResponse = Schema.Struct({
  perms: Schema.Any.pipe(Schema.optional),
});

export const pushPerms = Effect.gen(function* () {
  yield* Effect.log('Planning perms...');
  const { appId } = yield* CurrentApp;
  const http = yield* InstantHttpAuthed;

  const permsFile = yield* Effect.tryPromise(readLocalPermsFile).pipe(
    Effect.flatMap(Option.fromNullable),
    Effect.mapError(() =>
      NoPermsFileError.make({ message: 'No permissions file found' }),
    ),
  );

  const prodPerms = yield* http
    .pipe(withCommand('push'))
    .get(`/dash/apps/${appId}/perms/pull`)
    .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(PullPermsResponse))); // parse result body into "any"

  const diffedStr = jsonDiff.diffString(
    prodPerms.perms || {},
    permsFile.perms || {},
  );

  if (!diffedStr.length) {
    yield* Effect.log('No perms changes detected. Skipping.');
    return;
  }

  const okPush = yield* promptOk({
    promptText: 'Push these changes to your perms?',
    modifyOutput: (output) => {
      let both = diffedStr + '\n' + output;
      return boxen(both, {
        dimBorder: true,
        padding: {
          left: 1,
          right: 1,
        },
      });
    },
  });
  if (!okPush) return;

  yield* http
    .pipe(
      withCommand('push'),
      HttpClient.mapRequestInputEffect(
        HttpClientRequest.bodyJson({ code: permsFile.perms }),
      ),
    )
    .post(`/dash/apps/${appId}/rules`)
    .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Any)));

  yield* Effect.log(chalk.green('Permissions updated!'));
});
