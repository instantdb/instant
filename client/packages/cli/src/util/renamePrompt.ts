import chalk from 'chalk';
import { ModifyOutputFn, Prompt, SelectState } from '../ui/lib.js';
import { isRenamePromptItem } from '@instantdb/platform';

export interface RenamePromptItem<T> {
  from: T;
  to: T;
}

export class ResolveRenamePrompt<T extends string> extends Prompt<
  RenamePromptItem<T> | T
> {
  private readonly state: SelectState<RenamePromptItem<T> | T>;

  result(): RenamePromptItem<T> | T {
    return this.state.items[this.state.selectedIdx]!;
  }

  private thingType = 'attr';

  constructor(
    private readonly base: string,
    data: (RenamePromptItem<T> | T)[],
    extraInfo?: any,
    modifyOutput?: ModifyOutputFn,
  ) {
    super(modifyOutput);
    this.on('attach', (terminal) => terminal.toggleCursor('hide'));
    this.state = new SelectState(data);
    this.state.bind(this);
    this.base = base;
    if (extraInfo?.type) {
      this.thingType = extraInfo.type;
    }
  }
  render(status: 'idle' | 'submitted' | 'aborted'): string {
    if (status === 'submitted' || status === 'aborted') {
      return '';
    }

    let text = `Is ${chalk.bold.hex('#EA570B')(
      this.base,
    )} created or renamed from another ${this.thingType}?\n`;
    const isSelectedRenamed = isRenamePromptItem(
      this.state.items[this.state.selectedIdx],
    );
    const selectedPrefix = isSelectedRenamed
      ? chalk.yellow('❯ ')
      : chalk.green('❯ ');

    const labelLength: number = this.state.items
      .filter((it) => isRenamePromptItem(it))
      .map((it: RenamePromptItem<T>) => {
        return this.base.length + 3 + it['from'].length;
      })
      .reduce((a, b) => {
        if (a > b) {
          return a;
        }
        return b;
      }, 0);

    this.state.items.forEach((it, idx) => {
      const isSelected = idx === this.state.selectedIdx;
      const isRenamed = isRenamePromptItem(it);
      const title = isRenamed
        ? `${it.from} › ${it.to}`.padEnd(labelLength, ' ')
        : it.padEnd(labelLength, ' ');
      const label = isRenamed
        ? `${chalk.yellow('~')} ${title} ${chalk.gray(`   rename ${this.thingType}`)}`
        : `${chalk.green('+')} ${title} ${chalk.gray(`   create ${this.thingType}`)}`;

      text += isSelected ? `${selectedPrefix}${label}` : `  ${label}`;
      text += idx != this.state.items.length - 1 ? '\n' : '';
    });
    return text;
  }
}
