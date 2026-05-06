import { HttpClientResponse } from '@effect/platform';
import { Effect, Schema } from 'effect';
import { InstantHttpAuthed } from '../../lib/http.ts';
import stringWidth from 'string-width';

const DashResponse = Schema.Struct({
  apps: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
    }),
  ),
});

const pad = (value: string, width: number) =>
  value + ' '.repeat(Math.max(0, width - stringWidth(value)));

export const appListCommand = (opts: { json?: boolean }) =>
  Effect.gen(function* () {
    const http = yield* InstantHttpAuthed;
    const dashData = yield* http.get('/dash').pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(DashResponse)),
      Effect.mapError((e) => new Error("Couldn't get apps.", { cause: e })),
    );

    if (opts.json) {
      yield* Effect.log(JSON.stringify(dashData.apps, null, 2));
      return;
    }

    if (dashData.apps.length === 0) {
      yield* Effect.log('No apps found.');
      return;
    }

    const nameHeader = 'Name';
    const idHeader = 'App ID';
    const nameWidth = Math.max(
      stringWidth(nameHeader),
      ...dashData.apps.map((app) => stringWidth(app.title)),
    );
    const idWidth = Math.max(
      stringWidth(idHeader),
      ...dashData.apps.map((app) => stringWidth(app.id)),
    );

    yield* Effect.log(`${pad(nameHeader, nameWidth)}  ${idHeader}`);
    yield* Effect.log(`${'-'.repeat(nameWidth)}  ${'-'.repeat(idWidth)}`);

    for (const app of dashData.apps) {
      yield* Effect.log(`${pad(app.title, nameWidth)}  ${app.id}`);
    }
  });
