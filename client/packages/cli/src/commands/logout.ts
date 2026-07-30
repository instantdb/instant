import { Effect } from 'effect';
import chalk from 'chalk';
import { removeAuthToken } from '../auth/index.ts';
import { getBaseUrl } from '../lib/config.ts';

export const logoutCommand = Effect.fn(function* () {
  const apiURI = yield* getBaseUrl;
  yield* Effect.tryPromise(() => removeAuthToken(apiURI)).pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.logError(chalk.red(`Failed to logout: ${error.message}`)),
      onSuccess: (removed) =>
        Effect.log(
          chalk.green(
            removed
              ? 'Successfully logged out from Instant!'
              : 'You were already logged out!',
          ),
        ),
    }),
  );
});
