import { test, expect, describe, expectTypeOf, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { Args } from '../src/lib/args.ts';
import { GlobalOpts } from '../src/context/globalOpts.ts';
import { BadArgsError } from '../src/errors.ts';

const run = <A>(effect: Effect.Effect<A, any, GlobalOpts>, yes: boolean) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(Layer.succeed(GlobalOpts, { yes }))),
  );

const runFail = <A>(effect: Effect.Effect<A, any, GlobalOpts>, yes: boolean) =>
  Effect.runPromise(
    effect.pipe(
      Effect.flip,
      Effect.provide(Layer.succeed(GlobalOpts, { yes })),
    ),
  );

let mockPromptReturn: unknown = '';
vi.mock('../src/ui/lib.ts', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    renderUnwrap: () => Promise.resolve(mockPromptReturn),
  };
});

const basePrompt = { prompt: 'Client ID:' } as any;

describe('types', () => {
  test('required return type accounts for inactive args', () => {
    const requiredValue = Args.text(
      { 'client-id': 'abc123' },
      'client-id',
    ).pipe(Args.required());

    expectTypeOf(requiredValue).toEqualTypeOf<
      Effect.Effect<string, BadArgsError>
    >();

    const conditionallyRequiredValue = Args.text({}, 'client-id').pipe(
      Args.availableWhen(false),
      Args.required(),
    );

    expectTypeOf(conditionallyRequiredValue).toEqualTypeOf<
      Effect.Effect<string | undefined, BadArgsError>
    >();
  });
});

describe('availableWhen', () => {
  test('unavailable + value provided -> error', async () => {
    const err = await runFail(
      Args.text(
        {
          'custom-redirect-uri': 'https://mysite.com/callback',
        },
        'custom-redirect-uri',
      ).pipe(
        Args.availableWhen(false, {
          message: 'Provided custom redirect URI when not using web app type.',
        }),
        Args.optional(),
      ),
      false,
    );

    expect(err.message).toBe(
      'Provided custom redirect URI when not using web app type.',
    );
  });

  test('unavailable + empty value provided -> error', async () => {
    const err = await runFail(
      Args.text({ 'custom-redirect-uri': '' }, 'custom-redirect-uri').pipe(
        Args.availableWhen(false, {
          message: 'Provided custom redirect URI when not using web app type.',
        }),
        Args.optional(),
      ),
      false,
    );

    expect(err.message).toBe(
      'Provided custom redirect URI when not using web app type.',
    );
  });

  test('unavailable + no value -> undefined', async () => {
    const result = await run(
      Args.text({}, 'custom-redirect-uri').pipe(
        Args.availableWhen(false),
        Args.optional(),
      ),
      false,
    );

    expect(result).toBeUndefined();
  });
});

describe('validate', () => {
  test('valid value -> passes through', async () => {
    const result = await run(
      Args.text({ 'project-id': 'my-project' }, 'project-id').pipe(
        Args.validate((value) =>
          value.includes('_')
            ? 'Project ID cannot include underscores.'
            : undefined,
        ),
        Args.required(),
      ),
      true,
    );

    expect(result).toBe('my-project');
  });

  test('invalid value -> error', async () => {
    const err = await runFail(
      Args.text({ 'project-id': 'my_project' }, 'project-id').pipe(
        Args.validate((value) =>
          value.includes('_')
            ? 'Project ID cannot include underscores.'
            : undefined,
        ),
        Args.required(),
      ),
      true,
    );

    expect(err.message).toBe('Project ID cannot include underscores.');
  });
});

