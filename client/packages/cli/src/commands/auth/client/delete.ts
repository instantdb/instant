import { Effect } from 'effect';
import type { authClientDeleteDef, OptsFromCommand } from '../../../index.ts';
import { BadArgsError } from '../../../errors.ts';
import { findClientByIdOrName, getAppsAuth } from '../../../lib/oauth.ts';
import { GlobalOpts } from '../../../context/globalOpts.ts';
import { runUIEffect } from '../../../lib/ui.ts';
import { UI } from '../../../ui/index.ts';
import chalk from 'chalk';
import { InstantHttpAuthed, withCommand } from '../../../lib/http.ts';
import { CurrentApp } from '../../../context/currentApp.ts';

export const authClientDeleteCmd = Effect.fn(function* (
  opts: OptsFromCommand<typeof authClientDeleteDef>,
) {
  if (!opts.id && !opts.name) {
    const info = yield* getAppsAuth();
    // user must pick manually
    const { yes } = yield* GlobalOpts;
    if (yes) {
      return yield* BadArgsError.make({
        message: 'Must specify --id or --name',
      });
    }

    if (!info.oauth_clients) {
      yield* Effect.log('No OAuth clients found');
      return;
    }

    // Prompt user to select
    const picked = yield* runUIEffect(
      new UI.Select({
        options: info.oauth_clients.map((app) => ({
          label: app.client_name + chalk.dim(` (${app.id})`),
          value: app,
        })),
        promptText: 'Select a client to delete:',
      }),
    );

    yield* deleteOauthClient(picked.id);
  } else {
    const { client } = yield* findClientByIdOrName({
      id: opts.id,
      name: opts.name,
    });
    yield* deleteOauthClient(client.id);
  }

  yield* Effect.log('Client Deleted!');
});

const deleteOauthClient = Effect.fn(function* (clientDatabaseId: string) {
  const http = (yield* InstantHttpAuthed).pipe(
    withCommand('auth client delete'),
  );
  const { appId } = yield* CurrentApp;

  yield* http.del(`/dash/apps/${appId}/oauth_clients/${clientDatabaseId}`);
});
