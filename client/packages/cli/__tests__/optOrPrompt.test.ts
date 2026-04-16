import { test, expect, describe, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { optOrPrompt } from '../src/lib/ui.ts';
import { GlobalOpts } from '../src/context/globalOpts.ts';

// -- helpers --

const run = (
  effect: Effect.Effect<string | undefined, any, GlobalOpts>,
  yes: boolean,
) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(Layer.succeed(GlobalOpts, { yes }))),
  );

const runFail = (
  effect: Effect.Effect<string | undefined, any, GlobalOpts>,
  yes: boolean,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.flip,
      Effect.provide(Layer.succeed(GlobalOpts, { yes })),
    ),
  );

// Mock renderUnwrap so we never touch real TTY.
let mockPromptReturn = '';
vi.mock('../src/ui/lib.ts', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    renderUnwrap: () => Promise.resolve(mockPromptReturn),
  };
});

const basePrompt = { prompt: 'Client ID:' } as any;

// -- skipIf gate --

describe('skipIf gate', () => {
  test('skipIf=true + value provided → error', async () => {
    const err = await runFail(
      optOrPrompt('https://mysite.com/callback', {
        required: false,
        simpleName: '--custom-redirect-uri',
        skipIf: true,
        skipMessage:
          'Provided custom redirect URI when not using web app type.',
        prompt: basePrompt,
      }),
      false,
    );
    expect(err.message).toBe(
      'Provided custom redirect URI when not using web app type.',
    );
  });

  test('skipIf=true + no value → undefined', async () => {
    const result = await run(
      optOrPrompt(undefined, {
        required: false,
        simpleName: '--custom-redirect-uri',
        skipIf: true,
        prompt: basePrompt,
      }),
      false,
    );
    expect(result).toBeUndefined();
  });
});

// -- non-interactive (yes=true) --

describe('non-interactive (yes=true)', () => {
  describe('required=true', () => {
    test('no value → error', async () => {
      const err = await runFail(
        optOrPrompt(undefined, {
          required: true,
          simpleName: '--client-id',
          skipIf: false,
          prompt: basePrompt,
        }),
        true,
      );
      expect(err.message).toBe('Missing required value for --client-id');
    });

    test('number value → stringified', async () => {
      const result = await run(
        optOrPrompt(42, {
          required: true,
          simpleName: '--client-id',
          skipIf: false,
          prompt: basePrompt,
        }),
        true,
      );
      expect(result).toBe('42');
    });

    test('non-string/number value → error', async () => {
      const err = await runFail(
        optOrPrompt(true, {
          required: true,
          simpleName: '--client-id',
          skipIf: false,
          prompt: basePrompt,
        }),
        true,
      );
      expect(err.message).toBe('Invalid value for --client-id');
    });

    test('valid string → trimmed value', async () => {
      const result = await run(
        optOrPrompt(' abc123.apps.googleusercontent.com ', {
          required: true,
          simpleName: '--client-id',
          skipIf: false,
          prompt: basePrompt,
        }),
        true,
      );
      expect(result).toBe('abc123.apps.googleusercontent.com');
    });
  });

  describe('required=false', () => {
    test('no value → undefined', async () => {
      const result = await run(
        optOrPrompt(undefined, {
          required: false,
          simpleName: '--custom-redirect-uri',
          skipIf: false,
          prompt: basePrompt,
        }),
        true,
      );
      expect(result).toBeUndefined();
    });

    test('non-string/number value → error', async () => {
      const err = await runFail(
        optOrPrompt(true, {
          required: false,
          simpleName: '--custom-redirect-uri',
          skipIf: false,
          prompt: basePrompt,
        }),
        true,
      );
      expect(err.message).toBe('Invalid value for --custom-redirect-uri');
    });

    test('valid string → trimmed value', async () => {
      const result = await run(
        optOrPrompt(' https://mysite.com/oauth/callback ', {
          required: false,
          simpleName: '--custom-redirect-uri',
          skipIf: false,
          prompt: basePrompt,
        }),
        true,
      );
      expect(result).toBe('https://mysite.com/oauth/callback');
    });
  });
});

// -- interactive (yes=false) --

describe('interactive (yes=false)', () => {
  test('value already provided → use it directly', async () => {
    const result = await run(
      optOrPrompt(' abc123.apps.googleusercontent.com ', {
        required: true,
        simpleName: '--client-id',
        skipIf: false,
        prompt: basePrompt,
      }),
      false,
    );
    expect(result).toBe('abc123.apps.googleusercontent.com');
  });

  test('no value + user types a value → trimmed result', async () => {
    mockPromptReturn = ' GOCSPX-secret123 ';
    const result = await run(
      optOrPrompt(undefined, {
        required: true,
        simpleName: '--client-secret',
        skipIf: false,
        prompt: basePrompt,
      }),
      false,
    );
    expect(result).toBe('GOCSPX-secret123');
  });

  test('no value + user enters empty + required → error', async () => {
    mockPromptReturn = '';
    const err = await runFail(
      optOrPrompt(undefined, {
        required: true,
        simpleName: '--client-secret',
        skipIf: false,
        prompt: basePrompt,
      }),
      false,
    );
    expect(err.message).toBe('Missing required value for --client-secret');
  });

  test('no value + user enters empty + optional → undefined', async () => {
    mockPromptReturn = '';
    const result = await run(
      optOrPrompt(undefined, {
        required: false,
        simpleName: '--custom-redirect-uri',
        skipIf: false,
        prompt: basePrompt,
      }),
      false,
    );
    expect(result).toBeUndefined();
  });
});
