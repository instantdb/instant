import { FileSystem, HttpClientResponse, Path } from '@effect/platform';
import {
  apiSchemaToInstantSchemaDef,
  generateSchemaTypescriptFile,
} from '@instantdb/platform';
import { Effect, Schema } from 'effect';
import prettier from 'prettier';
import { countEntities, readLocalSchemaFile } from '../../index.js';
import { UI } from '../../ui/index.js';
import { getSchemaPathToWrite } from '../../util/findConfigCandidates.js';
import { CurrentApp } from '../context/currentApp.js';
import { ProjectInfo } from '../context/projectInfo.js';
import { InstantHttpAuthed, withCommand } from './http.js';
import { promptOk } from './ui.js';
import { ReadSchemaFileError } from './pushSchema.js';
import { mergeSchema, MergeSchemaError } from '../../util/mergeSchema.js';

export const pullSchema = ({
  experimentalTypePreservation,
}: {
  experimentalTypePreservation?: boolean;
}) =>
  Effect.gen(function* () {
    yield* Effect.log('Pulling schema...');
    const { appId } = yield* CurrentApp;
    const http = yield* InstantHttpAuthed;

    const schemaResponse = yield* http
      .pipe(withCommand('pull'))
      .get(`/dash/apps/${appId}/schema/pull`)
      .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Any))); // parse result body into "any"

    if (
      !countEntities(schemaResponse.schema.refs) &&
      !countEntities(schemaResponse.schema.blobs)
    ) {
      yield* Effect.log('Schema is empty. Skipping.');
      return;
    }

    const prevSchemaFile = yield* Effect.tryPromise(readLocalSchemaFile).pipe(
      Effect.mapError((err) =>
        ReadSchemaFileError.make({
          message: `Error reading local schema file: ${err}`,
          cause: err,
        }),
      ),
    );
    const shortSchemaPath = getSchemaPathToWrite(prevSchemaFile?.path);
    const path = yield* Path.Path;
    const { pkgDir, instantModuleName } = yield* ProjectInfo;
    const schemaPath = path.join(pkgDir, shortSchemaPath);

    if (prevSchemaFile) {
      const shouldContinue = yield* promptOk({
        promptText: `This will overwrite your local ${shortSchemaPath} file, OK to proceed?`,
        modifyOutput: UI.modifiers.yPadding,
        inline: true,
      });
      if (!shouldContinue) return;
    }

    let newSchemaContent = generateSchemaTypescriptFile(
      prevSchemaFile?.schema,
      apiSchemaToInstantSchemaDef(schemaResponse.schema),
      instantModuleName,
    );

    if (prevSchemaFile && experimentalTypePreservation) {
      const fs = yield* FileSystem.FileSystem;
      const oldSchemaContent = yield* fs.readFileString(prevSchemaFile.path);
      newSchemaContent = yield* Effect.try(() =>
        mergeSchema(oldSchemaContent, newSchemaContent),
      ).pipe(
        Effect.mapError((e) => new MergeSchemaError({ message: e.message })),
      );
    }
    yield* writeTypescript(schemaPath, newSchemaContent);
    yield* Effect.log('✅ Wrote schema to ' + shortSchemaPath);
  });

export const writeTypescript = (path: string, content: string) =>
  Effect.gen(function* () {
    const prettierConfig = yield* Effect.tryPromise(() =>
      prettier.resolveConfig(path),
    );
    const formattedCode = yield* Effect.tryPromise(() =>
      prettier.format(content, {
        ...prettierConfig,
        parser: 'typescript',
      }),
    );
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(path, formattedCode);
  });
