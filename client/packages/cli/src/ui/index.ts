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
      return '\n' + output;
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
      UI.modifiers.yPadding,
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
    private messages: string[] = [];

    result(): T {
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

  type MenuProps = {
    focus: FocusHandle;
    items: { label: string; onSelect: () => void }[];
    width?: number;
    maxHeight?: number;
    emptyState?: string;
    showIdxWhileBlurred?: boolean;
    resetIdxOnFocus?: boolean;
  };

  export class Menu {
    items: { label: string; onSelect: () => void }[] = [];
    selectedIdx: number = 0;
    focus: FocusHandle;
    width = 30;
    maxHeight = 10;
    scrollOffset = 0;
    emptyState?: string;
    showIdxWhileBlurred: boolean;

    constructor(props: MenuProps) {
      this.selectedIdx = 0;
      this.width = props.width ?? 30;
      this.maxHeight = props.maxHeight ?? 10;
      this.focus = props.focus;
      this.emptyState = props.emptyState;
      this.showIdxWhileBlurred = props.showIdxWhileBlurred ?? false;

      if (props.resetIdxOnFocus) {
        this.focus.onFocus(() => {
          this.selectedIdx = 0;
        });
      }

      this.focus.onKey((key, keyInfo, propagate) => {
        if (key === 'j' || keyInfo.name == 'down') {
          this.selectedIdx = Math.min(
            this.selectedIdx + 1,
            this.items.length - 1,
          );
          this.adjustScroll();
        } else if (key === 'k' || keyInfo.name == 'up') {
          this.selectedIdx = Math.max(this.selectedIdx - 1, 0);
          this.adjustScroll();
        } else if (keyInfo.name === 'return') {
          this.items[this.selectedIdx]?.onSelect();
        } else {
          propagate();
        }
      });
      this.items = props.items;
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

    addItem(item: { label: string; onSelect: () => void }) {
      this.items.push(item);
    }

    setSelectedItem(index: number) {
      this.selectedIdx = index;
      this.adjustScroll();
    }

    setItemList(items: { label: string; onSelect: () => void }[]) {
      this.items = items;
    }

    render(): string {
      if (this.items.length === 0) {
        return this.emptyState ?? chalk.dim('No items');
      }

      const hasItemsAbove = this.scrollOffset > 0;
      const hasItemsBelow =
        this.scrollOffset + this.maxHeight < this.items.length;

      const visibleItems = this.items.slice(
        this.scrollOffset,
        this.scrollOffset + this.maxHeight,
      );
      let output = '';
      visibleItems.forEach((item, index) => {
        const actualIndex = this.scrollOffset + index;
        const isSelected =
          this.selectedIdx === actualIndex && this.focus.isFocused();
        const isSelectedButBlurred =
          this.selectedIdx === actualIndex && !this.focus.isFocused();

        let line = (' ' + item.label).padEnd(this.width - 1) + ' ';

        if (index === 0 && hasItemsAbove) {
          line = (' ' + item.label).padEnd(this.width - 1) + chalk.dim('▲');
        } else if (index === visibleItems.length - 1 && hasItemsBelow) {
          line = (' ' + item.label).padEnd(this.width - 1) + chalk.dim('▼');
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
  };

  export class AppSelector extends Prompt<{
    appId: string;
    adminToken: string;
    approach: 'ephemeral' | 'import' | 'create';
  }> {
    props: AppSelectorProps;
    api: AppSelectorApi;
    dashResponse: { apps: App[]; orgs: Org[] };

    selectedAppName = '';
    selectedOrg: Org | null = null;

    appNameInput: TextInput;
    ephemeralInput: TextInput;

    focus: FocusHandle;
    leftMenu: Menu;
    appList: Menu;
    orgList: Menu;

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
      let inner = '';
      if (
        this.focus.getFocused() === 'selectExisting' ||
        this.focus.getFocused() === 'leftMenu'
      ) {
        inner = this.appList.render();
      }

      if (this.focus.getFocused() === 'pickOrg') {
        inner = this.orgList.render();
      }

      if (this.focus.getFocused() === 'newApp') {
        return boxen(this.appNameInput.render('idle'), {
          height: this.HEIGHT,
          borderStyle: 'none',
          padding: 2,
          textAlignment: 'left',
        });
      }

      if (this.focus.getFocused() === 'ephemeral') {
        return boxen(this.ephemeralInput.render('idle'), {
          height: this.HEIGHT,
          borderStyle: 'none',
          padding: 2,
          textAlignment: 'left',
        });
      }

      return boxen(inner, {
        height: this.HEIGHT,
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

      const leftSide = this.leftView();
      const rightSide = this.rightView();

      const leftLines = leftSide.split('\n');
      const rightLines = rightSide.split('\n');
      const maxLines = Math.max(leftLines.length, rightLines.length);

      const combinedLines: string[] = [];
      for (let i = 0; i < maxLines; i++) {
        const leftLine = leftLines[i] || '';
        const rightLine = rightLines[i] || '';
        combinedLines.push(leftLine + chalk.dim('│') + rightLine);
      }

      return boxen(combinedLines.join('\n'), {
        title: 'Select or create app',
        dimBorder: true,
      });
    }

    constructor(props: AppSelectorProps) {
      super(props.modifyOutput);
      this.props = props;
      this.api = props.api;
      this.dashResponse = this.api.getDash();
      this.focus = new Focus(this).root();

      this.focus.onKey((_key, moreInfo) => {
        if (moreInfo.name === 'escape') {
          this.focus.setFocus('leftMenu');
        }
      });

      this.appList = new Menu({
        focus: this.focus.child('selectExisting').onKey((_, keyInfo) => {
          if (keyInfo.name === 'h') {
            this.focus.setFocus('leftMenu');
          }
        }),
        items: this.dashResponse.apps.map((app) => ({
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
        })),
        emptyState: '   No Apps   ',
      });

      this.orgList = new Menu({
        focus: this.focus.child('pickOrg').onKey((_, keyInfo) => {
          if (keyInfo.name === 'h') {
            this.focus.setFocus('leftMenu');
          }
        }),
        items: this.dashResponse.orgs.map((org) => ({
          label: org.title,
          onSelect: () => {
            this.selectedOrg = org;
            this.api.getAppsForOrg(org.id).then((apps) => {
              this.appList.setItemList(
                apps.apps.map((app) => ({
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
                })),
              );
              this.focus.setFocus('selectExisting');
              this.leftMenu.setSelectedItem(2);
              this.requestLayout();
            });
          },
        })),
      });

      this.orgList.addItem({
        label: '(personal apps)',
        onSelect: () => {
          this.selectedOrg = null;
          this.appList.setItemList(
            this.dashResponse.apps.map((app) => ({
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
            })),
          );
          this.focus.setFocus('selectExisting');
          this.leftMenu.setSelectedItem(2);
          this.requestLayout();
        },
      });

      this.leftMenu = new Menu({
        showIdxWhileBlurred: true,
        focus: this.focus.child('leftMenu'),
        items: [
          {
            label: 'Create New App',
            onSelect: () => {
              this.focus.setFocus('newApp');
            },
          },
          {
            label: 'Create Ephemeral App',
            onSelect: () => {
              this.focus.setFocus('ephemeral');
            },
          },
          {
            label: 'Select Existing App',
            onSelect: () => {
              this.focus.setFocus('selectExisting');
            },
          },
          {
            label: 'Change Organization',
            onSelect: () => {
              this.focus.setFocus('pickOrg');
            },
          },
        ],
        maxHeight: 10,
      });

      this.leftMenu.setSelectedItem(2); // start on "select existing app"

      this.focus.setFocus('leftMenu');

      this.appNameInput = new TextInput({
        prompt: 'Enter New App Name',
        placeholder: 'my-instant-app',
        headless: true,
      });

      this.focus.child('newApp').onKey((key, keyInfo) => {
        if (keyInfo.name === 'escape') {
          this.focus.setFocus('leftMenu');
        }
        if (keyInfo.name === 'return') {
          this.props.api
            .createApp(this.appNameInput.value, this.selectedOrg?.id)
            .then((pair) => {
              this.selectedAppName = this.appNameInput.value;
              this.terminal?.resolve({
                status: 'submitted',
                data: {
                  ...pair,
                  approach: 'create',
                },
              });
            });
        } else {
          this.appNameInput.input(key, keyInfo);
        }
      });

      this.ephemeralInput = new TextInput({
        prompt: 'Enter New Ephemeral App Name',
        placeholder: 'my-instant-app',
        headless: true,
      });

      this.focus.child('ephemeral').onKey((key, keyInfo) => {
        if (keyInfo.name === 'escape') {
          this.focus.setFocus('leftMenu');
        }
        if (keyInfo.name === 'return') {
          this.props.api
            .createEphemeralApp(this.ephemeralInput.value)
            .then((pair) => {
              this.selectedAppName = this.ephemeralInput.value;
              this.terminal?.resolve({
                status: 'submitted',
                data: {
                  ...pair,
                  approach: 'ephemeral',
                },
              });
            });
        } else {
          this.ephemeralInput.input(key, keyInfo);
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
