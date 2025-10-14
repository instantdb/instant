import chalk from 'chalk';
import boxen from 'boxen';
import { AnyKey, ModifyOutputFn, Prompt, SelectState } from './lib.js';

export { render, renderUnwrap } from './lib.js';

export namespace UI {
  type Status = 'idle' | 'submitted' | 'aborted';
  export const modifiers = {
    piped: (modifiers: ModifyOutputFn[]): ModifyOutputFn => {
      return (output: string, status?: Status) => {
        return modifiers.reduce(
          (acc, modifier) => modifier(acc, status),
          output,
        );
      };
    },

    yPadding: (output: string) => {
      return '\n' + output + '\n';
    },

    sidelined: (output: string, status?: Status) => {
      const result: string[] = [];
      const lastIndex = output.split('\n').length - 1;

      output.split('\n').forEach((line, index) => {
        if (index === lastIndex && status == 'idle') {
          result.push(`${chalk.gray('└  ')}${line}`);
        } else {
          result.push(`${chalk.gray('│  ')}${line}`);
        }
      });

      let almost = result.join('\n');
      if (!almost.endsWith('\n')) {
        almost += '\n';
      }
      return almost;
    },

    background: (output: string) => {
      return chalk.bgBlackBright(output);
    },

    dimOnComplete: (output: string, status?: Status) => {
      if (status === 'submitted' || status === 'aborted') {
        return chalk.dim(output);
      }
      return output;
    },
  } as const;

  export const ciaModifier = modifiers.piped([
    UI.modifiers.yPadding,
    UI.modifiers.dimOnComplete,
    UI.modifiers.sidelined,
  ]);

  /**
   * Utility that lets you use output modifiers in console.log
   */
  export const log = (
    output: string,
    modifyOutput?: ModifyOutputFn,
    ...args: any[]
  ) => {
    const finalOutput = modifyOutput ? modifyOutput(output) : output;
    if (finalOutput.endsWith('\n')) {
      process.stdout.write(finalOutput, ...args);
    } else {
      process.stdout.write(finalOutput + '\n', ...args);
    }
  };

