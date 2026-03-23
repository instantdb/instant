import { Effect } from 'effect';
import JSON5 from 'json5';
import { OptsFromCommand, queryDef } from '../index.ts';
import { CurrentApp } from '../context/currentApp.ts';
import { BadArgsError } from '../errors.ts';
import { InstantHttpAuthed, withCommand } from '../lib/http.ts';
import { HttpBody } from '@effect/platform';

export const queryCmd = (arg: string, opts: OptsFromCommand<typeof queryDef>) =>
  Effect.gen(function* () {
    const { appId } = yield* CurrentApp;
    const contexts = [
      opts.admin,
      opts.asEmail,
      opts.asGuest,
      opts.asToken,
    ].filter(Boolean);
    if (contexts.length === 0) {
      return yield* BadArgsError.make({
        message:
          'Please specify a context: --admin, --as-email <email>, or --as-guest',
      });
    }
    if (contexts.length > 1) {
      return yield* BadArgsError.make({
        message:
          'Please specify only one context: --admin, --as-email <email>, or --as-guest',
      });
    }

    const query = yield* Effect.try(() => JSON5.parse(arg)).pipe(
      Effect.mapError((e) =>
        BadArgsError.make({
          message: `Invalid query: ${e.error}`,
        }),
      ),
    );

    const headers = { 'app-id': appId };
    if (opts.asEmail) {
      headers['as-email'] = opts.asEmail;
    } else if (opts.asGuest) {
      headers['as-guest'] = 'true';
    } else if (opts.asToken) {
      headers['as-token'] = opts.asToken;
    }

    const http = (yield* InstantHttpAuthed).pipe(withCommand('query'));
    const response = yield* http.post('/admin/query', {
      headers,
      body: HttpBody.unsafeJson({
        query,
      }),
    });
    const body = yield* response.json;
    yield* Effect.log(JSON.stringify(body, null, 2));
  });
