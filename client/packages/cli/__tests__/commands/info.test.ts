import { it, expect } from '@effect/vitest';
import { infoCommand } from '../../src/new/commands/info.ts';
import { Effect } from 'effect';

it.effect('info command', () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(infoCommand());
    expect(exit._op).toBe('Success');
  }),
);
