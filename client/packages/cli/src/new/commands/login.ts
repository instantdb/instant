import { Effect } from 'effect';
import { ArgsFromCommand, loginDef } from '../index.js';
import { InstantHttp } from '../lib/http.js';
import { HttpClientRequest, HttpClientResponse } from '@effect/platform';
import { getLoginTicketAndSecret } from '../lib/login.js';

export const loginCommand = Effect.fn(function* (
  opts: ArgsFromCommand<typeof loginDef>,
) {
  console.log("Let's log you in!");

  const loginInfo = yield* getLoginTicketAndSecret;
  const { secret, ticket } = loginInfo;
  console.log();
});
