import { Effect } from 'effect';
import { getAuthPaths } from '../../util/getAuthPaths.js';
import { FileSystem } from '@effect/platform';
import chalk from 'chalk';
import { SystemError } from '@effect/platform/Error';
import { error } from '../logging.js';

export const logoutCommand = Effect.fn(function* () {
  const { authConfigFilePath } = getAuthPaths();
  const fs = yield* FileSystem.FileSystem;

  yield* Effect.matchEffect(fs.remove(authConfigFilePath), {
    onFailure: (e) =>
      Effect.gen(function* () {
        if (e instanceof SystemError && e.reason === 'NotFound') {
          yield* Effect.log(chalk.green('You were already logged out!'));
        } else {
          yield* Effect.logError(chalk.red('Failed to logout: ' + e.message));
        }
      }),
    onSuccess: () =>
      Effect.log(chalk.green('Successfully logged out from Instant!')),
  });
});
