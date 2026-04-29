import chalk from 'chalk';
import { Effect } from 'effect';
import openInBrowser from 'open';
import { loginDef } from '../index.ts';
import type { OptsFromCommand } from '../index.ts';
import { getDashUrl } from '../lib/http.ts';
import {
  getLoginTicketAndSecret,
  saveConfigAuthToken,
  waitForAuthToken,
} from '../lib/login.ts';
import { promptOk } from '../lib/ui.ts';
import { isHeadlessEnvironment } from '../util/isHeadlessEnvironment.ts';

const loginUrlMessage = (url: string) =>
  `Open this URL in a browser to log in:\n ${url}\n`;

export const loginCommand = Effect.fn(function* (
  opts: OptsFromCommand<typeof loginDef>,
) {
  yield* Effect.log("Let's log you in!");

  const loginInfo = yield* getLoginTicketAndSecret;
  const { secret, ticket } = loginInfo;
  const dashOrigin = yield* getDashUrl;
  const loginUrl = `${dashOrigin}/dash?ticket=${ticket}`;
  yield* Effect.log();
  if (isHeadlessEnvironment(opts)) {
    yield* Effect.log(loginUrlMessage(loginUrl));
  } else {
    const ok = yield* promptOk(
      {
        promptText:
          'This will open instantdb.com in your browser, OK to proceed?',
      },
      true,
    );
    if (!ok) {
      process.exit(0);
    }
    yield* Effect.tryPromise(() => openInBrowser(loginUrl)).pipe(
      Effect.catchAll(() => Effect.log(loginUrlMessage(loginUrl))),
    );
  }

  yield* Effect.log('Waiting for authentication...');

  const result = yield* waitForAuthToken(secret);
  const { token, email } = result;
  if (opts.print) {
    yield* Effect.log(
      chalk.red('[Do not share] Your Instant auth token:', token),
    );
  } else {
    yield* saveConfigAuthToken(token);
    yield* Effect.log(chalk.green(`Successfully logged in as ${email}!`));
  }
  return {
    authToken: token,
    source: 'file' as const,
  };
});
