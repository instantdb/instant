import chalk from 'chalk';
import { Effect } from 'effect';
import openInBrowser from 'open';
import { ArgsFromCommand, loginDef } from '../index.js';
import { getDashUrl } from '../lib/http.js';
import {
  getLoginTicketAndSecret,
  saveConfigAuthToken,
  waitForAuthToken,
} from '../lib/login.js';
import { promptOk } from '../lib/ui.js';

const isHeadLessEnvironment = (opts: ArgsFromCommand<typeof loginDef>) => {
  const noBrowserMode = Boolean(
    process.env.INSTANT_CLI_NO_BROWSER || process.env.CI || opts?.headless,
  );

  // Check for common headless environment indicators
  return (
    noBrowserMode ||
    process.env.TERM === 'dumb' ||
    process.env.SSH_CONNECTION !== undefined ||
    process.env.SSH_CLIENT !== undefined ||
    (!process.env.DISPLAY && process.platform === 'linux') ||
    process.env.WSL_DISTRO_NAME !== undefined
  );
};

export const loginCommand = Effect.fn(function* (
  opts: ArgsFromCommand<typeof loginDef>,
) {
  console.log("Let's log you in!");

  const loginInfo = yield* getLoginTicketAndSecret;
  const { secret, ticket } = loginInfo;
  const dashOrigin = yield* getDashUrl;
  console.log();
  // TODO: flip these so rejecting the prompt prints url
  if (isHeadLessEnvironment(opts)) {
    console.log(
      `Open this URL in a browser to log in:\n ${dashOrigin}/dash?ticket=${ticket}\n`,
    );
  } else {
    const ok = yield* promptOk(
      {
        promptText:
          'This will open instantdb.com in your browser, OK to proceed?',
      },
      true,
    );
    if (!ok) {
      process.exit(1);
    }
    yield* Effect.tryPromise(() =>
      openInBrowser(`${dashOrigin}/dash?ticket=${ticket}`),
    );
  }

  console.log('Waiting for authentication...');

  const result = yield* waitForAuthToken(secret);
  const { token, email } = result;
  if (opts.print) {
    console.log(chalk.red('[Do not share] Your Instant auth token:', token));
  } else {
    yield* saveConfigAuthToken(token);
    console.log(chalk.green(`Successfully logged in as ${email}!`));
  }
  return {
    authToken: token,
    source: 'file' as const,
  };
});
