import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

import {
  MouseEventHandler,
  ReactNode,
  createElement,
  useEffect,
  useRef,
  useState,
  Fragment,
  PropsWithChildren,
} from 'react';
import { Editor, OnMount } from '@monaco-editor/react';
import {
  Dialog as HeadlessDialog,
  Popover,
  PopoverButton,
  PopoverPanel,
} from '@headlessui/react';
import * as HeadlessToggleGroup from '@radix-ui/react-toggle-group';
import Highlight, { defaultProps, Prism } from 'prism-react-renderer';

if (typeof global !== 'undefined') {
  (global as any).Prism = Prism;
} else {
  (window as any).Prism = Prism;
}

require('prismjs/components/prism-clojure');

import {
  CheckCircleIcon,
  ClipboardDocumentIcon,
  XMarkIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/solid';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { errorToast, successToast } from '@/lib/toast';
import CopyToClipboard from 'react-copy-to-clipboard';
import copy from 'copy-to-clipboard';

// content

export const Stack = twel('div', 'flex flex-col gap-2');
export const Group = twel('div', 'flex flex-col gap-2 md:flex-row');

export const Content = twel('div', 'prose');
export const ScreenHeading = twel('div', 'text-2xl font-bold');
export const SectionHeading = twel('div', 'text-xl font-bold');
export const SubsectionHeading = twel('div', 'text-lg');
export const BlockHeading = twel('div', 'text-md font-bold');

export const Hint = twel('div', 'text-sm text-gray-400');
export const Label = twel('div', 'text-sm font-bold text-gray-700');

export const LogoIcon = ({ size = 'mini' }: { size?: 'mini' | 'normal' }) => {
  const sizeToClass = {
    mini: 'h-4 w-4',
    normal: 'h-6 w-6',
  };
  return <img src="/img/icon/logo-512.svg" className={sizeToClass[size]} />;
};

// controls

export function ToggleCollection({
  className,
  buttonClassName,
  items,
  onChange,
  selectedId,
  disabled,
}: {
  className?: string;
  buttonClassName?: string;
  items: { id: string; label: ReactNode; link?: string }[];
  selectedId?: string;
  disabled?: boolean;
  onChange: (tab: { id: string; label: ReactNode; link?: string }) => void;
}) {
  return (
    <div className={cn('flex w-full flex-col gap-0.5', className)}>
      {items.map((a) =>
        a.link ? (
          <a
            key={a.id}
            href={a.link}
            target="_blank"
            rel="noopener noreferer"
            className={clsx(
              'block cursor-pointer truncate whitespace-nowrap rounded bg-none px-3 py-1 text-left hover:bg-gray-100 disabled:text-gray-400',
              {
                'bg-gray-200': selectedId === a.id,
              },
              buttonClassName,
            )}
          >
            {a.label}
          </a>
        ) : (
          <button
            key={a.id}
            disabled={disabled}
            onClick={() => {
              onChange(a);
            }}
            className={clsx(
              'block cursor-pointer truncate whitespace-nowrap rounded bg-none px-3 py-1 text-left hover:bg-gray-100 disabled:text-gray-400',
              {
                'bg-gray-200': selectedId === a.id,
              },
              buttonClassName,
            )}
          >
            {a.label}
          </button>
        ),
      )}
    </div>
  );
}

export function ToggleGroup({
  items,
  onChange,
  selectedId,
  ariaLabel,
}: {
  items: { id: string; label: string }[];
  selectedId?: string;
  ariaLabel?: string;
  onChange: (tab: { id: string; label: string }) => void;
}) {
  return (
    <HeadlessToggleGroup.Root
      value={selectedId}
      onValueChange={(id) => {
        if (!id) return;

        const item = items.find((item) => item.id === id);
        if (!item) return;

        onChange(item);
      }}
      className="flex gap-1 rounded-sm border bg-gray-200 p-0.5 text-sm"
      type="single"
      defaultValue="center"
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <HeadlessToggleGroup.Item
          key={item.id}
          className="flex-1 rounded-sm p-0.5"
          value={item.id}
          aria-label={item.label}
          style={{
            backgroundColor: selectedId === item.id ? 'white' : undefined,
          }}
        >
          {item.label}
        </HeadlessToggleGroup.Item>
      ))}
    </HeadlessToggleGroup.Root>
  );
}

