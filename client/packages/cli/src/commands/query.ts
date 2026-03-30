import { Effect, Layer } from 'effect';
import JSON5 from 'json5';
import { queryDef } from '../index.ts';
import type { OptsFromCommand } from '../index.ts';
import { CurrentApp } from '../context/currentApp.ts';
import { BadArgsError } from '../errors.ts';
import { InstantHttpAuthed, withCommand } from '../lib/http.ts';
import { HttpBody } from '@effect/platform';
import { WithAppLayer } from '../layer.ts';

export const queryCmd = (arg: string, opts: OptsFromCommand<typeof queryDef>) =>
  Effect.gen(function* () {
    const { appId } = yield* CurrentApp;
    const contexts = [
      opts.admin,
      opts.asEmail,
      opts.asGuest,
      opts.asToken,
    ].filter(Boolean);
    if (contexts.length > 1) {
      return yield* BadArgsError.make({
        message:
          'Please specify exactly one context: --admin, --as-email <email>, --as-guest, or --as-token <token>',
      });
    }

    const query = yield* Effect.try({
      try: () => JSON5.parse(arg),
      catch: (e) =>
        BadArgsError.make({
          message: String(e),
        }),
    });

    const headers: Record<string, string> = { 'app-id': appId };
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
        'inference?': true,
      }),
    });
    const body = yield* response.json;
    yield* Effect.log(JSON.stringify(body, null, 2));
  }).pipe(
    Effect.provide(
      WithAppLayer({
        coerce: false,
        appId: opts.app,
      }).pipe(Layer.annotateLogs('silent', true)),
    ),
  );
