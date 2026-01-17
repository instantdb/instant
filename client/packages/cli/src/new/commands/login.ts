import { Effect } from 'effect';
import { ArgsFromCommand, loginDef } from '../index.js';
import { InstantHttp } from '../lib/http.js';
import { HttpClientRequest, HttpClientResponse } from '@effect/platform';
import { getLoginTicketAndSecret } from '../lib/login.js';
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
  console.log();
  if (isHeadLessEnvironment(opts)) {
    console.log(
      `Open this URL in a browser to log in:\n ${instantDashOrigin}/dash?ticket=${ticket}\n`,
    );
  } else {
    const ok = yield* promptOk(
      'This will open instantdb.com in your browser, OK to proceed?',
      true,
    );
    if (!ok) return;
    // open in browser
  }
});