  type SelectProps<T> = {
    options: {
      value: T;
      label: string;
    }[];
    promptText: string;
    modifyOutput?: ModifyOutputFn;
    defaultValue?: T;
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
      super(params.modifyOutput);
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

      // Set initial selected index based on defaultValue if provided
      if (params.defaultValue !== undefined) {
        const defaultIndex = params.options.findIndex(
          (option) => option.value === params.defaultValue,
        );
        if (defaultIndex !== -1) {
          this.data.selectedIdx = defaultIndex;
        }
      }

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
${optionsList}`;
    }
  }

  /**
   * @deprecated use the modifyOutput prop instead
   * left as an example of how to do wrapper prompts
   */
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
    modifyOutput?: ModifyOutputFn;
    defaultValue?: string;
    validate?: (value: string) => string | undefined;
  };

  export class TextInput extends Prompt<string> {
    override result(): string {
      return this.value;
    }
    override render(status: 'idle' | 'submitted' | 'aborted'): string {
      if (status === 'submitted') {
        return `${this.props.prompt}
${this.value}`;
      }
      if (status === 'aborted') {
        return `${this.props.prompt} ${this.value} (CANCELLED)\n`;
      }
      let inputDisplay = '';
      if (this.value === '') {
        inputDisplay = `${chalk.inverse(this.props.placeholder?.substring(0, 1))}${chalk.dim(this.props.placeholder?.substring(1))}`;
      } else {
        inputDisplay = `${this.value}${chalk.inverse(' ')}`;
      }
      const errorText = this.errorText
        ? `      ${chalk.red(this.errorText)}`
        : '';
      return `${this.props.prompt}${errorText}
${inputDisplay}`;
    }

    private value: string;
    private errorText: string | undefined;
    private readonly props: TextInputProps;

    constructor(props: TextInputProps) {
      super(props.modifyOutput);
      this.on('attach', (terminal) => {
        terminal.setAllowInteraction(false); // needed for validation
        terminal.toggleCursor('hide');
      });
      this.on('detach', (terminal) => {
        terminal.toggleCursor('show');
      });
      this.on('input', (input, keyInfo) => {
        if (keyInfo.name === 'escape') {
          return this.terminal.resolve({
            data: null,
            status: 'aborted',
          });
        }
        if (keyInfo.name === 'return') {
          if (this.value === '' && this.props.defaultValue) {
            this.value = this.props.defaultValue;
            return this.terminal?.resolve({
              data: this.props.defaultValue,
              status: 'submitted',
            });
          }
          // Do the validation
          if (this.props.validate) {
            const validationResult = this.props.validate(this.value);
            if (validationResult) {
              this.errorText = validationResult;
            } else {
              return this.terminal?.resolve({
                data: this.value,
                status: 'submitted',
              });
            }
          } else {
            return this.terminal?.resolve({
              data: this.value,
              status: 'submitted',
            });
          }
        }
        if (keyInfo.name === 'backspace') {
          this.value = this.value.slice(0, -1);
        } else if (keyInfo.name?.length === 1) {
          this.value += input;
        } else if (keyInfo.name === 'space') {
          this.value += ' ';
        }
        this.requestLayout();
      });
      this.value = '';
      this.errorText = '';
      this.props = props;
    }
  }

  type SpinnerProps<T> = {
    modifyOutput?: ModifyOutputFn;
    promise: Promise<T>;
    workingText?: string;
    doneText?: string;
    errorText?: string;
    disappearWhenDone?: boolean;
  };

  export class Spinner<T> extends Prompt<T> {
    private props: SpinnerProps<T>;
    private promiseResult: T | null = null;
    private promiseError: Error | null = null;
    private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private frameIndex = 0;
    private intervalId: NodeJS.Timeout | null = null;

    result(): T {
      if (this.promiseError) {
        throw this.promiseError;
      }
      return this.promiseResult!;
    }

    render(status: 'idle' | 'submitted' | 'aborted'): string {
      const workingText = this.props.workingText || 'Loading...';
      const doneText = this.props.doneText || 'Done';
      const errorText = this.props.errorText || 'Error';

      if (status === 'submitted') {
        if (this.promiseError) {
          return `${chalk.red('✗')} ${errorText}\n`;
        }
        if (this.props.disappearWhenDone) {
          return '';
        }
        return `${chalk.green('✓')} ${doneText}\n`;
      }

      if (status === 'aborted') {
        return `${chalk.yellow('⚠')} Aborted\n`;
      }

      const frame = this.spinnerFrames[this.frameIndex];
      return `${chalk.cyan(frame)} ${workingText}\n`;
    }

    constructor(props: SpinnerProps<T>) {
      super(props.modifyOutput);
      this.props = props;

      this.on('attach', (terminal) => {
        terminal.setAllowInteraction(false);
        terminal.toggleCursor('hide');
        this.intervalId = setInterval(() => {
          this.frameIndex = (this.frameIndex + 1) % this.spinnerFrames.length;
          this.requestLayout();
        }, 80);

        this.props.promise
          .then((result) => {
            this.promiseResult = result;
            if (this.intervalId) clearInterval(this.intervalId);
            return terminal.resolve({
              data: result as any,
              status: 'submitted',
            });
          })
          .catch((error) => {
            this.promiseError = error;
            if (this.intervalId) clearInterval(this.intervalId);
            return terminal.resolve({
              data: error as any,
              status: 'submitted',
            });
          });
      });

      this.on('detach', (terminal) => {
        terminal.toggleCursor('show');
        if (this.intervalId) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }
      });
    }
  }

  type ConfirmationProps = {
    promptText: string;
    defaultValue?: boolean;
    modifyOutput?: ModifyOutputFn;
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
      super(props.modifyOutput);
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

  class FocusHandle {
    private parent: FocusHandle | null = null;
    private _focus: Focus;
    key: string;

    private onFocusCallback: (() => void) | null = null;
    private onBlurCallback: (() => void) | null = null;
    private onKeyCallbacks: ((
      str: string | undefined,
      key: AnyKey,
      propagate: () => void,
    ) => any)[] = [];

    constructor(focus: Focus, key: string, parent: FocusHandle | null) {
      this._focus = focus;
      this.key = key;
      this.parent = parent;
    }

    child(childKey: string): FocusHandle {
      const newHandle = new FocusHandle(this._focus, childKey, this);
      this._focus.register(newHandle);
      return newHandle;
    }

    setFocus(key: string) {
      this._focus?.setFocus(key);
    }

    onKey(
      callback: (
        str: string | undefined,
        key: AnyKey,
        propagate: () => void,
      ) => any,
    ): FocusHandle {
      this.onKeyCallbacks.push(callback);
      return this;
    }

    onFocus(callback: () => void): FocusHandle {
      this.onFocusCallback = callback;
      return this;
    }

    onBlur(callback: () => void): FocusHandle {
      this.onBlurCallback = callback;
      return this;
    }

    getFocused(): string {
      return this._focus.getFocused();
    }

    isFocused(): boolean {
      return this._focus.isFocused(this.key);
    }

    _notifyKey(str: string | undefined, key: AnyKey) {
      this.onKeyCallbacks.forEach((callback) => {
        callback(str, key, () => {
          this.parent?._notifyKey(str, key);
        });
      });
    }

    _notifyFocusState(key: string) {
      if (key === this.key) {
        this.onFocusCallback?.();
      } else {
        this.onBlurCallback?.();
      }
    }
  }

  export class Focus {
    private selected: string;
    private prompt: Prompt<any>;
    private handles: Record<string, FocusHandle>;

    constructor(prompt: Prompt<any>) {
      this.prompt = prompt;
      this.prompt.on('input', (arg1, arg2) => {
        this.handles[this.selected]?._notifyKey?.(arg1, arg2);
        this.prompt.requestLayout();
      });
      this.handles = {};
      this.selected = 'root';
    }

    register(handle: FocusHandle) {
      this.handles[handle.key] = handle;
    }

    root(): FocusHandle {
      const rootHandle = new FocusHandle(this, 'root', null);
      this.register(rootHandle);
      this.setFocus('root');
      return rootHandle;
    }

    getFocused(): string {
      return this.selected;
    }

    setFocus(key: string) {
      this.selected = key;

      this.handles[key]?._notifyFocusState?.(key);

      this.prompt.requestLayout();
    }

    isFocused(key: string): boolean {
      return this.selected === key;
    }
  }

  type App = {
    admin_token: string;
    magic_code_email_template: null;
    id: string;
    title: string;
    created_at: string;
  };
  type Org = {
    id: string;
    title: string;
    role: string;
  };

  export class Menu {
    items: { label: string; onSelect: () => void }[] = [];
    selectedIdx: number = 0;
    focus: FocusHandle;
    width = 30;

    constructor(
      focus: FocusHandle,
      items: { label: string; onSelect: () => void }[],
      width = 30,
    ) {
      this.selectedIdx = 0;
      this.width = width;
      this.focus = focus;
      this.focus.onKey((key, keyInfo, propagate) => {
        if (key === 'j' || keyInfo.name == 'down') {
          this.selectedIdx = Math.min(
            this.selectedIdx + 1,
            this.items.length - 1,
          );
        } else if (key === 'k' || keyInfo.name == 'up') {
          this.selectedIdx = Math.max(this.selectedIdx - 1, 0);
        } else if (keyInfo.name === 'return') {
          this.items[this.selectedIdx]?.onSelect();
        } else {
          propagate();
        }
      });
      this.items = items;
    }

    addItem(item: { label: string; onSelect: () => void }) {
      this.items.push(item);
    }

    setSelectedItem(index: number) {
      this.selectedIdx = index;
    }

    render(): string {
      let output = '';
      this.items.forEach((item, index) => {
        const isSelected = this.selectedIdx === index && this.focus.isFocused();
        if (isSelected) {
          output +=
            chalk.bold.hex('#EA570B').bgBlack(item.label.padEnd(this.width)) +
            '\n';
        } else {
          output += item.label.padEnd(this.width) + '\n';
        }
      });
      return output;
    }
  }

  interface AppSelectorApi {
    getDash: () => { apps: App[]; orgs: Org[] };
    // createEphemeralApp: (title: string) => Promise<{
    //   appId: string;
    //   adminToken: string;
    // }>;
    // getAppsForOrg: (orgId: string) => Promise<{
    //   apps: any[];
    // }>;
    // createApp: (title: string, orgId?: string) => Promise<any>;
  }

  type AppSelectorProps = {
    allowEphemeral: boolean;
    allowCreate: boolean;
    modifyOutput?: (output: string) => string;
    api: AppSelectorApi;
  };

  export class AppSelector extends Prompt<{
    appId: string;
    adminToken: string;
    approach: 'ephemeral' | 'import' | 'create';
  }> {
    props: AppSelectorProps;
    api: AppSelectorApi;
    dashResponse: { apps: App[]; orgs: Org[] };
    typed: string;

    leftMenu: Menu;

    focus: FocusHandle;

    HEIGHT = 10;

    result(): {
      appId: string;
      adminToken: string;
      approach: 'ephemeral' | 'import' | 'create';
    } {
      throw new Error('Method not implemented.');
    }

    leftView(): string {
      return boxen(this.leftMenu.render(), {
        height: this.HEIGHT,
        borderStyle: 'none',
      });
    }

    rightView(): string {
      return boxen('right', {
        height: this.HEIGHT,
        borderStyle: 'none',
        width: 50,
      });
    }

    render(status: 'idle' | 'submitted' | 'aborted'): string {
      const leftSide = this.leftView();
      const rightSide = this.rightView();

      const leftLines = leftSide.split('\n');
      const rightLines = rightSide.split('\n');
      const maxLines = Math.max(leftLines.length, rightLines.length);

      const combinedLines: string[] = [];
      for (let i = 0; i < maxLines; i++) {
        const leftLine = leftLines[i] || '';
        const rightLine = rightLines[i] || '';
        combinedLines.push(leftLine + '│' + rightLine);
      }

      return boxen(combinedLines.join('\n'), {
        title: this.focus.getFocused(),
        dimBorder: true,
      });
    }

    constructor(props: AppSelectorProps) {
      super(props.modifyOutput);
      this.props = props;
      this.api = props.api;
      this.dashResponse = this.api.getDash();
      this.focus = new Focus(this).root();

      this.focus.onKey((key, moreInfo) => {
        if (moreInfo.name === 'escape') {
          this.focus.setFocus('leftMenu');
        }
      });
      this.leftMenu = new Menu(this.focus.child('leftMenu'), []);
      this.leftMenu.addItem({
        label: ' Create Ephemeral ',
        onSelect: () => {
          this.focus.setFocus('ephemeral');
        },
      });
      this.leftMenu.addItem({
        label: ' Select Existing App         >',
        onSelect: () => {
          this.focus.setFocus('selectExisting');
        },
      });
      this.leftMenu.addItem({
        label: ' Use Organization',
        onSelect: () => {
          this.focus.setFocus('pickOrg');
        },
      });

      this.focus.setFocus('leftMenu');

      this.on('attach', (terminal) => {
        this.terminal?.setAllowInteraction(false);
        terminal.toggleCursor('hide');
      });
      this.on('detach', (terminal) => {
        terminal.toggleCursor('show');
      });
    }
  }
}
