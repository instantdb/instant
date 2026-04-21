import { test, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { promptOk } from '../src/lib/ui.ts';
import { GlobalOpts } from '../src/context/globalOpts.ts';
import { CancelledPromptError } from '../src/ui/lib.ts';

const runFail = (
  effect: Effect.Effect<boolean, any, GlobalOpts>,
  yes: boolean,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.flip,
      Effect.provide(Layer.succeed(GlobalOpts, { yes })),
    ),
  );

let mockPromptReturn: boolean | (() => never) = true;
vi.mock('../src/ui/lib.ts', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    renderUnwrap: () => {
      if (typeof mockPromptReturn === 'function') {
        return Promise.reject(mockPromptReturn());
      }
      return Promise.resolve(mockPromptReturn);
    },
  };
});

test('errors from renderUnwrap propagate (do not fall back to defaultValue)', async () => {
  mockPromptReturn = () => {
    throw new CancelledPromptError('Prompt was aborted');
  };
  const err: any = await runFail(
    promptOk(
      { promptText: 'Push these changes?', yesText: 'Push', noText: 'Cancel' },
      true,
    ),
    false,
  );
  expect(err.error).toBeInstanceOf(CancelledPromptError);
});