export function TextInput({
  value,
  type,
  autoFocus,
  className,
  onChange,
  onKeyDown,
  label,
  error,
  placeholder,
  inputMode,
  tabIndex,
  disabled,
  title,
}: {
  value: string;
  type?: 'text' | 'email' | 'sensitive' | 'password';
  className?: string;
  error?: ReactNode;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  label?: React.ReactNode;
  placeholder?: string;
  autoFocus?: boolean;
  inputMode?: 'numeric' | 'text';
  tabIndex?: number;
  disabled?: boolean | undefined;
  title?: string | undefined;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, []);

  return (
    <label className="flex flex-col gap-2">
      {label ? <Label>{label}</Label> : null}
      <input
        disabled={disabled}
        title={title}
        type={type === 'sensitive' ? 'password' : (type ?? 'text')}
        // Try to prevent password managers from trying to save
        // sensitive input
        autoComplete={type === 'sensitive' ? 'off' : undefined}
        data-lpignore={type === 'sensitive' ? 'true' : undefined}
        ref={inputRef}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value ?? ''}
        className={cn(
          'flex w-full flex-1 rounded-sm border-gray-200 bg-white px-3 py-1 placeholder:text-gray-400 disabled:text-gray-400',
          className,
          {
            'border-red-500': error,
          },
        )}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        tabIndex={tabIndex}
      />
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
    </label>
  );
}

export function TextArea({
  value,
  autoFocus,
  className,
  onChange,
  onKeyDown,
  label,
  error,
  placeholder,
  inputMode,
  tabIndex,
  disabled,
  title,
  cols,
  rows,
}: {
  value: string;
  className?: string;
  error?: ReactNode;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  label?: React.ReactNode;
  placeholder?: string;
  autoFocus?: boolean;
  inputMode?: 'numeric' | 'text';
  tabIndex?: number;
  disabled?: boolean | undefined;
  title?: string | undefined;
  cols?: number | undefined;
  rows?: number | undefined;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, []);

  return (
    <label className="flex flex-col gap-2">
      {label ? <Label>{label}</Label> : null}
      <textarea
        disabled={disabled}
        title={title}
        ref={inputRef}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value ?? ''}
        className={cn(
          'flex w-full flex-1 rounded-sm border-gray-200 bg-white px-3 py-1 placeholder:text-gray-400 disabled:text-gray-400',
          className,
          {
            'border-red-500': error,
          },
        )}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        tabIndex={tabIndex}
        cols={cols}
        rows={rows}
      />
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
    </label>
  );
}

export function Checkbox({
  label,
  error,
  checked,
  onChange,
  className,
  labelClassName,
  required,
  disabled,
  title,
}: {
  label?: ReactNode;
  error?: ReactNode;
  checked: boolean;
  className?: string;
  labelClassName?: string;
  onChange: (
    checked: boolean,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  required?: boolean;
  disabled?: boolean | undefined;
  title?: string | undefined;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-top gap-2',
        disabled ? 'text-gray-400 cursor-default' : '',
        labelClassName,
      )}
      title={title}
    >
      <input
        disabled={disabled}
        title={title}
        required={required}
        className={cn(
          'align-middle mt-0.5 font-medium text-gray-900 disabled:border-gray-300 disabled:bg-gray-200',
          className,
        )}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked, e)}
      />{' '}
      {label}
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
    </label>
  );
}

export function Select({
  value,
  options,
  className,
  onChange,
  disabled,
  emptyLabel,
  tabIndex,
  title,
}: {
  value?: string;
  options: { label: string; value: string }[];
  className?: string;
  onChange: (option?: { label: string; value: string }) => void;
  disabled?: boolean;
  emptyLabel?: string;
  tabIndex?: number;
  title?: string | undefined;
}) {
  return (
    <select
      title={title}
      tabIndex={tabIndex}
      value={value ?? undefined}
      disabled={disabled}
      className={cn(
        'rounded-sm border-gray-300 py-1 disabled:text-gray-400',
        className,
      )}
      onChange={(e) => {
        const v = e.target.value;
        const o = options.find((o) => o.value === v);
        onChange(o);
      }}
    >
      {options.length ? (
        options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))
      ) : emptyLabel ? (
        <option value="" key="">
          {emptyLabel}
        </option>
      ) : null}
    </select>
  );
}

