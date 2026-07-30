import { Effect } from 'effect';
import chalk from 'chalk';
import { removeConfigAuthToken } from '../auth.ts';
import { getBaseUrl } from '../util/apiUrl.ts';

export const logoutCommand = Effect.fn(function* () {
  const apiUrl = yield* getBaseUrl;

  yield* Effect.matchEffect(
    Effect.tryPromise(() => removeConfigAuthToken(apiUrl)),
    {
      onFailure: (e) =>
        Effect.logError(chalk.red('Failed to logout: ' + e.message)),
      onSuccess: (result) =>
        result === 'removed'
          ? Effect.log(chalk.green('Successfully logged out from Instant!'))
          : Effect.log(chalk.green('You were already logged out!')),
    },
  );
});
