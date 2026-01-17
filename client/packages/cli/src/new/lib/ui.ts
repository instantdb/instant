import { Data, Effect } from 'effect';
import { GlobalOpts } from '../context/globalOpts.js';
import { renderUnwrap } from '../../ui/lib.js';
import boxen from 'boxen';
import { UI } from '../../ui/index.js';

export class UIError extends Data.TaggedError('UIError')<{
  message: string;
  cause?: unknown;
}> {}

export const promptOk = Effect.fn('promptOk')(function* (
  text: string,
  defaultValue: boolean = true,
) {
  const opts = yield* GlobalOpts;
  if (opts.yes) {
    return defaultValue;
  }

  const ok = yield* Effect.tryPromise({
    try: () =>
      renderUnwrap(
        new UI.Confirmation({
          promptText: text,
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
    // matches old implementation ¯\_(ツ)_/¯
    catch: (error) => Effect.succeed(defaultValue),
  });

  return ok;
});
