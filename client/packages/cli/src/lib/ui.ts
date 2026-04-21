import { Data, Effect } from 'effect';
import { BadArgsError } from '../errors.ts';
import { GlobalOpts } from '../context/globalOpts.ts';
import { Prompt, renderUnwrap } from '../ui/lib.ts';
import { UI } from '../ui/index.ts';

export class UIError extends Data.TaggedError('UIError')<{
  message: string;
  cause?: unknown;
}> {}

export const promptOk = Effect.fn('promptOk')(function* (
  props: UI.ConfirmationProps,
  defaultValue: boolean = true,
) {
  const opts = yield* GlobalOpts;
  if (opts.yes) {
    return defaultValue;
  }

  return yield* Effect.tryPromise(() =>
    renderUnwrap(
      new UI.Confirmation({
        ...props,
        defaultValue,
      }),
    ),
  );
});

export const runUIEffect = <P>(prompt: Prompt<P>) =>
  Effect.tryPromise({
    try: () => renderUnwrap(prompt),
    catch: (error) => new UIError({ message: 'UI Error', cause: error }),
  });

export const invalidFlagError = (flag: string, message: string) =>
  BadArgsError.make({ message: `Invalid ${flag}: ${message}` });

export const getOptionalStringFlag = Effect.fn(function* (
  value: unknown,
  flag: string,
) {
  if (value === undefined || value === null || value === false) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return yield* invalidFlagError(flag, 'expected a string value');
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
});

export const stripFirstBlankLine = (str: string): string => {
  const lines = str.split('\n');
  const firstBlankIndex = lines.findIndex((line) => line.trim() === '');
  if (firstBlankIndex === -1) return str;
  lines.splice(firstBlankIndex, 1);
  return lines.join('\n');
};

const coerceValue = (value: unknown, simpleName: string) =>
  Effect.gen(function* () {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value).trim();
    }
    return yield* BadArgsError.make({
      message: `Invalid value for ${simpleName}`,
    });
  });

const resolveOrPrompt = (prompt: UI.TextInputProps, yes: boolean) =>
  Effect.gen(function* () {
    if (yes) return undefined;
    const result = yield* runUIEffect(new UI.TextInput(prompt));
    return result.trim() || undefined;
  });

const requireOrReturn = (
  resolved: string | undefined,
  params: {
    required: boolean;
    simpleName: string;
    customMissingMessage?: string;
  },
) =>
  Effect.gen(function* () {
    if (resolved) return resolved;
    if (params.required) {
      return yield* BadArgsError.make({
        message:
          params.customMissingMessage ??
          `Missing required value for ${params.simpleName}`,
      });
    }
    return undefined;
  });

export const optOrPrompt = (
  value: unknown,
  params: {
    required: boolean;
    skipMessage?: string;
    customMissingMessage?: string;
    simpleName: string;
    skipIf: boolean;
    prompt: UI.TextInputProps;
  },
) =>
  Effect.gen(function* () {
    if (params.skipIf) {
      if (value) {
        return yield* BadArgsError.make({
          message:
            params.skipMessage ??
            `${params.simpleName} is not compatible with other options`,
        });
      }
      return undefined;
    }

    const { yes } = yield* GlobalOpts;
    const coerced = yield* coerceValue(value, params.simpleName);
    const resolved = coerced ?? (yield* resolveOrPrompt(params.prompt, yes));
    return yield* requireOrReturn(resolved, params);
  });

export const validateRequired = (input: string) =>
  input.trim().length > 0 ? undefined : 'Value is required';

export const optOrPromptBoolean = (
  value: unknown,
  params: {
    prompt: ConstructorParameters<typeof UI.Confirmation>[0];
    required: boolean;
    skipMessage?: string;
    simpleName: string;
    skipIf: boolean;
  },
) =>
  Effect.gen(function* () {
    if (params.skipIf && value !== undefined) {
      return yield* BadArgsError.make({
        message:
          params.skipMessage ??
          `${params.simpleName} is not compatible with other options`,
      });
    }
    if (params.skipIf) {
      return false;
    }
    const { yes } = yield* GlobalOpts;

    if (yes) {
      return Boolean(value);
    }

    if (value === true) {
      return value;
    }

    const response = yield* runUIEffect(
      new UI.Confirmation({
        ...params.prompt,
      }),
    );

    return response;
  });
