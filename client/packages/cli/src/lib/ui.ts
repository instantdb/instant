import { Data, Effect } from 'effect';
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
    catch: (error) =>
      new UIError({
        message: error instanceof Error ? error.message : String(error),
      }),
  });

export const stripFirstBlankLine = (str: string): string => {
  const lines = str.split('\n');
  const firstBlankIndex = lines.findIndex((line) => line.trim() === '');
  if (firstBlankIndex === -1) return str;
  lines.splice(firstBlankIndex, 1);
  return lines.join('\n');
};

export const validateRequired = (input: string) =>
  input.trim().length > 0 ? undefined : 'Value is required';
