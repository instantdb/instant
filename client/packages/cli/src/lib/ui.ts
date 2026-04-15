import { Data, Effect, Option } from 'effect';
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

  const ok = yield* Effect.tryPromise(() =>
    renderUnwrap(
      new UI.Confirmation({
        ...props,
        defaultValue,
      }),
    ),
  ).pipe(Effect.orElseSucceed(() => defaultValue));

  return ok;
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

export const getBooleanFlag = Effect.fn(function* (
  value: unknown,
  flag: string,
) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return yield* invalidFlagError(flag, 'expected a boolean value');
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }

  return yield* invalidFlagError(flag, 'expected true or false');
});

export const optOrPrompt = (value: unknown, props: UI.TextInputProps) =>
  Effect.gen(function* () {
    const { yes } = yield* GlobalOpts;

    return yield* Option.fromNullable(value).pipe(
      Effect.catchTag('NoSuchElementException', () => {
        if (yes) {
          return BadArgsError.make({
            message: `Missing required value for: ${prompt}`,
          });
        }

        return runUIEffect(
          new UI.TextInput({
            validate: (input) =>
              input.trim().length > 0 ? undefined : 'Value is required',
            modifyOutput: UI.modifiers.piped([
              UI.modifiers.topPadding,
              UI.modifiers.dimOnComplete,
            ]),
            ...props,
          }),
        ).pipe(
          Effect.catchTag('UIError', (e) =>
            BadArgsError.make({
              message: `UI error for ${prompt}: ${e.message}`,
            }),
          ),
        );
      }),
      Effect.andThen((raw) => getOptionalStringFlag(raw, props.prompt)),
      Effect.flatMap((decoded) =>
        decoded
          ? Effect.succeed(decoded)
          : BadArgsError.make({
              message: `Missing required value for: ${prompt}`,
            }),
      ),
    );
  });

export const optionalOptOrPrompt = (
  value: unknown,
  prompt: string,
  placeholder?: string,
) =>
  Effect.gen(function* () {
    const decoded = yield* getOptionalStringFlag(value, prompt);
    if (decoded !== undefined) return decoded;

    const { yes } = yield* GlobalOpts;
    if (yes) return undefined;

    return yield* runUIEffect(
      new UI.TextInput({
        prompt,
        ...(placeholder ? { placeholder } : {}),
        modifyOutput: UI.modifiers.piped([
          UI.modifiers.topPadding,
          UI.modifiers.dimOnComplete,
        ]),
      }),
    ).pipe(
      Effect.catchTag('UIError', (e) =>
        BadArgsError.make({ message: `UI error for ${prompt}: ${e.message}` }),
      ),
      Effect.andThen((input) => getOptionalStringFlag(input, prompt)),
    );
  });

export const stripFirstBlankLine = (str: string): string => {
  const lines = str.split('\n');
  const firstBlankIndex = lines.findIndex((line) => line.trim() === '');
  if (firstBlankIndex === -1) return str;
  lines.splice(firstBlankIndex, 1);
  return lines.join('\n');
};
