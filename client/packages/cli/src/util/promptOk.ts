import { OptionValues } from 'commander';
import { renderUnwrap, UI } from '../ui/index.js';
import boxen from 'boxen';

export async function promptOk(
  props: UI.ConfirmationProps,
  opts?: OptionValues,
  defaultValue: boolean = true,
) {
  if (opts?.yes) return defaultValue;

  return await renderUnwrap(
    new UI.Confirmation({
      modifyOutput: (out) =>
        boxen(out, {
          dimBorder: true,
          padding: {
            left: 1,
            right: 1,
          },
        }),
      ...props,
      defaultValue,
    }),
  ).catch(() => defaultValue);
}
