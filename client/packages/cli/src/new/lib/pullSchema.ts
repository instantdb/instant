import { Effect, Schema } from 'effect';
import { CurrentApp } from '../context/currentApp.js';
import { InstantHttpAuthed } from './http.js';
import { HttpClientResponse } from '@effect/platform';
import { countEntities, readLocalSchemaFile } from '../../index.js';

export const pullSchema = () =>
  Effect.gen(function* () {
    console.log('Pulling schema...');
    const { appId } = yield* CurrentApp;
    const http = yield* InstantHttpAuthed;

    const schemaResponse = yield* http
      .get(`/dash/apps/${appId}/schema/pull`)
      .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Any)));
    console.log(schemaResponse);

    if (
      !countEntities(schemaResponse.schema.refs) &&
      !countEntities(schemaResponse.schema.blobs)
    ) {
      console.log('Schema is empty. Skipping.');
      return;
    }

    const schemaFile = yield* Effect.tryPromise(readLocalSchemaFile).pipe(
      Effect.mapError(
        (err) =>
          new Error(`Error reading local schema file: ${err}`, { cause: err }),
      ),
    );
  });
