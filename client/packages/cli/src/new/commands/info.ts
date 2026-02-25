import { Effect } from 'effect';
import { AuthToken, authTokenGetEffect } from '../context/authToken.js';
import { AuthLayerLive } from '../layer.js';

export const infoCommand = () =>
  Effect.gen(function* () {
    const token = yield* AuthToken;
    console.log(token);
  }).pipe(
    Effect.provide(AuthLayerLive),
    Effect.catchTag('NotAuthedError', () =>
      Effect.gen(function* () {
        console.log('Not logged in.');
      }),
    ),
  );
