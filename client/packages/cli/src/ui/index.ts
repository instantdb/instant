import chalk from 'chalk';
import boxen from 'boxen';
import { Prompt, SelectState } from './lib.js';

export { render } from './lib.js';

export namespace UI {
  type SelectProps<T> = {
    options: {
      value: T;
      label: string;
    }[];
    promptText: string;
  };
  export class Select<T> extends Prompt<T> {
    config(status: 'idle' | 'submitted' | 'aborted'): string {
      console.log('config', status);
      return status;
    }

    private readonly data: SelectState<T>;
    private readonly options: SelectProps<T>['options'];
    private readonly params: SelectProps<T>;

    constructor(params: SelectProps<T>) {
      super();
      this.on('attach', (terminal) => terminal.toggleCursor('hide'));
      this.on('input', (input) => {
        if (input === 'j') {
          this.data.selectedIdx =
            (this.data.selectedIdx + 1) % this.options.length;
        } else if (input === 'k') {
          this.data.selectedIdx =
            (this.data.selectedIdx - 1 + this.options.length) %
            this.options.length;
        }
        this.requestLayout();
      });
      this.on('detach', (terminal) => {
        terminal.toggleCursor('show');
      });
      this.options = params.options;
      this.params = params;
      this.data = new SelectState<T>(
        params.options.map((option) => option.value),
      );
      this.data.bind(this as any);
    }

    result(): T {
      return this.data.items[this.data.selectedIdx]!;
    }

    render(status: 'idle' | 'submitted' | 'aborted'): string {
      if (status === 'submitted') {
        return `${this.params.promptText}
${chalk.hex('#EA570B').bold('●')} ${this.params.options[this.data.selectedIdx]?.label}`;
      }
      const optionsList = this.options
        .map((option, idx) => {
          const isSelected = idx === this.data.selectedIdx;
          const cursor = isSelected ? chalk.hex('#EA570B').bold('●') : '○';
          const label = isSelected
            ? chalk.bold(option.label)
            : chalk.dim(option.label);

          return `${cursor} ${label}`;
        })
        .join('\n');

      return `${this.params.promptText}
${optionsList}
      `;
    }
  }

  export class Sidelined<T> extends Prompt<T> {
    override result(): T {
      return this.inner.result();
    }
    override render(status: 'idle' | 'submitted' | 'aborted'): string {
      return (
        this.inner
          .render(status)
          .split('\n')
          .map((line) => `${chalk.gray(' │  ')}${line}`)
          .join('\n') + '\n'
      );
    }
    config(status: 'idle' | 'submitted' | 'aborted'): string {
      return status;
    }

    private readonly inner: Prompt<T>;

    constructor(inner: Prompt<T>) {
      super();
      this.inner = inner;
      this.on('input', (input, arg2) => {
        this.inner.input(input, arg2);
        this.requestLayout();
      });
      this.on('detach', (terminal) => {
        this.inner.detach(terminal);
      });
      this.on('attach', (terminal) => {
        this.inner.attach(terminal);
      });
    }
  }

  type TextInputProps = {
    placeholder?: string;
    prompt: string;
  };

  export class TextInput extends Prompt<string> {
    override result(): string {
      return this.value;
    }
    override render(status: 'idle' | 'submitted' | 'aborted'): string {
      if (status === 'submitted') {
        return `${this.props.prompt}: ${this.value} ✓\n`;
      }
      if (status === 'aborted') {
        return `${this.props.prompt}: ${this.value} ✗\n`;
      }
      let inputDisplay = '';
      if (this.value === '') {
        inputDisplay = `${chalk.inverse(this.props.placeholder?.substring(0, 1))}${chalk.dim(this.props.placeholder?.substring(1))}`;
      } else {
        inputDisplay = `${this.value}${chalk.inverse(' ')}`;
      }
      return `${this.props.prompt}:
${inputDisplay}`;
    }

    private value: string;
    private readonly props: TextInputProps;

    constructor(props: TextInputProps) {
      super();
      this.on('attach', (terminal) => {
        terminal.toggleCursor('hide');
      });
      this.on('detach', (terminal) => {
        terminal.toggleCursor('show');
      });
      this.on('input', (input, arg2) => {
        if (arg2.name === 'backspace') {
          this.value = this.value.slice(0, -1);
        } else if (arg2.name?.length === 1) {
          this.value += input;
        } else if (arg2.name === 'space') {
          this.value += ' ';
        }

        this.requestLayout();
      });
      this.value = '';
      this.props = props;
    }
  }

  type ConfirmationProps = {
    promptText: string;
    defaultValue?: boolean;
  };

  export class Confirmation extends Prompt<boolean> {
    override result(): boolean {
      return this.value ?? this.props.defaultValue ?? false;
    }

    override render(status: 'idle' | 'submitted' | 'aborted'): string {
      if (status === 'submitted') {
        return `${this.props.promptText}: ${this.value ? 'Yes' : 'No'} ✓\n`;
      }
      if (status === 'aborted') {
        return `${this.props.promptText}: ${this.value ? 'Yes' : 'No'} ✗\n`;
      }

      const renderLabel = (
        text: string,
        active: boolean,
        width: number = 8,
      ): string => {
        return boxen(text, {
          backgroundColor: active ? '#EA570B' : 'blackBright',
          borderStyle: 'none',
          align: 'center',
          width,
        });
      };

      const yesStyle = renderLabel('Yes', this.value === true, 9);
      const noStyle = renderLabel('No', this.value === false, 8);

      return `${this.props.promptText}
${yesStyle}  ${noStyle}`;
    }

    private value: boolean | null = null;
    private readonly props: ConfirmationProps;

    constructor(props: ConfirmationProps) {
      super();
      this.props = props;
      this.on('attach', (terminal) => {
        terminal.toggleCursor('hide');
      });
      this.on('detach', (terminal) => {
        terminal.toggleCursor('show');
      });
      this.value = props.defaultValue || false;
      this.on('input', (input, key) => {
        if (['right', 'left', 'tab', 'j', 'k', 'h', 'l'].includes(key.name!)) {
          this.value = !this.value;
        }
        if (input) {
          if (input.toLowerCase() === 'y') {
            return this.terminal!.resolve({ data: true, status: 'submitted' });
          } else if (input.toLowerCase() === 'n') {
            return this.terminal!.resolve({ data: false, status: 'submitted' });
          }
        }
        this.requestLayout();
      });
    }
  }
}
