import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { getAppLayer } from '../effectHelpers.js';
import { pushCommand } from '../../src/new/commands/push.js';

it.effect('push command', ({ task }) =>
  Effect.gen(function* () {
    const testLayer = yield* getAppLayer('hi');
    yield* pushCommand('perms', {}).pipe(Effect.provide(testLayer));
  }),
);
