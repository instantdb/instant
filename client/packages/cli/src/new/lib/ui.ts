import { Data, Effect } from 'effect';
import { GlobalOpts } from '../context/globalOpts.js';
import { Prompt, renderUnwrap } from '../../ui/lib.js';
import boxen from 'boxen';
import { UI } from '../../ui/index.js';

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
        modifyOutput: (out) =>
          boxen(out, {
            dimBorder: true,
            padding: {
              left: 1,
              right: 1,
            },
          }),
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
