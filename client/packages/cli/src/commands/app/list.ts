import { HttpClientResponse } from '@effect/platform';
import { Effect, Schema } from 'effect';
import { InstantHttpAuthed } from '../../lib/http.ts';
import chalk from 'chalk';
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

    const nameWidth = Math.max(
      ...dashData.apps.map((app) => stringWidth(app.title)),
    );

    for (const app of dashData.apps) {
      yield* Effect.log(`${pad(app.title, nameWidth)}  ${chalk.dim(app.id)}`);
    }
  });
