import chalk from 'chalk';
import boxen from 'boxen';
import stringWidth from 'string-width';
import { Prompt, SelectState } from './lib.ts';
import type { AnyKey, ModifyOutputFn } from './lib.ts';

export { render, renderUnwrap, setRawModeWindowsFriendly } from './lib.ts';

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
      expandableLabel?: string | (() => string | Promise<string>);
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
    private expandedIdx: number | null = null;
    private stickyExpanded = false;
    private readonly expansionCache: Map<number, string> = new Map();
    private readonly expansionLoading: Set<number> = new Set();

    constructor(params: SelectProps<T>) {
      super(params.modifyOutput);
      this.on('attach', (terminal) => terminal.toggleCursor('hide'));
      this.on('input', (input) => {
        if (input === 'j') {
          this.data.selectedIdx =
            (this.data.selectedIdx + 1) % this.options.length;
          this.applyNavigation();
        } else if (input === 'k') {
          this.data.selectedIdx =
            (this.data.selectedIdx - 1 + this.options.length) %
            this.options.length;
          this.applyNavigation();
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

      this.on('input', (_input, key) => {
        if (key?.name === 'tab') {
          const hasExpandable = this.options.some((o) => o.expandableLabel);
          if (!hasExpandable) return;
          this.stickyExpanded = !this.stickyExpanded;
          if (this.stickyExpanded) {
            this.expandFocused();
          } else {
            this.expandedIdx = null;
          }
          this.requestLayout();
          return;
        }
        if (key?.name === 'up' || key?.name === 'down') {
          this.applyNavigation();
          this.requestLayout();
        }
      });
    }

    private applyNavigation() {
      if (this.stickyExpanded) {
        this.expandFocused();
      } else {
        this.expandedIdx = null;
      }
    }

    private expandFocused() {
      const focused = this.data.selectedIdx;
      const focusedOption = this.options[focused];
      const exp = focusedOption?.expandableLabel;
      if (!exp) {
        this.expandedIdx = null;
        return;
      }
      this.expandedIdx = focused;
      if (
        typeof exp === 'function' &&
        !this.expansionCache.has(focused) &&
        !this.expansionLoading.has(focused)
      ) {
        this.expansionLoading.add(focused);
        Promise.resolve()
          .then(() => (exp as () => string | Promise<string>)())
          .then(
            (content) => {
              this.expansionLoading.delete(focused);
              this.expansionCache.set(focused, content);
              if (this.expandedIdx === focused) this.requestLayout();
            },
            (err) => {
              this.expansionLoading.delete(focused);
              this.expansionCache.set(
                focused,
                chalk.red(
                  `    Error loading expansion: ${err?.message ?? err}`,
                ),
              );
              if (this.expandedIdx === focused) this.requestLayout();
            },
          );
      }
    }

    private getExpansionContent(
      option: SelectProps<T>['options'][number],
      idx: number,
    ): string | null {
      const exp = option.expandableLabel;
      if (!exp) return null;
      if (typeof exp === 'string') return exp;
      if (this.expansionLoading.has(idx)) return chalk.dim('    Loading…');
      const cached = this.expansionCache.get(idx);
      return cached ?? chalk.dim('    Loading…');
    }

    result(): T {
      return this.data.items[this.data.selectedIdx]!;
    }

    render(status: 'idle' | 'submitted' | 'aborted'): string {
      if (status === 'submitted') {
        return `${this.params.promptText}
${chalk.hex('#EA570B').bold('●')} ${this.params.options[this.data.selectedIdx]?.label}`;
      }

      const renderRow = (
        option: SelectProps<T>['options'][number],
        originalIdx: number,
      ) => {
        const isSelected = originalIdx === this.data.selectedIdx;
        const cursor = isSelected ? chalk.hex('#EA570B').bold('●') : '○';
        const label = isSelected
          ? chalk.bold(option.label)
          : chalk.dim(option.label);
        const expandedContent =
          isSelected && this.expandedIdx === originalIdx
            ? this.getExpansionContent(option, originalIdx)
            : null;
        const expanded = expandedContent !== null ? '\n' + expandedContent : '';
        return `${cursor} ${label}${expanded}`;
      };

      const rowLineCount = (originalIdx: number) => {
        const opt = this.options[originalIdx]!;
        const labelLines = opt.label.split('\n').length;
        const isFocused = originalIdx === this.data.selectedIdx;
        const expContent =
          isFocused && this.expandedIdx === originalIdx
            ? this.getExpansionContent(opt, originalIdx)
            : null;
        const expLines =
          expContent !== null ? expContent.split('\n').length : 0;
        return labelLines + expLines;
      };

      const mainEntries: {
        opt: SelectProps<T>['options'][number];
        originalIdx: number;
      }[] = [];
      const secondaryEntries: typeof mainEntries = [];
      this.options.forEach((o, i) => {
        if (o.secondary) secondaryEntries.push({ opt: o, originalIdx: i });
        else mainEntries.push({ opt: o, originalIdx: i });
      });

      const totalRows = process.stdout.rows ?? 24;
      const secondaryHeight =
        secondaryEntries.length === 0
          ? 0
          : secondaryEntries.reduce(
              (acc, { originalIdx }) => acc + rowLineCount(originalIdx),
              0,
            ) + 1; // +1 for divider
      const hasExpandable = this.options.some((o) => o.expandableLabel);
      // chrome = prompt(1) + secondaries(+divider) + hint + safety(2)
      const chrome = 1 + secondaryHeight + (hasExpandable ? 1 : 0) + 2;
      const mainBudget = Math.max(3, totalRows - chrome);

      const focusedMainPos = mainEntries.findIndex(
        (e) => e.originalIdx === this.data.selectedIdx,
      );
      let visiblePositions: number[] = [];

      if (focusedMainPos >= 0) {
        let used = rowLineCount(mainEntries[focusedMainPos]!.originalIdx);
        visiblePositions = [focusedMainPos];
        let lo = focusedMainPos - 1;
        let hi = focusedMainPos + 1;
        while (lo >= 0 || hi < mainEntries.length) {
          let progressed = false;
          if (lo >= 0) {
            const h = rowLineCount(mainEntries[lo]!.originalIdx);
            if (used + h <= mainBudget) {
              visiblePositions.unshift(lo);
              used += h;
              lo--;
              progressed = true;
            } else {
              lo = -1;
            }
          }
          if (hi < mainEntries.length) {
            const h = rowLineCount(mainEntries[hi]!.originalIdx);
            if (used + h <= mainBudget) {
              visiblePositions.push(hi);
              used += h;
              hi++;
              progressed = true;
            } else {
              hi = mainEntries.length;
            }
          }
          if (!progressed) break;
        }
      } else {
        // Cursor is on a secondary — show as many mains as fit, top-down.
        let used = 0;
        for (let i = 0; i < mainEntries.length; i++) {
          const h = rowLineCount(mainEntries[i]!.originalIdx);
          if (used + h > mainBudget) break;
          visiblePositions.push(i);
          used += h;
        }
      }

      const firstVisible = visiblePositions[0] ?? 0;
      const lastVisible =
        visiblePositions[visiblePositions.length - 1] ?? mainEntries.length - 1;
      const aboveCount = firstVisible;
      const belowCount = Math.max(0, mainEntries.length - 1 - lastVisible);

      const mainLines: string[] = [];
      if (aboveCount > 0) mainLines.push(chalk.dim(`  ↑ ${aboveCount} more`));
      for (const pos of visiblePositions) {
        mainLines.push(
          renderRow(mainEntries[pos]!.opt, mainEntries[pos]!.originalIdx),
        );
      }
      if (belowCount > 0) mainLines.push(chalk.dim(`  ↓ ${belowCount} more`));
      const mainBlock = mainLines.join('\n');

      const secondaryBlock =
        secondaryEntries.length === 0
          ? ''
          : chalk.gray(
              '\n───────────────── Additional Options ─────────────────\n',
            ) +
            secondaryEntries
              .map((e) => renderRow(e.opt, e.originalIdx))
              .join('\n');

      const expandHint = hasExpandable
        ? '\n' +
          chalk.dim(
            this.stickyExpanded
              ? '  (tab to collapse)'
              : '  (tab to expand)',
          )
        : '';

      return `${this.params.promptText}
${mainBlock}${secondaryBlock}${expandHint}`;
    }
  }

  export type MultiSelectOption<T> = {
    value: T;
    label: string;
  };

  type MultiSelectProps<T> = {
    options: MultiSelectOption<T>[];
    promptText: string;
    initialSelected?: T[];
    filter?: (filter: string, option: MultiSelectOption<T>) => boolean;
    minSelected?: number;
    pageSize?: number;
    modifyOutput?: ModifyOutputFn;
  };

  const DEFAULT_MULTI_SELECT_PAGE_SIZE = 10;

  const defaultMultiSelectFilter = <T>(
    filter: string,
    option: MultiSelectOption<T>,
  ) => option.label.toLowerCase().includes(filter.toLowerCase());

  export class MultiSelect<T> extends Prompt<T[]> {
    private filterText = '';
    private cursorIdx = 0;
    private windowStart = 0;
    private selected: Set<number>;
    private errorText: string | undefined;
    private readonly props: MultiSelectProps<T>;
    private readonly pageSize: number;

    constructor(props: MultiSelectProps<T>) {
      super(props.modifyOutput);
      this.props = props;
      this.pageSize = props.pageSize ?? DEFAULT_MULTI_SELECT_PAGE_SIZE;
      this.selected = new Set(
        (props.initialSelected ?? [])
          .map((v) => props.options.findIndex((o) => o.value === v))
          .filter((i) => i >= 0),
      );
      this.on('attach', (terminal) => {
        terminal.setAllowInteraction(false);
        terminal.toggleCursor('hide');
      });
      this.on('detach', (terminal) => terminal.toggleCursor('show'));
      this.on('input', (input, key) => this.handleKey(input, key));
    }

    private visibleIndices(): number[] {
      const fn = this.props.filter ?? defaultMultiSelectFilter;
      if (!this.filterText) return this.props.options.map((_, i) => i);
      return this.props.options
        .map((opt, i) => ({ opt, i }))
        .filter(({ opt }) => fn(this.filterText, opt))
        .map(({ i }) => i);
    }

    private clampCursor(visible: number[]) {
      if (visible.length === 0) {
        this.cursorIdx = 0;
      } else if (this.cursorIdx >= visible.length) {
        this.cursorIdx = visible.length - 1;
      } else if (this.cursorIdx < 0) {
        this.cursorIdx = visible.length - 1;
      }
    }

    private adjustWindow(visible: number[]) {
      if (visible.length <= this.pageSize) {
        this.windowStart = 0;
        return;
      }
      if (this.cursorIdx < this.windowStart) {
        this.windowStart = this.cursorIdx;
      } else if (this.cursorIdx >= this.windowStart + this.pageSize) {
        this.windowStart = this.cursorIdx - this.pageSize + 1;
      }
      const maxStart = Math.max(0, visible.length - this.pageSize);
      if (this.windowStart > maxStart) this.windowStart = maxStart;
      if (this.windowStart < 0) this.windowStart = 0;
    }

    private handleKey(input: string | undefined, key: AnyKey) {
      if (key.name === 'escape') {
        return this.terminal?.resolve({ data: undefined, status: 'aborted' });
      }
      if (key.name === 'return') {
        const min = this.props.minSelected ?? 0;
        if (this.selected.size < min) {
          this.errorText =
            min === 1
              ? 'Select at least one option.'
              : `Select at least ${min} options.`;
          this.requestLayout();
          return;
        }
        return this.terminal?.resolve({
          data: this.result(),
          status: 'submitted',
        });
      }

      const visible = this.visibleIndices();

      if (key.name === 'up') {
        this.cursorIdx -= 1;
        this.clampCursor(visible);
        this.adjustWindow(visible);
        this.requestLayout();
        return;
      }
      if (key.name === 'down') {
        this.cursorIdx += 1;
        if (visible.length > 0) this.cursorIdx %= visible.length;
        this.adjustWindow(visible);
        this.requestLayout();
        return;
      }
      if (key.name === 'pageup') {
        this.cursorIdx -= this.pageSize;
        if (this.cursorIdx < 0) this.cursorIdx = 0;
        this.adjustWindow(visible);
        this.requestLayout();
        return;
      }
      if (key.name === 'pagedown') {
        this.cursorIdx += this.pageSize;
        if (this.cursorIdx >= visible.length) {
          this.cursorIdx = Math.max(0, visible.length - 1);
        }
        this.adjustWindow(visible);
        this.requestLayout();
        return;
      }
      if (key.name === 'space') {
        if (visible.length === 0) return;
        const optIdx = visible[this.cursorIdx]!;
        if (this.selected.has(optIdx)) {
          this.selected.delete(optIdx);
        } else {
          this.selected.add(optIdx);
        }
        this.errorText = undefined;
        this.requestLayout();
        return;
      }
      if (key.name === 'backspace') {
        if (this.filterText.length > 0) {
          this.filterText = this.filterText.slice(0, -1);
          this.cursorIdx = 0;
          this.windowStart = 0;
          this.requestLayout();
        }
        return;
      }
      if (key.name?.length === 1 && !key.ctrl && !key.meta && input) {
        this.filterText += input;
        this.cursorIdx = 0;
        this.windowStart = 0;
        this.requestLayout();
      }
    }

    result(): T[] {
      return [...this.selected]
        .sort((a, b) => a - b)
        .map((i) => this.props.options[i]!.value);
    }

    private renderOption(optIdx: number, isCursor: boolean) {
      const option = this.props.options[optIdx]!;
      const isSelected = this.selected.has(optIdx);
      const checkbox = isSelected ? chalk.green('◉') : '○';
      const cursorMark = isCursor ? chalk.hex('#EA570B').bold('❯') : ' ';
      const label = isCursor ? chalk.bold(option.label) : option.label;
      return `${cursorMark} ${checkbox} ${label}`;
    }

    render(status: 'idle' | 'submitted' | 'aborted'): string {
      if (status === 'submitted') {
        const labels = [...this.selected]
          .sort((a, b) => a - b)
          .map((i) => this.props.options[i]!.label);
        return `${this.props.promptText}
${chalk.hex('#EA570B').bold('●')} ${labels.length === 0 ? chalk.dim('(none)') : labels.join(', ')}`;
      }

      const visible = this.visibleIndices();
      this.adjustWindow(visible);
      const filterLine = `${chalk.dim('filter:')} ${this.filterText}${chalk.inverse(' ')}`;
      const errorLine = this.errorText ? `  ${chalk.red(this.errorText)}` : '';

      let optionsBlock: string;
      if (visible.length === 0) {
        optionsBlock = chalk.dim('  (no matches)');
      } else {
        const windowEnd = Math.min(
          this.windowStart + this.pageSize,
          visible.length,
        );
        const aboveCount = this.windowStart;
        const belowCount = visible.length - windowEnd;
        const lines: string[] = [];
        lines.push(
          aboveCount > 0
            ? chalk.dim(`  ↑ ${aboveCount} more`)
            : chalk.dim('   '),
        );
        for (let i = this.windowStart; i < windowEnd; i++) {
          lines.push(this.renderOption(visible[i]!, i === this.cursorIdx));
        }
        lines.push(
          belowCount > 0
            ? chalk.dim(`  ↓ ${belowCount} more`)
            : chalk.dim('   '),
        );
        optionsBlock = lines.join('\n');
      }

      const hint = chalk.dim(
        `  ↑↓ navigate · pgup/pgdn page · space toggle · enter submit · esc cancel`,
      );
      const counts = chalk.dim(
        `  ${visible.length} of ${this.props.options.length} shown · ${this.selected.size} selected`,
      );

      return `${this.props.promptText}${errorLine}
${filterLine}
${optionsBlock}
${counts}
${hint}`;
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

  export type TextInputProps = {
    placeholder?: string;
    prompt: string;
    modifyOutput?: ModifyOutputFn;
    defaultValue?: string;
    validate?: (value: string) => string | undefined;
    headless?: boolean;
    sensitive?: boolean;
  };

  export class TextInput extends Prompt<string> {
    override result(): string {
      return this.value;
    }
    override render(status: 'idle' | 'submitted' | 'aborted'): string {
      const value = this.props.sensitive
        ? '*'.repeat(this.value.length)
        : this.value;
      if (status === 'submitted') {
        return `${this.props.prompt}
${value}`;
      }
      if (status === 'aborted') {
        return `${this.props.prompt} ${value} (CANCELLED)\n`;
      }
      let inputDisplay = '';
      if (value === '') {
        inputDisplay = this.props.placeholder
          ? `${chalk.inverse(this.props.placeholder.substring(0, 1))}${chalk.dim(this.props.placeholder.substring(1))}`
          : chalk.inverse(' ');
      } else {
        inputDisplay = `${value}${chalk.inverse(' ')}`;
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
          if (
            this.value === '' &&
            this.props.defaultValue &&
            this.props.placeholder === this.props.defaultValue
          ) {
            this.value = this.props.defaultValue;
            this.requestLayout();
          }
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

  export interface AppSelectorApi {
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
    defaultAppName?: string;
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

      const defaultAppName = props.defaultAppName || 'My Awesome App';
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
