import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from '@effect/platform';
import chalk from 'chalk';
import { Data, Effect, Schema } from 'effect';
import {
  readLocalSchemaFile,
  resolveRenames,
  waitForIndexingJobsToFinish,
} from '../../index.js';
import { CurrentApp } from '../context/currentApp.ts';
import { error } from '../logging.ts';
import { InstantHttpAuthed, withCommand } from './http.ts';
import {
  apiSchemaToInstantSchemaDef,
  buildAutoRenameSelector,
  collectSystemCatalogIdentNames,
  convertTxSteps,
  diffSchemas,
  SchemaValidationError as PlatformSchemaError,
  validateSchema,
} from '@instantdb/platform';

import { OptsFromCommand, pushDef } from '../index.ts';
import { GlobalOpts } from '../context/globalOpts.ts';
import {
  groupSteps,
  renderSchemaPlan,
  SuperMigrationTx,
} from '../../renderSchemaPlan.ts';
import { promptOk } from './ui.ts';
import boxen from 'boxen';

const FetchSchemaResponse = Schema.Struct({
  schema: Schema.Struct({
    refs: Schema.Any,
    blobs: Schema.Any,
  }),
  attrs: Schema.Array(Schema.Any).pipe(Schema.mutable),
  'app-title': Schema.String,
}).pipe(Schema.mutable);

export class ReadSchemaFileError extends Schema.TaggedError<ReadSchemaFileError>(
  'ReadSchemaFileError',
)('ReadSchemaFileError', {
  message: Schema.String,
  cause: Schema.Any.pipe(Schema.optional),
}) {}

export class SchemaDiffError extends Schema.TaggedError<SchemaDiffError>(
  'SchemaDiffError',
)('SchemaDiffError', {
  message: Schema.String,
}) {}

export class GetSchemaError extends Schema.TaggedError<GetSchemaError>(
  'GetSchemaError',
)('GetSchemaError', {
  message: Schema.String,
}) {}

export class SchemaValidationError extends Schema.TaggedError<SchemaValidationError>(
  'SchemaValidationError',
)('SchemaValidationError', {
  message: Schema.String,
}) {}

export const pushSchema = (
  rename?: OptsFromCommand<typeof pushDef>['rename'],
) =>
  Effect.gen(function* () {
    const localSchemaFile = yield* Effect.tryPromise({
      try: readLocalSchemaFile,
      catch: (e) =>
        e instanceof Error
          ? ReadSchemaFileError.make({ message: e.message })
          : ReadSchemaFileError.make({ message: String(e) }),
    });
    if (!localSchemaFile || !localSchemaFile?.schema) {
      return yield* ReadSchemaFileError.make({
        message: `We couldn't find your ${chalk.yellow('`instant.schema.ts`')} file. Make sure it's in the root directory. (Hint: You can use an INSTANT_SCHEMA_FILE_PATH environment variable to specify it.)`,
      });
    }
    if (localSchemaFile.schema?.constructor?.name !== 'InstantSchemaDef') {
      return yield* SchemaValidationError.make({
        message: `We couldn't find your schema export.\nIn your ${chalk.yellow('`instant.schema.ts`')} file, make sure you ${chalk.green('`export default schema`')}`,
      });
    }

    const http = yield* InstantHttpAuthed;
    const { appId } = yield* CurrentApp;
    const res = yield* http
      .pipe(withCommand('push'))
      .get(`/dash/apps/${appId}/schema/pull`)
      .pipe(
        Effect.andThen(HttpClientResponse.schemaBodyJson(FetchSchemaResponse)),
        Effect.mapError((e) => GetSchemaError.make({ message: e.message })),
      );

    const currentAttrs = res['attrs'];
    const currentApiSchema = res['schema'];
    const oldSchema = apiSchemaToInstantSchemaDef(currentApiSchema, {
      disableTypeInference: true,
    });
    const systemCatalogIdentNames =
      collectSystemCatalogIdentNames(currentAttrs);

    yield* Effect.tryPromise({
      try: async () =>
        validateSchema(localSchemaFile.schema, systemCatalogIdentNames),
      catch: (e) => {
        if (e instanceof PlatformSchemaError) {
          return SchemaValidationError.make({
            message: 'Invalid Schema: ' + e.message,
          });
        }
        return SchemaValidationError.make({
          message: 'Failed to validate schema' + e,
        });
      },
    });
    const renames = rename && Array.isArray(rename) ? rename : [];
    const globalOpts = yield* GlobalOpts;
    const renameSelector = globalOpts.yes
      ? buildAutoRenameSelector(renames as any)
      : resolveRenames;

    const diffResult = yield* Effect.tryPromise(() =>
      diffSchemas(
        oldSchema,
        localSchemaFile.schema,
        renameSelector,
        systemCatalogIdentNames,
      ),
    ).pipe(
      Effect.mapError((e) => {
        if (e.cause instanceof Error) {
          return SchemaDiffError.make({ message: e.cause.message });
        }
        return e.message;
      }),
    );

    const txSteps = convertTxSteps(diffResult, currentAttrs);
    if (txSteps.length === 0) {
      yield* Effect.log(chalk.bgGray('No schema changes to apply!'));
      return;
    }

    const groupedSteps = groupSteps(diffResult);
    yield* confirmSchemaChanges(groupedSteps, currentAttrs);

    const pushRes = yield* http
      .pipe(
        HttpClient.mapRequestInputEffect(
          HttpClientRequest.bodyJson({
            steps: txSteps,
          }),
        ),
      )
      .post(`/dash/apps/${appId}/schema/steps/apply`)
      .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Any)));

    if (pushRes?.['indexing-jobs']) {
      // TODO: rewrite in effect
      yield* Effect.tryPromise({
        try: () =>
          waitForIndexingJobsToFinish(appId, pushRes?.['indexing-jobs'] || []),
        catch: (e: any) =>
          WaitForJobsError.make({
            message:
              e?.message || 'Error waiting for schema push jobs to finish',
          }),
      });
    }

    yield* Effect.log(chalk.green('Schema updated!'));
  });

export class WaitForJobsError extends Schema.TaggedError<WaitForJobsError>(
  'WaitForJobsError',
)('WaitForJobsError', {
  message: Schema.String,
}) {}

export class CancelSchemaError extends Data.TaggedError('CancelSchemaError')<{
  message: string;
}> {}

const confirmSchemaChanges = (steps: SuperMigrationTx[], currentAttrs: any[]) =>
  Effect.gen(function* () {
    const lines = renderSchemaPlan(steps, currentAttrs);
    const globalOpts = yield* GlobalOpts;
    if (globalOpts.yes) {
      console.log('Applying schema changes...');
      console.log(lines.join('\n'));

      return;
    }
    const wantsToPush = yield* promptOk({
      promptText: 'Push these changes?',
      yesText: 'Push',
      noText: 'Cancel',
      modifyOutput: (output) => {
        let both = lines.join('\n') + '\n\n' + output;
        return boxen(both, {
          dimBorder: true,
          padding: {
            left: 1,
            right: 1,
          },
        });
      },
    });
    if (!wantsToPush) {
      return yield* new CancelSchemaError({
        message: 'Schema Migration Cancelled',
      });
    }
  });
