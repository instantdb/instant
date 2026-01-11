import { Effect } from 'effect';
import { ArgsFromCommand, initDef } from '../index.js';

export const initCommand = Effect.fn(function* (
  opts: ArgsFromCommand<typeof initDef>,
) {
  console.log(opts);
  yield* Effect.log('Testing');
});
