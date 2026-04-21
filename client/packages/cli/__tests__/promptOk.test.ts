import { test, expect, describe, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { promptOk } from '../src/lib/ui.ts';
import { GlobalOpts } from '../src/context/globalOpts.ts';
import { CancelledPromptError } from '../src/ui/lib.ts';

const run = (effect: Effect.Effect<boolean, any, GlobalOpts>, yes: boolean) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(Layer.succeed(GlobalOpts, { yes }))),
  );

let mockPromptReturn: boolean | Error = true;
vi.mock('../src/ui/lib.ts', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    renderUnwrap: () =>
      mockPromptReturn instanceof Error
        ? Promise.reject(mockPromptReturn)
        : Promise.resolve(mockPromptReturn),
  };
});

const baseProps = { promptText: 'Push these changes?' };

describe('yes flag', () => {
  test('yes=true → returns defaultValue (true)', async () => {
    const result = await run(promptOk(baseProps, true), true);
    expect(result).toBe(true);
  });

  test('yes=true → returns defaultValue (false)', async () => {
    const result = await run(promptOk(baseProps, false), true);
    expect(result).toBe(false);
  });
});

describe('interactive', () => {
  test('user confirms → true', async () => {
    mockPromptReturn = true;
    const result = await run(promptOk(baseProps, true), false);
    expect(result).toBe(true);
  });

  test('user declines → false', async () => {
    mockPromptReturn = false;
    const result = await run(promptOk(baseProps, true), false);
    expect(result).toBe(false);
  });

  test('user aborts (Esc) → false, even when defaultValue=true', async () => {
    mockPromptReturn = new CancelledPromptError('Prompt was aborted');
    const result = await run(promptOk(baseProps, true), false);
    expect(result).toBe(false);
  });
});
