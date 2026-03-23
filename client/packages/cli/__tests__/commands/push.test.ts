import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { getAppLayer } from '../effectHelpers.ts';
import { pushCommand } from '../../src/new/commands/push.ts';

it.effect('push command', ({ task }) =>
  Effect.gen(function* () {
    const testLayer = yield* getAppLayer('hi');
    yield* pushCommand('perms', {}).pipe(Effect.provide(testLayer));
  }),
);