export type TabBarTab = { id: string; label: string; link?: string };

export function TabBar({
  className,
  selectedId,
  tabs,
  disabled,
  onSelect,
}: {
  className?: string;
  tabs: TabBarTab[];
  selectedId: string;
  disabled?: boolean;
  onSelect: (tab: { id: string; label: string }) => void;
}) {
  return (
    <div
      className={clsx(
        'flex flex-row gap-0.5 overflow-x-auto border-b px-2 py-1 no-scrollbar',
        className,
      )}
    >
      {tabs.map((t) =>
        t.link ? (
          <a
            key={t.id}
            href={t.link}
            target="_blank"
            rel="noopener noreferer"
            className={clsx(
              'flex cursor-pointer whitespace-nowrap bg-none px-4 py-0.5 disabled:text-gray-400 rounded hover:bg-gray-100',
              {
                'bg-gray-200': selectedId === t.id && !disabled,
              },
            )}
          >
            {t.label}
          </a>
        ) : (
          <button
            key={t.id}
            disabled={disabled}
            onClick={() => onSelect(t)}
            className={clsx(
              'flex cursor-pointer whitespace-nowrap bg-none px-4 py-0.5 disabled:text-gray-400 rounded hover:bg-gray-100',
              {
                'bg-gray-200': selectedId === t.id && !disabled,
              },
            )}
          >
            {t.label}
          </button>
        ),
      )}
    </div>
  );
}

