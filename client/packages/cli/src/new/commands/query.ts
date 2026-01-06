import { Effect } from 'effect';
import JSON5 from 'json5';
import { OptsFromCommand, queryDef } from '../index.js';
import { CurrentApp } from '../context/currentApp.js';
import { WithAppLayer } from '../layer.js';
import { BadArgsError } from '../errors.js';
import { InstantHttpAuthed, withCommand } from '../lib/http.js';
import { HttpBody } from '@effect/platform';

export const queryCmd = (arg: string, opts: OptsFromCommand<typeof queryDef>) =>
  Effect.gen(function* () {
    const { appId } = yield* CurrentApp;
    const contextCount =
      (opts.admin ? 1 : 0) + (opts.asEmail ? 1 : 0) + (opts.asGuest ? 1 : 0);
    if (contextCount === 0) {
      return yield* BadArgsError.make({
        message:
          'Please specify a context: --admin, --as-email <email>, or --as-guest',
      });
    }
    if (contextCount > 1) {
      return yield* BadArgsError.make({
        message:
          'Please specify only one context: --admin, --as-email <email>, or --as-guest',
      });
    }

    const query = yield* Effect.try(() => JSON5.parse(arg)).pipe(
      Effect.mapError((e) =>
        BadArgsError.make({
          message: `Invalid query: ${e.cause}`,
        }),
      ),
    );
    const headers = { 'app-id': appId };
    if (opts.asEmail) {
      headers['as-email'] = opts.asEmail;
    } else if (opts.asGuest) {
      headers['as-guest'] = 'true';
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
  }).pipe(
    Effect.provide(
      WithAppLayer({
        coerce: false,
        appId: opts.app,
      }),
    ),
  );