describe('non-interactive', () => {
  test('required missing value -> error', async () => {
    const err = await runFail(
      Args.text({}, 'client-id').pipe(Args.prompt(basePrompt), Args.required()),
      true,
    );

    expect(err.message).toBe('Missing required value for --client-id');
  });

  test('required missing value with prompt default -> default value', async () => {
    const result = await run(
      Args.text({}, 'name').pipe(
        Args.prompt({ prompt: 'Client Name:', defaultValue: 'github' }),
        Args.required(),
      ),
      true,
    );

    expect(result).toBe('github');
  });

  test('number value -> stringified', async () => {
    const result = await run(
      Args.text({ 'client-id': 42 }, 'client-id').pipe(Args.required()),
      true,
    );

    expect(result).toBe('42');
  });

  test('non-string/number value -> error', async () => {
    const err = await runFail(
      Args.text({ 'client-id': true }, 'client-id').pipe(Args.required()),
      true,
    );

    expect(err.message).toBe('Invalid value for --client-id');
  });

  test('valid string -> trimmed value', async () => {
    const result = await run(
      Args.text(
        { 'client-id': ' abc123.apps.googleusercontent.com ' },
        'client-id',
      ).pipe(Args.required()),
      true,
    );

    expect(result).toBe('abc123.apps.googleusercontent.com');
  });

  test('optional missing value -> undefined', async () => {
    const result = await run(
      Args.text({}, 'custom-redirect-uri').pipe(Args.optional()),
      true,
    );

    expect(result).toBeUndefined();
  });

  test('simpleName overrides display flag without changing lookup key', async () => {
    const result = await run(
      Args.text(
        { customRedirectUri: 'https://example.com/callback' },
        'customRedirectUri',
        { simpleName: '--custom-redirect-uri' },
      ).pipe(Args.required()),
      true,
    );

    expect(result).toBe('https://example.com/callback');

    const err = await runFail(
      Args.text({}, 'customRedirectUri', {
        simpleName: '--custom-redirect-uri',
      }).pipe(Args.required()),
      true,
    );

    expect(err.message).toBe(
      'Missing required value for --custom-redirect-uri',
    );
  });

  test('does not fall back to other key shapes', async () => {
    const err = await runFail(
      Args.text(
        { 'custom-redirect-uri': 'https://example.com/callback' },
        'customRedirectUri',
        { simpleName: '--custom-redirect-uri' },
      ).pipe(Args.required()),
      true,
    );

    expect(err.message).toBe(
      'Missing required value for --custom-redirect-uri',
    );
  });

  test('boolean value -> parsed', async () => {
    const result = await run(
      Args.bool({ 'configure-web': true }, 'configure-web').pipe(
        Args.optional(),
      ),
      true,
    );

    expect(result).toBe(true);
  });

  test('boolean string value -> parsed', async () => {
    const result = await run(
      Args.bool({ 'configure-web': 'false' }, 'configure-web').pipe(
        Args.optional(),
      ),
      true,
    );

    expect(result).toBe(false);
  });

  test('invalid boolean value -> error', async () => {
    const err = await runFail(
      Args.bool({ 'configure-web': 'sometimes' }, 'configure-web').pipe(
        Args.optional(),
      ),
      true,
    );

    expect(err.message).toBe('Invalid value for --configure-web');
  });

  test('missing confirmation returns default value', async () => {
    const result = await run(
      Args.bool({}, 'configure-web').pipe(
        Args.confirm({
          promptText: 'Configure web redirect flow?',
          defaultValue: false,
        }),
        Args.required(),
      ),
      true,
    );

    expect(result).toBe(false);
  });
});

describe('interactive', () => {
  test('value already provided -> use it directly', async () => {
    const result = await run(
      Args.text(
        { 'client-id': ' abc123.apps.googleusercontent.com ' },
        'client-id',
      ).pipe(Args.prompt(basePrompt), Args.required()),
      false,
    );

    expect(result).toBe('abc123.apps.googleusercontent.com');
  });

  test('no value + user types a value -> trimmed result', async () => {
    mockPromptReturn = ' GOCSPX-secret123 ';

    const result = await run(
      Args.text({}, 'client-secret').pipe(
        Args.prompt(basePrompt),
        Args.required(),
      ),
      false,
    );

    expect(result).toBe('GOCSPX-secret123');
  });

  test('no value + user enters empty + required -> error', async () => {
    mockPromptReturn = '';

    const err = await runFail(
      Args.text({}, 'client-secret').pipe(
        Args.prompt(basePrompt),
        Args.required(),
      ),
      false,
    );

    expect(err.message).toBe('Missing required value for --client-secret');
  });

  test('no value + user enters empty + optional -> undefined', async () => {
    mockPromptReturn = '';

    const result = await run(
      Args.text({}, 'custom-redirect-uri').pipe(
        Args.prompt(basePrompt),
        Args.optional(),
      ),
      false,
    );

    expect(result).toBeUndefined();
  });

  test('no boolean value + user confirms -> result', async () => {
    mockPromptReturn = true;

    const result = await run(
      Args.bool({}, 'configure-web').pipe(
        Args.confirm({
          promptText: 'Configure web redirect flow?',
          defaultValue: false,
        }),
        Args.optional(),
      ),
      false,
    );

    expect(result).toBe(true);
  });
});
