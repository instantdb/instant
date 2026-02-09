import chalk from 'chalk';
import boxen from 'boxen';
import stringWidth from 'string-width';
import { AnyKey, ModifyOutputFn, Prompt, SelectState } from './lib.js';

export { render, renderUnwrap, setRawModeWindowsFriendly } from './lib.js';

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

    topPadding: (output: string) => {
      return '\n' + output;
    },

    yPadding: (output: string) => {
      return '\n' + output + '\n';
    },

    sidelined:
      (symbol: string | null = '◆') =>
      (output: string, status?: Status) => {
        const result: string[] = [];
        output.split('\n').forEach((line, idx) => {
          if (idx === 1 && symbol) {
            result.push(`${chalk.gray(symbol + '  ')}${line}`);
          } else {
            result.push(`${chalk.gray('│  ')}${line}`);
          }
        });
        if (status === 'idle') {
          result.push(`${chalk.gray('└  ')}`);
        }
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
    vanishOnComplete: (output: string, status?: Status) => {
      if (status === 'submitted' || status === 'aborted') {
        return '';
      }
      return output;
    },
  } as const;

  export const ciaModifier = (symbol: string | null = '◆') =>
    modifiers.piped([
      UI.modifiers.topPadding,
      UI.modifiers.dimOnComplete,
      UI.modifiers.sidelined(symbol),
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
      secondary?: boolean;
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

      const mainOptionsList = this.options
        .filter((option) => !option.secondary)
        .map((option, idx) => {
          const isSelected = idx === this.data.selectedIdx;
          const cursor = isSelected ? chalk.hex('#EA570B').bold('●') : '○';
          const label = isSelected
            ? chalk.bold(option.label)
            : chalk.dim(option.label);

          return `${cursor} ${label}`;
        })
        .join('\n');

      const secondaryOptionsList = this.options
        .filter((option) => option.secondary)
        .map((option, idx) => {
          const realIdx = idx + this.options.filter((o) => !o.secondary).length;
          const isSelected = realIdx === this.data.selectedIdx;
          const cursor = isSelected ? chalk.hex('#EA570B').bold('●') : '○';
          const label = isSelected
            ? chalk.bold(option.label)
            : chalk.dim(option.label);

          return `${cursor} ${label}`;
        })
        .join('\n');

      return `${this.params.promptText}\n
${mainOptionsList}
${secondaryOptionsList.length ? chalk.dim('─────────────────────────────────────────\n') + secondaryOptionsList : ''}`;
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
    headless?: boolean;
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

    public value: string;
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
          if (!this.props.headless) {
            return this?.terminal?.resolve({
              data: undefined,
              status: 'aborted',
            });
          }
        }
        if (keyInfo.name === 'tab') {
          return;
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
        } else if (input !== undefined) {
          this.value += input;
        }
        this.requestLayout();
      });
      this.value = '';
      this.errorText = '';
      this.props = props;
    }

    setValue(value: string) {
      this.value = value;
      this.requestLayout();
    }

    setPrompt(prompt: string) {
      this.props.prompt = prompt;
      this.requestLayout();
    }
  }

  type SpinnerProps<T> = {
    modifyOutput?: ModifyOutputFn;
    promise: Promise<T>;
    workingText?: string;
    doneText?: string;
    errorText?: string | ((e: unknown) => string);
    disappearWhenDone?: boolean;
  };

  export class Spinner<T> extends Prompt<T | Error> {
    private props: SpinnerProps<T>;
    private promiseResult: T | null = null;
    private promiseError: Error | null = null;
    private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private frameIndex = 0;
    private intervalId: NodeJS.Timeout | null = null;
    private messages: string[] = [];

    result(): T | Error {
      if (this.promiseError) {
        throw this.promiseError;
      }
      return this.promiseResult!;
    }

    addMessage(message: string): void {
      this.messages.push(message);
      this.requestLayout();
    }

    updateText(text: string): void {
      this.props.workingText = text;
      this.requestLayout();
    }

    render(status: 'idle' | 'submitted' | 'aborted'): string {
      const workingText = this.props.workingText || 'Loading...';
      const doneText = this.props.doneText || 'Done';
      const errorText = this.props.errorText || 'Error';

      if (status === 'aborted') {
        return `${chalk.yellow('⚠')} Aborted\n`;
      }

      if (this.promiseError) {
        const finalError =
          errorText instanceof Function
            ? errorText(this.promiseError)
            : errorText;
        return `${chalk.red('✗')} ${finalError}\n`;
      }

      if (status === 'submitted') {
        if (this.props.disappearWhenDone) {
          return '';
        }
        return `${chalk.green('✓')} ${doneText}\n`;
      }

      const frame = this.spinnerFrames[this.frameIndex];
      let messages = this.messages.join('\n');
      if (this.messages.length > 0) {
        messages += '\n';
      }
      return `${messages}${chalk.hex('#EA570B')(frame)} ${workingText}\n${messages}`;
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

  export type ConfirmationProps = {
    promptText: string;
    defaultValue?: boolean;
    modifyOutput?: ModifyOutputFn;
    yesText?: string;
    inline?: boolean;
    noText?: string;
  };

  export class Confirmation extends Prompt<boolean> {
    override result(): boolean {
      return this.value ?? this.props.defaultValue ?? false;
    }

    override render(status: 'idle' | 'submitted' | 'aborted'): string {
      const renderLabel = (
        text: string,
        active: boolean,
        width: number = 8,
      ): string => {
        return boxen(text, {
          backgroundColor: active
            ? '#EA570B'
            : status === 'idle'
              ? 'blackBright'
              : undefined,
          borderStyle: 'none',
          align: 'center',
          width,
        });
      };

      const yesStyle = renderLabel(
        this.props.yesText ?? 'Yes',
        this.value === true,
        9,
      );
      const noStyle = renderLabel(
        this.props.noText ?? 'No',
        this.value === false,
        8,
      );

      const display = `${this.props.promptText}${this.props.inline ? '   ' : '\n'}${yesStyle}  ${noStyle}`;
      if (status === 'submitted') {
        return chalk.dim(display);
      }
      return display;
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

  type MenuItem = {
    label: string;
    onSelect: () => void;
    value?: string;
  };

  type MenuProps = {
    focus: FocusHandle;
    items: MenuItem[];
    width?: number;
    maxHeight?: number;
    emptyState?: string;
    showIdxWhileBlurred?: boolean;
    resetIdxOnFocus?: boolean;
    onHoverChange?: (value: string | undefined) => void;
    enableSearch?: boolean;
  };

  export class Menu {
    items: MenuItem[] = [];
    selectedIdx: number = 0;
    focus: FocusHandle;
    width = 40;
    maxHeight = 10;
    scrollOffset = 0;
    emptyState?: string;
    showIdxWhileBlurred: boolean;
    onHoverChange?: (value: string | undefined) => void;
    enableSearch: boolean;
    searchMode: boolean = false;
    searchQuery: string = '';
    allItems: { label: string; onSelect: () => void; value?: string }[] = [];

    constructor(props: MenuProps) {
      this.width = props.width ?? 40;
      this.maxHeight = props.maxHeight ?? 10;
      this.focus = props.focus;
      this.emptyState = props.emptyState;
      this.showIdxWhileBlurred = props.showIdxWhileBlurred ?? false;
      this.onHoverChange = props.onHoverChange;
      this.enableSearch = props.enableSearch ?? false;

      if (props.resetIdxOnFocus) {
        this.focus.onFocus(() => {
          this.setSelectedItem(0);
        });
      }

      this.focus.onKey((key, keyInfo, propagate) => {
        if (this.enableSearch && key === '/' && !this.searchMode) {
          this.searchMode = true;
          this.searchQuery = '';
          return;
        }

        if (this.searchMode) {
          if (keyInfo.name === 'escape') {
            this.searchMode = false;
            this.searchQuery = '';
            this.items = this.allItems;
            this.setSelectedItem(0);
          } else if (keyInfo.name === 'backspace') {
            this.searchQuery = this.searchQuery.slice(0, -1);
            this.filterItems();
          } else if (keyInfo.name === 'up' || keyInfo.name === 'down') {
            // Allow arrow keys to navigate in search mode
          } else if (keyInfo.name === 'return') {
            this.searchMode = false;
            const item = this.items[this.selectedIdx];
            if (item) {
              item.onSelect();
            } else {
              // bail out of search if you hit enter on nothing
              this.items = this.allItems;
              this.searchQuery = '';
              this.setSelectedItem(0);
              this.searchMode = false;
            }
          } else if (key && key.length === 1) {
            this.searchQuery += key;
            this.filterItems();
          }
          if (keyInfo.name === 'up' || keyInfo.name === 'down') {
            // Continue to navigation logic below
          } else {
            return;
          }
        }

        if (key === 'j' || keyInfo.name == 'down') {
          const newIndex = Math.min(
            this.selectedIdx + 1,
            this.items.length - 1,
          );
          this.setSelectedItem(newIndex);
        } else if (key === 'k' || keyInfo.name == 'up') {
          const newIndex = Math.max(this.selectedIdx - 1, 0);
          this.setSelectedItem(newIndex);
        } else if (keyInfo.name === 'return' || keyInfo.name === 'right') {
          this.items[this.selectedIdx]?.onSelect();
        } else {
          propagate();
        }
      });

      this.allItems = props.items;
      this.items = props.items;
      this.setSelectedItem(0);
    }

    public isSearching(): boolean {
      return this.searchMode;
    }

    private filterItems() {
      if (this.searchQuery === '') {
        this.items = this.allItems;
      } else {
        this.items = this.allItems.filter((item) =>
          item.label.toLowerCase().includes(this.searchQuery.toLowerCase()),
        );
      }
      this.setSelectedItem(0);
    }

    private adjustScroll() {
      if (this.selectedIdx < this.scrollOffset) {
        this.scrollOffset = this.selectedIdx;
      } else if (this.selectedIdx >= this.scrollOffset + this.maxHeight) {
        this.scrollOffset = this.selectedIdx - this.maxHeight + 1;
      }
      this.scrollOffset = Math.max(
        0,
        Math.min(this.scrollOffset, this.items.length - this.maxHeight),
      );
    }

    addItem(item: { label: string; onSelect: () => void; value?: string }) {
      this.items.push(item);
    }

    setSelectedItem(index: number) {
      const maxIndex = Math.max(0, this.items.length - 1);
      this.selectedIdx = Math.max(0, Math.min(index, maxIndex));
      this.adjustScroll();
      if (this.onHoverChange && this.items[this.selectedIdx]) {
        this.onHoverChange(this.items[this.selectedIdx].value);
      }
    }

    setItemList(items: { label: string; onSelect: () => void }[]) {
      this.allItems = items;
      this.items = items;
      this.setSelectedItem(this.selectedIdx);
    }

    render(): string {
      let output = '';

      if (this.searchMode) {
        const searchLine = (
          ' Search: ' +
          this.searchQuery +
          chalk.inverse(' ')
        ).padEnd(this.width);
        output += chalk.hex('#EA570B')(searchLine) + '\n';
      }

      if (this.items.length === 0) {
        return output + (this.emptyState ?? chalk.dim('No items'));
      }

      const hasItemsAbove = this.scrollOffset > 0;
      const hasItemsBelow =
        this.scrollOffset + this.maxHeight < this.items.length;

      const visibleItems = this.items.slice(
        this.scrollOffset,
        this.scrollOffset + this.maxHeight,
      );
      visibleItems.forEach((item, index) => {
        const actualIndex = this.scrollOffset + index;
        const isSelected =
          this.selectedIdx === actualIndex && this.focus.isFocused();
        const isSelectedButBlurred =
          this.selectedIdx === actualIndex && !this.focus.isFocused();

        const labelWithSpace = ' ' + item.label;
        const labelWidth = stringWidth(labelWithSpace);
        const paddingNeeded = Math.max(0, this.width - 1 - labelWidth);
        let line = labelWithSpace + ' '.repeat(paddingNeeded) + ' ';

        if (index === 0 && hasItemsAbove) {
          line = labelWithSpace + ' '.repeat(paddingNeeded) + chalk.dim('▲');
        } else if (index === visibleItems.length - 1 && hasItemsBelow) {
          line = labelWithSpace + ' '.repeat(paddingNeeded) + chalk.dim('▼');
        }

        if (isSelected) {
          output += chalk.bold.hex('#EA570B').inverse(line) + '\n';
        } else if (isSelectedButBlurred && this.showIdxWhileBlurred) {
          output += chalk.bgBlackBright(line) + '\n';
        } else {
          output += line + '\n';
        }
      });
      return output;
    }
  }

  interface AppSelectorApi {
    getDash: () => { apps: App[]; orgs: Org[] };
    createEphemeralApp: (title: string) => Promise<{
      appId: string;
      adminToken: string;
    }>;
    getAppsForOrg: (orgId: string) => Promise<{
      apps: any[];
    }>;
    createApp: (
      title: string,
      orgId?: string,
    ) => Promise<{
      appId: string;
      adminToken: string;
    }>;
  }

  type AppSelectorProps = {
    allowEphemeral: boolean;
    allowCreate: boolean;
    modifyOutput?: (output: string) => string;
    api: AppSelectorApi;
    startingMenuIndex?: number;
  };

  export class AppSelector extends Prompt<{
    appId: string;
    adminToken: string;
    approach: 'ephemeral' | 'import' | 'create';
  }> {
    props: AppSelectorProps;
    api: AppSelectorApi;
    dashResponse: { apps: App[]; orgs: Org[] };
    creatingEphemeral = false;
    selectedAppName = '';
    selectedOrg: Org | null = null;
    appNameInput: TextInput;
    focus: FocusHandle;
    appList: Menu;
    orgList: Menu;

    HEIGHT = 10;
    RIGHT_WIDTH = 70;

    result(): {
      appId: string;
      adminToken: string;
      approach: 'ephemeral' | 'import' | 'create';
    } {
      throw new Error('Method not implemented.');
    }

    rightView(): string {
      let inner = '';

      // Use hoveredLeftMenuItem to determine what to show
      if (this.focus.getFocused() === 'appList') {
        inner = this.appList.render();
      }

      if (this.focus.getFocused() === 'pickOrg') {
        inner = this.orgList.render();
      }

      if (this.focus.getFocused() === 'newApp') {
        return boxen(this.appNameInput.render('idle'), {
          height: this.HEIGHT,
          width: this.RIGHT_WIDTH,
          borderStyle: 'none',
          padding: {
            left: 2,
            top: 1,
          },
          textAlignment: 'left',
        });
      }

      return boxen(inner, {
        height: this.HEIGHT,
        width: this.RIGHT_WIDTH,
        borderStyle: 'none',
      });
    }

    render(status: 'idle' | 'submitted' | 'aborted'): string {
      if (status === 'submitted') {
        return boxen(' Selected App: ' + this.selectedAppName, {
          width: 50,
          dimBorder: true,
          textAlignment: 'center',
        });
      }

      const rightSide = this.rightView();

      const curFocus = this.focus.getFocused();
      let left =
        curFocus === 'appList'
          ? 'Select an app '
          : curFocus === 'pickOrg'
            ? 'Select an org '
            : curFocus === 'newApp'
              ? 'Create app '
              : '';

      if (this.selectedOrg?.title) {
        left += `(${this.selectedOrg.title}) `;
      }

      const keybindings: string[] = [];

      if (curFocus === 'newApp') {
        keybindings.push('<enter>: create app');
        keybindings.push('<esc>: back');
        if (this.props.allowEphemeral) {
          keybindings.push('<tab>: toggle temporary app');
        }
      }

      if (curFocus === 'appList') {
        keybindings.push('<tab>: change org');
        keybindings.push('<enter>: select app');
        if (this.appList.isSearching()) {
          keybindings.push('<esc>: cancel search');
        } else {
          keybindings.push('/: search');
        }
      }

      if (curFocus === 'pickOrg') {
        keybindings.push('<tab>/<esc>: back');
        keybindings.push('<enter>: select org');
        if (this.orgList.isSearching()) {
          keybindings.push('<esc>: cancel search');
        } else {
          keybindings.push('/: search');
        }
      }

      return (
        boxen(rightSide, {
          title: left,
          dimBorder: true,
        }) +
        '\n' +
        chalk.dim('  ' + keybindings.join('   '))
      );
    }

    createAppList = (apps: App[]): MenuItem[] => {
      const items: MenuItem[] = [];

      if (this.props.allowCreate) {
        items.push({
          label: chalk.italic('+ New App'),
          onSelect: () => {
            this.focus.setFocus('newApp');
          },
        });
      }

      apps
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .forEach((app) => {
          items.push({
            label: app.title,
            onSelect: () => {
              this.selectedAppName = app.title;
              this.terminal?.resolve({
                status: 'submitted',
                data: {
                  appId: app.id,
                  approach: 'import',
                  adminToken: app.admin_token,
                },
              });
            },
          });
        });

      return items;
    };

    constructor(props: AppSelectorProps) {
      super(props.modifyOutput);
      this.props = props;
      this.api = props.api;
      this.dashResponse = this.api.getDash();
      this.focus = new Focus(this).root();

      this.appList = new Menu({
        enableSearch: true,
        width: this.RIGHT_WIDTH,
        focus: this.focus.child('appList').onKey((_key, keyInfo) => {
          if (keyInfo.name === 'tab') {
            this.focus.setFocus('pickOrg');
          }
        }),
        items: this.createAppList(this.dashResponse.apps),
        emptyState: '   No Apps   ',
      });

      this.orgList = new Menu({
        enableSearch: true,
        width: this.RIGHT_WIDTH,
        focus: this.focus.child('pickOrg').onKey((_, keyInfo) => {
          if (keyInfo.name === 'escape' || keyInfo.name === 'tab') {
            this.focus.setFocus('appList');
          }
        }),
        items: this.dashResponse.orgs.map((org) => ({
          label: org.title,
          onSelect: () => {
            this.selectedOrg = org;
            this.api.getAppsForOrg(org.id).then((apps) => {
              this.appList.setItemList(this.createAppList(apps.apps));
              this.focus.setFocus('appList');
              this.requestLayout();
            });
          },
        })),
      });

      this.orgList.addItem({
        label: 'Personal',
        onSelect: () => {
          this.selectedOrg = null;
          this.appList.setItemList(this.createAppList(this.dashResponse.apps));
          this.focus.setFocus('appList');
          this.requestLayout();
        },
      });

      this.focus.setFocus('appList');

      const defaultAppName = 'Awesome Todos';
      this.appNameInput = new TextInput({
        prompt: 'Enter New App Name',
        placeholder: defaultAppName,
        defaultValue: defaultAppName,
        headless: true,
      });

      this.focus.child('newApp').onKey((key, keyInfo) => {
        if (keyInfo.name === 'escape' || keyInfo.name == 'left') {
          this.focus.setFocus('appList');
        }
        if (keyInfo.name === 'return') {
          const name = this.appNameInput.value || defaultAppName;
          if (this.creatingEphemeral) {
            this.props.api.createEphemeralApp(name).then((pair) => {
              this.selectedAppName = name;
              this.terminal?.resolve({
                status: 'submitted',
                data: {
                  ...pair,
                  approach: 'ephemeral',
                },
              });
            });
          } else {
            this.props.api
              .createApp(name, this.selectedOrg?.id)
              .then((pair) => {
                this.selectedAppName = name;
                this.terminal?.resolve({
                  status: 'submitted',
                  data: {
                    ...pair,
                    approach: 'create',
                  },
                });
              });
          }
        } else if (keyInfo.name === 'tab' && this.props.allowEphemeral) {
          this.creatingEphemeral = !this.creatingEphemeral;
          this.appNameInput.setPrompt(
            this.creatingEphemeral
              ? `Enter New ${chalk.bold('Temporary')} App Name`
              : 'Enter New App Name',
          );
        } else {
          this.appNameInput.input(key, keyInfo);
        }
      });

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
