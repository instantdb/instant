import { Effect, Schema } from 'effect';
import { CurrentApp } from '../context/currentApp.js';
import { InstantHttpAuthed, withCommand } from './http.js';
import { HttpClientResponse } from '@effect/platform';
import { readLocalPermsFile } from '../../index.js';
import { getPermsPathToWrite } from '../../util/findConfigCandidates.js';
import { promptOk } from './ui.js';
import { UI } from '../../ui/index.js';
import { writeTypescript } from './pullSchema.js';
import { generatePermsTypescriptFile } from '@instantdb/platform';
import { ProjectInfo } from '../context/projectInfo.js';
import { Path } from '@effect/platform';

export const pullPerms = Effect.gen(function* () {
  yield* Effect.log('Pulling perms...');
  const { appId } = yield* CurrentApp;
  const http = yield* InstantHttpAuthed;
  const permsResponse = yield* http
    .pipe(withCommand('pull'))
    .get(`/dash/apps/${appId}/perms/pull`)
    .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Any))); // parse result body into "any"

  const prevPermsFile = yield* Effect.tryPromise(readLocalPermsFile);
  const shortPermsPath = getPermsPathToWrite(prevPermsFile?.path);

  if (prevPermsFile) {
    const shouldContinue = yield* promptOk({
      promptText: `This will overwrite your local ${shortPermsPath} file, OK to proceed?`,
      modifyOutput: UI.modifiers.yPadding,
      inline: true,
    });
    if (!shouldContinue) return;
  }
  const { instantModuleName, pkgDir } = yield* ProjectInfo;
  const fileContent = generatePermsTypescriptFile(
    permsResponse.perms || {},
    instantModuleName,
  );

  const path = yield* Path.Path;

  yield* writeTypescript(path.join(pkgDir, shortPermsPath), fileContent);
  yield* Effect.log('✅ Wrote permissions to ' + shortPermsPath);
});