export function Button({
  variant = 'primary',
  size = 'normal',
  type = 'button',
  onClick,
  href,
  className,
  children,
  disabled,
  loading,
  autoFocus,
  tabIndex,
  title,
}: PropsWithChildren<{
  variant?: 'primary' | 'secondary' | 'subtle' | 'destructive' | 'cta';
  size?: 'mini' | 'normal' | 'large' | 'xl' | 'nano';
  type?: 'link' | 'link-new' | 'button' | 'submit';
  onClick?: MouseEventHandler;
  href?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  autoFocus?: boolean;
  tabIndex?: number;
  title?: string | undefined;
}>) {
  const buttonRef = useRef<any>(null);
  const isATag = type === 'link' || (type === 'link-new' && href);

  useEffect(() => {
    if (autoFocus) {
      buttonRef.current?.focus();
    }
  }, []);

  const cls = cn(
    `inline-flex justify-center items-center gap-1 whitespace-nowrap px-8 py-1 font-bold rounded-sm cursor-pointer transition-all disabled:cursor-default`,
    {
      // primary
      'bg-[#606AF4] text-white ': variant === 'primary',
      'hover:text-slate-100 hover:bg-[#4543e9]':
        variant === 'primary' && isATag,
      'hover:enabled:text-slate-100 hover:enabled:bg-[#4543e9] disabled:bg-[#9197f3]':
        variant === 'primary' && !isATag,
      // cta
      'bg-orange-600 text-white ': variant === 'cta',
      'hover:text-slate-100 hover:bg-orange-500': variant === 'cta' && isATag,
      'hover:enabled:text-slate-100 hover:enabled:bg-orange-500':
        variant === 'cta' && !isATag,
      // secondary
      'border text-gray-500 bg-gray-50 shadow-sm ': variant === 'secondary',
      'hover:text-gray-600 hover:bg-gray-50/30':
        variant === 'secondary' && isATag,
      'hover:enabled:text-gray-600 hover:enabled:bg-gray-50/30 disabled:text-gray-400':
        variant === 'secondary' && !isATag,
      // subtle
      'text-gray-500 bg-white font-normal': variant === 'subtle',
      'hover:text-gray-600 hover:bg-gray-200/30':
        variant === 'subtle' && isATag,
      'hover:enabled:text-gray-600 hover:enabled:bg-gray-200/30':
        variant === 'subtle' && !isATag,
      // destructive
      'text-red-500 bg-white border border-red-200': variant === 'destructive',
      'hover:text-red-600 hover:text-red-600 hover:border-red-300':
        variant === 'destructive' && isATag,
      'hover:enabled:text-red-600 hover:enabled:text-red-600 hover:enabled:border-red-300 disabled:border-red-50 disabled:text-red-300':
        variant === 'destructive' && !isATag,
      'text-lg': size === 'large',
      'text-xl': size === 'xl',
      'text-sm px-2 py-0.5': size === 'mini',
      'text-xs px-2 py-0': size === 'nano',
      'cursor-not-allowed': disabled,
      'cursor-wait opacity-75': loading, // Apply wait cursor and lower opacity when loading
    },
    className,
  );

  if (isATag) {
    return (
      <a
        title={title}
        tabIndex={tabIndex}
        ref={buttonRef}
        className={cls}
        {...(type === 'link-new'
          ? { target: '_blank', rel: 'noopener noreferrer' }
          : {})}
        {...(loading || disabled
          ? { 'aria-disabled': true }
          : { href, onClick })}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      title={title}
      tabIndex={tabIndex}
      ref={buttonRef}
      disabled={loading || disabled}
      type={type === 'submit' ? 'submit' : 'button'}
      className={cls}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// interactions

export function useDialog() {
  const [open, setOpen] = useState(false);

  return {
    open,
    onOpen() {
      setOpen(true);
    },
    toggleOpen() {
      setOpen((_open) => !_open);
    },
    onClose() {
      setOpen(false);
    },
  };
}

export function Dialog({
  open,
  children,
  onClose,
}: {
  open: boolean;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <HeadlessDialog as="div" open={open} onClose={onClose}>
      <div className="fixed inset-0 z-50 bg-black/50" aria-hidden="true" />
      <div className="fixed inset-4 z-50 flex flex-col items-center justify-center">
        <HeadlessDialog.Panel className="relative w-full max-w-xl overflow-y-auto rounded bg-white p-3 text-sm shadow">
          <XMarkIcon
            className="absolute right-3 top-[18px] h-4 w-4 cursor-pointer"
            onClick={onClose}
          />
          {children}
        </HeadlessDialog.Panel>
      </div>
    </HeadlessDialog>
  );
}

// abstractions

/**
 * @deprecated Use `useForm` with a regular `<form>` and` <Button type="submit">` instead
 */
export function ActionForm({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form onSubmit={(e) => e.preventDefault()} className={className}>
      {children}
    </form>
  );
}

export function ActionButton({
  type,
  variant,
  disabled,
  className,
  label,
  submitLabel,
  errorMessage,
  successMessage,
  onClick,
  tabIndex,
  title,
}: {
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'destructive';
  disabled?: boolean;
  className?: string;
  label: ReactNode;
  submitLabel: string;
  errorMessage: string;
  successMessage?: string;
  onClick: () => any;
  tabIndex?: number;
  title?: string | undefined;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function _onClick() {
    if (submitting) return;

    setSubmitting(true);
    try {
      await onClick();
      if (successMessage) {
        successToast(successMessage);
      }
    } catch (error) {
      if ((error as any)?.hint) {
        const msg = `${errorMessage}\n${(error as any).message}\n${
          (error as any).hint?.errors?.[0]?.message
        }`;
        errorToast(msg);
      } else {
        errorToast(errorMessage);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button
      tabIndex={tabIndex}
      variant={variant ?? 'secondary'}
      type={type}
      disabled={disabled || submitting}
      className={className}
      onClick={_onClick}
      title={title}
    >
      {submitting ? submitLabel : label}
    </Button>
  );
}
// other

function redactedValue(v: string): string {
  if (v.length === 36 && v.indexOf('-') === 8) {
    // Probably a uuid, so preserve the dashes
    return v.replaceAll(/[^-]/g, '*');
  }
  return v.replaceAll(/./g, '*');
}

export function Copyable({
  value,
  label,
  size = 'normal',
  hideValue,
  onChangeHideValue,
}: {
  value: string;
  label: string;
  size?: 'normal' | 'large';
  hideValue?: boolean;
  onChangeHideValue?: () => void;
}) {
  const [copyLabel, setCopyLabel] = useState('Copy');
  const sizeToStyle = {
    normal: { main: 'text-sm', copy: 'text-xs' },
  };
  return (
    <div
      className={cn('flex items-center rounded border bg-white font-mono', {
        'text-sm': size === 'normal',
        'text-base': size === 'large',
      })}
    >
      <div
        className="border-r bg-gray-50 px-3 py-1.5"
        style={{
          borderTopLeftRadius: 'calc(0.25rem - 1px)',
          borderBottomLeftRadius: 'calc(0.25rem - 1px)',
        }}
      >
        {label}
      </div>
      <pre
        className="flex-1 truncate px-4 py-1.5"
        title={value}
        onClick={(e) => {
          const el = e.target as HTMLPreElement;
          const selection = window.getSelection();
          if (!selection || !el) return;

          // Set the start and end of the selection to the entire text content of the element.
          selection.selectAllChildren(el);
        }}
      >
        {hideValue ? redactedValue(value) : value}
      </pre>
      <div className="flex gap-1 px-1">
        {!!onChangeHideValue && (
          <button
            onClick={onChangeHideValue}
            className={cn(
              'flex items-center gap-x-1 rounded-sm bg-white px-2 py-1 ring-1 ring-inset ring-gray-300 hover:bg-gray-50',
              { 'text-xs': size === 'normal', 'text-sm': size === 'large' },
            )}
          >
            {hideValue ? (
              <EyeSlashIcon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <EyeIcon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
        <CopyToClipboard text={value}>
          <button
            onClick={() => {
              setCopyLabel('Copied!');
              setTimeout(() => {
                setCopyLabel('Copy');
              }, 2500);
            }}
            className={cn(
              'flex items-center gap-x-1 rounded-sm bg-white px-2 py-1 ring-1 ring-inset ring-gray-300 hover:bg-gray-50',
              { 'text-xs': size === 'normal', 'text-sm': size === 'large' },
            )}
          >
            <ClipboardDocumentIcon
              className="-ml-0.5 h-4 w-4"
              aria-hidden="true"
            />
            {copyLabel}
          </button>
        </CopyToClipboard>
      </div>
    </div>
  );
}

export function Copytext({ value }: { value: string }) {
  const [showCopied, setShowCopied] = useState(false);

  return (
    <span className="inline-flex items-center text-sm bg-gray-500 text-white px-2 rounded-sm">
      <code
        className="truncate"
        onClick={(e) => {
          const el = e.target as HTMLPreElement;
          const selection = window.getSelection();
          if (!selection || !el) return;

          // Set the start and end of the selection to the entire text content of the element.
          selection.selectAllChildren(el);
        }}
      >
        {value}
      </code>
      <CopyToClipboard
        text={value}
        onCopy={(text, result) => {
          if (result) {
            setShowCopied(true);
            setTimeout(() => {
              setShowCopied(false);
            }, 2500);
          }
        }}
      >
        {showCopied ? (
          <CheckCircleIcon className="pl-1" height={'1em'} />
        ) : (
          <ClipboardDocumentIcon
            className="cursor-pointer pl-1"
            height={'1em'}
          />
        )}
      </CopyToClipboard>
    </span>
  );
}

export function CodeEditor(props: {
  value: string;
  language: string;
  onChange: (value: string) => void;
  schema?: object;
  onMount?: OnMount;
  path?: string;
  tabIndex?: number;
}) {
  return (
    <Editor
      height={'100%'}
      language={props.language}
      value={props.value ?? ''}
      defaultPath={props.path}
      options={{
        scrollBeyondLastLine: false,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        minimap: { enabled: false },
        automaticLayout: true,
        tabIndex: props.tabIndex,
      }}
      onChange={(value) => {
        props.onChange(value || '');
      }}
      onMount={props.onMount}
      beforeMount={(monaco) => {}}
      loading={<FullscreenLoading />}
    />
  );
}

export function JSONEditor(props: {
  value: string;
  label: ReactNode;
  onSave: (value: string) => void;
  schema?: object;
}) {
  const [draft, setDraft] = useState(props.value);

  useEffect(() => {
    setDraft(props.value);
  }, [props.value]);

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="flex items-center gap-4 border-b px-4 py-2">
        <div className="font-mono">{props.label}</div>
        <Button onClick={() => props.onSave(draft)}>Save</Button>
      </div>
      <div className="flex-grow min-h-0">
        <CodeEditor
          language="json"
          value={props.value}
          onChange={(draft) => setDraft(draft)}
          onMount={function handleEditorDidMount(editor, monaco) {
            // cmd+S binding to save
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
              props.onSave(editor.getValue()),
            );

            if (!props.schema) return;
            monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
              validate: true,
              schemas: [
                {
                  uri: 'http://myserver/myJsonTypeSchema', // A URI for your schema (can be a dummy URI)
                  fileMatch: ['*'], // Associate with your model
                  schema: props.schema,
                },
              ],
            });
          }}
        />
      </div>
    </div>
  );
}

export type FenceLanguage =
  | 'jsx'
  | 'tsx'
  | 'javascript'
  | 'typescript'
  | 'bash'
  | 'json'
  | 'sql';

export function Fence({
  code,
  language,
  style: _style,
  className: _className,
  copyable,
}: {
  code: string;
  language: FenceLanguage;
  className?: string;
  style?: any;
  copyable?: boolean;
}) {
  const [copyLabel, setCopyLabel] = useState('Copy');
  return (
    <Highlight
      {...defaultProps}
      code={code.trimEnd()}
      language={language}
      theme={undefined}
    >
      {({ className, style, tokens, getTokenProps }) => (
        <pre
          className={clsx(className, _className)}
          style={{
            ...style,
            ..._style,
            ...(copyable ? { position: 'relative' } : {}),
          }}
        >
          {copyable ? (
            <div className="absolute top-0 right-0 px-2 flex items-center">
              <button
                onClick={(e) => {
                  copy(code);
                  setCopyLabel('Copied!');
                  setTimeout(() => {
                    setCopyLabel('Copy');
                  }, 2500);
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex items-center gap-x-1 rounded-sm bg-white px-2 py-1 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 text-xs"
              >
                <ClipboardDocumentIcon
                  className="-ml-0.5 h-4 w-4"
                  aria-hidden="true"
                />
                {copyLabel}
              </button>
            </div>
          ) : null}
          <code>
            {tokens.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {line
                  .filter((token) => !token.empty)
                  .map((token, tokenIndex) => {
                    const { key, ...props } = getTokenProps({ token });
                    return <span key={key || tokenIndex} {...props} />;
                  })}
                {'\n'}
              </Fragment>
            ))}
          </code>
        </pre>
      )}
    </Highlight>
  );
}

export const Divider = ({ children }: PropsWithChildren) => (
  <div className="flex items-center justify-center">
    <div
      aria-hidden="true"
      className="h-px w-full bg-gray-200"
      data-orientation="horizontal"
      role="separator"
    ></div>
    {children}
    <div
      aria-hidden="true"
      className="h-px w-full bg-gray-200"
      data-orientation="horizontal"
      role="separator"
    ></div>
  </div>
);

export const InfoTip = ({ children }: PropsWithChildren) => {
  return (
    <Popover
      as="span"
      className="inline-flex align-middle relative"
      data-open="true"
    >
      <PopoverButton className="inline">
        <InformationCircleIcon
          height="1em"
          width="1em"
          className="cursor-pointer"
        />
      </PopoverButton>

      <PopoverPanel
        anchor="bottom start"
        className="bg-white p-2 rounded-lg shadow-lg z-50"
      >
        {children}
      </PopoverPanel>
    </Popover>
  );
};

// utils

export function twel<T = {}>(
  el: string,
  cls: clsx.ClassValue[] | clsx.ClassValue,
) {
  return function (props: { className?: string; children: ReactNode } & T) {
    return createElement(el, {
      ...props,
      className: cn(cls, props.className),
    });
  };
}

export function cn(...inputs: clsx.ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function FullscreenLoading() {
  return (
    <div className="animate-slow-pulse flex w-full flex-1 flex-col bg-gray-300"></div>
  );
}
