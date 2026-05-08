import { HttpClientResponse } from '@effect/platform';
import { Effect, Schema } from 'effect';
import type { appDeleteDef, OptsFromCommand } from '../../index.ts';
import { GlobalOpts } from '../../context/globalOpts.ts';
import { InstantHttpAuthed, withCommand } from '../../lib/http.ts';
import { runUIEffect } from '../../lib/ui.ts';
import { UI } from '../../ui/index.ts';
import { BadArgsError } from '../../errors.ts';
import { potentialEnvs } from '../../context/currentApp.ts';

const DashResponse = Schema.Struct({
  apps: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      user_app_role: Schema.Literal('owner', 'admin', 'collaborator'),
    }),
  ),
});

const getEnvAppId = () => {
  const envName = Object.values(potentialEnvs).find((envName) =>
    Boolean(process.env[envName]),
  );
  return envName ? process.env[envName] : undefined;
};

export const appDeleteCommand = Effect.fn(function* (
  opts: OptsFromCommand<typeof appDeleteDef>,
) {
  const http = (yield* InstantHttpAuthed).pipe(withCommand('app delete'));
  const { yes } = yield* GlobalOpts;
  const targetApp = opts.app ?? getEnvAppId();

  const dashData = yield* http.get('/dash').pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(DashResponse)),
    Effect.mapError((e) => new Error("Couldn't get apps.", { cause: e })),
  );

  const deletableApps = dashData.apps.filter(
    (app) => app.user_app_role === 'owner' || app.user_app_role === 'admin',
  );

  const app = targetApp
    ? deletableApps.find((app) => app.id === targetApp)
    : yes
      ? undefined
      : yield* runUIEffect(
          new UI.Select({
            options: deletableApps.map((app) => ({
              label: `${app.title} (${app.id})`,
              value: app,
            })),
            promptText: 'Select an app to delete:',
          }),
        );

  if (!app) {
    return yield* BadArgsError.make({
      message: targetApp
        ? `App not found on your account, or you do not have permission to delete it: ${targetApp}`
        : 'Must specify --app when using --yes',
    });
  }

  if (!yes) {
    const confirmed = yield* runUIEffect(
      new UI.Confirmation({
        promptText: `Deleting an app will irreversibly delete all associated data.\nDelete app "${app.title}" (${app.id})?`,
        defaultValue: false,
      }),
    );

    if (!confirmed) {
      yield* Effect.log('Cancelled.');
      return;
    }
  }

  yield* http.del(`/dash/apps/${app.id}`);
  yield* Effect.log(`Deleted app "${app.title}" (${app.id}).`);
});
