import { test, expect, describe, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { promptOk } from '../src/lib/ui.ts';
import { GlobalOpts } from '../src/context/globalOpts.ts';
import { CancelledPromptError } from '../src/ui/lib.ts';

const run = (effect: Effect.Effect<boolean, any, GlobalOpts>, yes: boolean) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(Layer.succeed(GlobalOpts, { yes }))),
  );

const runFail = (effect: Effect.Effect<boolean, any, GlobalOpts>, yes: boolean) =>
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

const pushPrompt = {
  promptText: 'Push these changes?',
  yesText: 'Push',
  noText: 'Cancel',
};

describe('promptOk', () => {
  test('yes flag → returns defaultValue without prompting', async () => {
    const result = await run(promptOk(pushPrompt, true), true);
    expect(result).toBe(true);
  });

  test('user picks Yes → true', async () => {
    mockPromptReturn = true;
    const result = await run(promptOk(pushPrompt), false);
    expect(result).toBe(true);
  });

  test('user picks No → false', async () => {
    mockPromptReturn = false;
    const result = await run(promptOk(pushPrompt), false);
    expect(result).toBe(false);
  });

  test('user hits Esc with defaultValue=true → fails with CancelledPromptError, not pushes', async () => {
    mockPromptReturn = () => {
      throw new CancelledPromptError('Prompt was aborted');
    };
    const err: any = await runFail(promptOk(pushPrompt, true), false);
    expect(err.error).toBeInstanceOf(CancelledPromptError);
  });

  test('user hits Esc with defaultValue=false → fails with CancelledPromptError', async () => {
    mockPromptReturn = () => {
      throw new CancelledPromptError('Prompt was aborted');
    };
    const err: any = await runFail(promptOk(pushPrompt, false), false);
    expect(err.error).toBeInstanceOf(CancelledPromptError);
  });
});
