import type { ClassValue } from 'clsx';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Select as BaseSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/select';

import {
  MouseEventHandler,
  ReactNode,
  createElement,
  useEffect,
  useRef,
  useState,
  Fragment,
  PropsWithChildren,
  ComponentProps,
} from 'react';
import { Editor, Monaco, OnMount } from '@monaco-editor/react';
import {
  DialogPanel,
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
import Link from 'next/link';

// content

export const Stack = twel('div', 'flex flex-col gap-2');
export const Group = twel('div', 'flex flex-col gap-2 md:flex-row');

export const Content = twel('div', 'prose dark:text-neutral-400');
export const ScreenHeading = twel('div', 'text-2xl font-bold');
export const SectionHeading = twel('div', 'text-xl font-bold');
export const SubsectionHeading = twel('div', 'text-lg');
export const BlockHeading = twel('div', 'text-md font-bold');

export const Hint = twel('div', 'text-sm text-gray-400');
export const Label = twel(
  'div',
  'text-sm font-bold dark:text-neutral-400 text-gray-700',
);

export const LogoIcon = ({ size = 'mini' }: { size?: 'mini' | 'normal' }) => {
  const sizeToClass = {
    mini: 'h-4 w-4',
    normal: 'h-6 w-6',
  };
  return <img src="/img/icon/logo-512.svg" className={sizeToClass[size]} />;
};

// controls

export type TabItem = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  link?: { href: string; target?: '_blank' };
};

export type TabButton = Omit<TabItem, 'link'>;

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
  items: TabItem[];
  selectedId?: string;
  disabled?: boolean;
  onChange: (tab: TabButton) => void;
}) {
  return (
    <div className={cn('flex w-full flex-col gap-0.5', className)}>
      {items.map((a) =>
        a.link ? (
          <Link
            key={a.id}
            {...a.link}
            rel="noopener noreferer"
            className={clsx(
              'block cursor-pointer truncate whitespace-nowrap rounded bg-none px-3 py-1 text-left hover:bg-gray-100 disabled:text-gray-400 dark:bg-neutral-800/40 dark:hover:bg-neutral-700/80',
              {
                'bg-gray-200 dark:bg-neutral-500/40': selectedId === a.id,
              },
              buttonClassName,
            )}
          >
            {a.label}
          </Link>
        ) : (
          <button
            key={a.id}
            disabled={disabled}
            onClick={() => {
              onChange(a);
            }}
            className={clsx(
              'block cursor-pointer truncate whitespace-nowrap rounded bg-none px-3 py-1 text-left hover:bg-gray-100 disabled:text-gray-400 dark:hover:bg-neutral-700/80',
              {
                'bg-gray-200 dark:bg-neutral-600/50': selectedId === a.id,
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
      className="flex gap-1 rounded-sm border bg-gray-200 p-0.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
      type="single"
      defaultValue="center"
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <HeadlessToggleGroup.Item
          key={item.id}
          className={cn(
            'flex-1 rounded-sm p-0.5',
            selectedId === item.id
              ? 'bg-white dark:bg-neutral-600/50'
              : 'bg-gray-200 dark:bg-transparent',
          )}
          value={item.id}
          aria-label={item.label}
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
  required,
  onBlur,
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
  required?: boolean | undefined;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, []);

  return (
    <label className="flex flex-col gap-1">
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
          'flex w-full flex-1 rounded-sm border-gray-200 bg-white px-3 py-1 placeholder:text-gray-400 disabled:text-gray-400 dark:border-neutral-700 dark:bg-neutral-800 dark:placeholder:text-neutral-500 dark:disabled:text-neutral-700',
          className,
          {
            'border-red-500': error,
          },
        )}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        tabIndex={tabIndex}
        required={required}
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
          'flex w-full flex-1 rounded-sm border-gray-200 bg-white px-3 py-1 placeholder:text-gray-400 disabled:text-gray-400 dark:border-neutral-700 dark:bg-neutral-800',
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
        'items-top flex cursor-pointer gap-2 dark:disabled:opacity-40',
        disabled ? 'cursor-default text-gray-400 opacity-60' : '',
        labelClassName,
      )}
      title={title}
    >
      <input
        disabled={disabled}
        title={title}
        required={required}
        className={cn(
          'mt-0.5 align-middle font-medium text-gray-900 disabled:border-gray-300 disabled:bg-gray-200 dark:border-neutral-500 dark:bg-neutral-600/40 dark:ring-neutral-500 dark:disabled:border-neutral-400 dark:disabled:opacity-50',
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

export function Select<Value extends string>({
  value,
  options,
  className,
  onChange,
  disabled,
  emptyLabel,
  tabIndex,
  title,
  noOptionsLabel,
  contentClassName,
  visibleValue,
}: {
  value?: Value;
  options: { label: string | ReactNode; value: Value }[];
  className?: string;
  onChange: (option?: { label: string | ReactNode; value: Value }) => void;
  disabled?: boolean;
  emptyLabel?: string | ReactNode;
  noOptionsLabel?: string | ReactNode;
  tabIndex?: number;
  title?: string | undefined;
  contentClassName?: string;
  visibleValue?: ReactNode;
}) {
  return (
    <BaseSelect
      disabled={disabled}
      onValueChange={(value) => {
        const o = options.find((o) => o.value === value);
        onChange(o);
      }}
      value={value}
    >
      <SelectTrigger className={className} title={title} tabIndex={tabIndex}>
        <SelectValue placeholder={emptyLabel}>{visibleValue}</SelectValue>
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
        {options.length === 0 && noOptionsLabel}
      </SelectContent>
    </BaseSelect>
  );
}

export function NavTabBar({
  className,
  selectedId,
  tabs,
  disabled,
  onSelect,
}: {
  className?: string;
  tabs: TabItem[];
  selectedId: string;
  disabled?: boolean;
  onSelect: (tab: TabButton) => void;
}) {
  return (
    <div
      className={clsx(
        'no-scrollbar flex flex-row gap-4 overflow-x-auto border-b py-1',
        className,
      )}
    >
      {tabs.map((t) =>
        t.link ? (
          <Link
            key={t.id}
            {...t.link}
            rel="noopener noreferer"
            className={clsx(
              'flex cursor-pointer whitespace-nowrap rounded bg-none p-2 py-0.5 disabled:text-gray-400',
              {
                'bg-gray-200': selectedId === t.id && !disabled,
              },
            )}
          >
            {t.label}
          </Link>
        ) : (
          <button
            key={t.id}
            disabled={disabled}
            onClick={() => onSelect(t)}
            className={clsx(
              'flex cursor-pointer whitespace-nowrap rounded bg-none decoration-gray-400 transition-colors hover:underline disabled:text-gray-400',
              {
                'underline !decoration-[#606AF4] decoration-2':
                  selectedId === t.id && !disabled,
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

export function TabBar({
  className,
  selectedId,
  tabs,
  disabled,
  onSelect,
}: {
  className?: string;
  tabs: TabItem[];
  selectedId: string;
  disabled?: boolean;
  onSelect: (tab: TabButton) => void;
}) {
  return (
    <div
      className={clsx(
        'no-scrollbar flex flex-row gap-0.5 overflow-x-auto border-b px-2 py-1 dark:border-b-neutral-700',
        className,
      )}
    >
      {tabs.map((t) =>
        t.link ? (
          <Link
            key={t.id}
            {...t.link}
            rel=""
            className={clsx(
              'flex cursor-pointer whitespace-nowrap rounded bg-none px-4 py-0.5 hover:bg-gray-100 disabled:text-gray-400 dark:hover:bg-neutral-600',
              {
                'bg-gray-200 dark:bg-neutral-700':
                  selectedId === t.id && !disabled,
              },
            )}
          >
            {t.label}
          </Link>
        ) : (
          <button
            key={t.id}
            disabled={disabled}
            onClick={() => onSelect(t)}
            className={clsx(
              'flex cursor-pointer whitespace-nowrap rounded bg-none px-4 py-0.5 hover:bg-gray-100 disabled:text-gray-400 dark:hover:bg-neutral-600',
              {
                'bg-gray-200 dark:bg-neutral-700':
                  selectedId === t.id && !disabled,
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
      'bg-[#606AF4] text-white dark:bg-[#606AF4] dark:text-white':
        variant === 'primary',
      'hover:text-slate-100 hover:bg-[#4543e9] dark:hover:text-neutral-100 dark:hover:bg-[#4543e9]':
        variant === 'primary' && isATag,
      'hover:enabled:text-slate-100 hover:enabled:bg-[#4543e9] disabled:bg-[#9197f3] dark:hover:enabled:text-neutral-100 dark:hover:enabled:bg-[#4543e9] dark:disabled:bg-[#9197f3]':
        variant === 'primary' && !isATag,
      // cta
      'bg-orange-600 text-white dark:bg-orange-600 dark:text-white':
        variant === 'cta',
      'hover:text-slate-100 hover:bg-orange-500 dark:hover:text-neutral-100 dark:hover:bg-orange-500':
        variant === 'cta' && isATag,
      'hover:enabled:text-slate-100 hover:enabled:bg-orange-500 dark:hover:enabled:text-neutral-100 dark:hover:enabled:bg-orange-500':
        variant === 'cta' && !isATag,
      // secondary
      'border text-gray-500 bg-gray-50 shadow-sm dark:border-neutral-600 dark:text-neutral-400 dark:bg-neutral-800':
        variant === 'secondary',
      'hover:text-gray-600 hover:bg-gray-50/30 dark:hover:text-neutral-300 dark:hover:bg-neutral-700/30':
        variant === 'secondary' && isATag,
      'hover:enabled:text-gray-600 hover:enabled:bg-gray-50/30 disabled:text-gray-400 dark:hover:enabled:text-neutral-300 dark:hover:enabled:bg-neutral-700/30 dark:disabled:text-neutral-600':
        variant === 'secondary' && !isATag,
      // subtle
      'text-gray-500 bg-white font-normal dark:text-neutral-400 dark:bg-transparent':
        variant === 'subtle',
      'hover:text-gray-600 hover:bg-gray-200/30 dark:hover:text-neutral-300 dark:hover:bg-neutral-700/30':
        variant === 'subtle' && isATag,
      'hover:enabled:text-gray-600 hover:enabled:bg-gray-200/30 dark:hover:enabled:text-neutral-300 dark:hover:enabled:bg-neutral-700/30':
        variant === 'subtle' && !isATag,
      // destructive
      'text-red-500 dark:bg-red-500/10 bg-white border border-red-200 dark:border-red-900/60':
        variant === 'destructive',
      'hover:text-red-600 hover:text-red-600 hover:border-red-300 dark:hover:border-red-800':
        variant === 'destructive' && isATag,
      'hover:enabled:text-red-600 hover:enabled:text-red-600 hover:enabled:border-red-300 disabled:border-red-50 disabled:text-red-300 dark:hover:enabled:text-red-500 dark:hover:enabled:border-red-800 dark:disabled:border-red-950 dark:disabled:text-red-800':
        variant === 'destructive' && !isATag,
      'text-lg': size === 'large',
      'text-xl': size === 'xl',
      'text-sm px-2 py-0.5': size === 'mini',
      'text-xs px-2 py-0': size === 'nano',
      'cursor-not-allowed': disabled,
      'cursor-wait opacity-75': loading, // Apply wait cursor and lower opacity when loading,
      'bg-gray-200 text-gray-400 dark:bg-neutral-700 dark:text-neutral-500':
        variant == 'cta' && disabled,
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

interface IconButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  labelDirection?: ComponentProps<typeof TooltipContent>['side'];
  variant?: 'primary' | 'secondary' | 'subtle';
  className?: string;
}

export const IconButton = ({
  icon,
  label,
  onClick,
  disabled,
  labelDirection,
  variant,
  className,
}: IconButtonProps) => {
  return (
    <Tooltip>
      <TooltipTrigger>
        <button
          title={label}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-sm p-2',
            variant === 'primary' &&
              'bg-[#616AF4] text-white hover:bg-[#4543E9]',
            variant === 'secondary' &&
              'border border-gray-300 bg-white text-gray-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700/50',
            variant === 'subtle' &&
              'text-gray-800 hover:bg-gray-200/30 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700/50',
            disabled && 'cursor-not-allowed opacity-40',
            className,
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side={labelDirection}>{label}</TooltipContent>
    </Tooltip>
  );
};

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
  className,
  hideCloseButton = false,
}: {
  open: boolean;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
  hideCloseButton?: boolean;
}) {
  return (
    <HeadlessDialog as="div" open={open} onClose={onClose}>
      <div className="fixed inset-0 z-50 bg-black/50" aria-hidden="true" />
      <div className="fixed inset-4 z-50 flex flex-col items-center justify-center">
        <DialogPanel
          className={`relative w-full max-w-xl overflow-y-auto rounded bg-white p-3 text-sm shadow dark:bg-neutral-800 dark:text-white ${className}`}
        >
          {!hideCloseButton && (
            <XMarkIcon
              className="absolute right-3 top-[18px] h-4 w-4 cursor-pointer"
              onClick={onClose}
            />
          )}
          {children}
        </DialogPanel>
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
        const hintMessage = (error as any).hint?.errors?.[0]?.message;
        const msg = `${errorMessage}\n${(error as any).message}${
          hintMessage ? `\n${hintMessage}` : ''
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

export function redactedValue(v: string): string {
  if (v.length === 36 && v.indexOf('-') === 8) {
    // Probably a uuid, so preserve the dashes
    return v.replaceAll(/[^-]/g, '*');
  }
  return v.replaceAll(/./g, '*');
}

export function SmallCopyable({
  value,
  label,
  size = 'normal',
  defaultHidden,
  hideValue,
  onChangeHideValue,
  multiline = false,
}: {
  value: string;
  label?: string;
  size?: 'normal' | 'large';
  defaultHidden?: boolean;
  hideValue?: boolean;
  onChangeHideValue?: () => void;
  multiline?: boolean;
}) {
  const [hidden, setHidden] = useState(defaultHidden);
  const handleChangeHideValue =
    onChangeHideValue || (defaultHidden ? () => setHidden(!hidden) : null);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  return (
    <div
      className={cn(
        'flex items-center rounded font-mono text-xs opacity-70',
        {},
      )}
    >
      {label ? (
        <div
          className="py-1.5 opacity-50"
          style={{
            borderTopLeftRadius: 'calc(0.25rem - 1px)',
            borderBottomLeftRadius: 'calc(0.25rem - 1px)',
          }}
        >
          {label}:
        </div>
      ) : null}
      <Tooltip open={tooltipOpen}>
        <TooltipTrigger asChild>
          <pre
            className={clsx('flex-1 cursor-pointer select-text px-2 py-1.5', {
              truncate: !multiline,
              'whitespace-pre-wrap break-all': multiline,
            })}
            title={hideValue || hidden ? 'Copy App ID to Clipboard' : value}
            onClick={(e) => {
              // Only copy if no text is selected
              const selection = window.getSelection();
              if (!selection || selection.toString().length === 0) {
                window.navigator.clipboard.writeText(value);
                setTooltipOpen(true);
                setTimeout(() => setTooltipOpen(false), 1000);
              }
            }}
          >
            {hideValue || hidden ? redactedValue(value) : value}
          </pre>
        </TooltipTrigger>
        <TooltipContent side="bottom">Copied!</TooltipContent>
      </Tooltip>

      <div className="">
        {!!handleChangeHideValue && (
          <button
            onClick={handleChangeHideValue}
            className={cn(
              'flex items-center gap-x-1 rounded-sm px-2 py-1 opacity-50 transition-colors hover:bg-gray-50 dark:hover:bg-neutral-700',
              { 'text-xs': size === 'normal', 'text-sm': size === 'large' },
            )}
          >
            {hideValue || hidden ? (
              <EyeSlashIcon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <EyeIcon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export function Copyable({
  value,
  label,
  size = 'normal',
  defaultHidden,
  hideValue,
  onChangeHideValue,
  multiline,
}: {
  value: string;
  label?: string;
  size?: 'normal' | 'large';
  defaultHidden?: boolean;
  hideValue?: boolean;
  onChangeHideValue?: () => void;
  multiline?: boolean;
}) {
  const [hidden, setHidden] = useState(defaultHidden);
  const [copyLabel, setCopyLabel] = useState('Copy');
  const handleChangeHideValue =
    onChangeHideValue || (defaultHidden ? () => setHidden(!hidden) : null);

  return (
    <div
      className={cn(
        'flex items-center rounded border bg-white font-mono dark:border-neutral-700 dark:bg-neutral-800',
        {
          'text-sm': size === 'normal',
          'text-base': size === 'large',
        },
      )}
    >
      {label ? (
        <div
          className="border-r bg-gray-50 px-3 py-1.5 dark:border-r-neutral-700 dark:bg-neutral-700"
          style={{
            borderTopLeftRadius: 'calc(0.25rem - 1px)',
            borderBottomLeftRadius: 'calc(0.25rem - 1px)',
          }}
        >
          {label}
        </div>
      ) : null}
      <pre
        className={clsx('flex-1 px-4 py-1.5', {
          truncate: !multiline,
          'whitespace-pre-wrap break-all': multiline,
        })}
        title={value}
        onClick={(e) => {
          const el = e.target as HTMLPreElement;
          const selection = window.getSelection();
          if (!selection || !el) return;

          // Set the start and end of the selection to the entire text content of the element.
          selection.selectAllChildren(el);
        }}
      >
        {hideValue || hidden ? redactedValue(value) : value}
      </pre>
      <div className="flex gap-1 px-1">
        {!!handleChangeHideValue && (
          <button
            onClick={handleChangeHideValue}
            className={cn(
              'flex items-center gap-x-1 rounded-sm bg-white px-2 py-1 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-neutral-600/20 dark:ring-neutral-600',
              { 'text-xs': size === 'normal', 'text-sm': size === 'large' },
            )}
          >
            {hideValue || hidden ? (
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
              'flex items-center gap-x-1 rounded-sm bg-white px-2 py-1 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-neutral-600/20 dark:ring-neutral-600',
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
    <span className="inline-flex items-center rounded-sm bg-gray-500 px-2 text-sm text-white">
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
  loading?: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  const { darkMode } = useDarkMode();
  return (
    <Editor
      theme={darkMode ? 'vs-dark' : 'vs-light'}
      className={cn(
        props.loading ? 'animate-pulse' : undefined,
        props.className,
      )}
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
        readOnly: props.readOnly,
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

  const [monacoInstance, setMonacomonacoInstance] = useState<Monaco | null>(
    null,
  );

  useEffect(() => {
    setDraft(props.value);
  }, [props.value]);

  useEffect(() => {
    if (monacoInstance && props.schema) {
      monacoInstance.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        schemas: [
          {
            uri: 'http://myserver/myJsonTypeSchema', // A URI for your schema (can be a dummy URI)
            fileMatch: ['*'], // Associate with your model
            schema: props.schema,
          },
        ],
      });
    }
  }, [monacoInstance, props.schema]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50 dark:bg-[#252525]">
      <div className="flex items-center justify-between gap-4 border-b px-4 py-2 dark:border-b-neutral-700">
        <div className="font-mono">{props.label}</div>
        <Button size="mini" onClick={() => props.onSave(draft)}>
          Save
        </Button>
      </div>
      <div className="min-h-0 flex-grow">
        <CodeEditor
          language="json"
          value={props.value}
          onChange={(draft) => setDraft(draft)}
          onMount={function handleEditorDidMount(editor, monaco) {
            setMonacomonacoInstance(monaco);
            // cmd+S binding to save
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
              props.onSave(editor.getValue()),
            );
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
  const { darkMode } = useDarkMode();
  const [copyLabel, setCopyLabel] = useState('Copy');
  return (
    <Highlight
      {...defaultProps}
      code={code.trimEnd()}
      language={language}
      theme={
        darkMode
          ? {
              plain: {
                backgroundColor: '#262626',
                color: 'white',
              },
              styles: [],
            }
          : undefined
      }
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
            <div className="absolute right-0 top-0 flex items-center px-2">
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
                className="flex items-center gap-x-1 rounded-sm bg-white px-2 py-1 text-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-neutral-800 dark:ring-neutral-700"
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

export const Divider = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <div className={cn('flex items-center justify-center', className)}>
    <div
      aria-hidden="true"
      className="h-px w-full bg-gray-200 dark:bg-neutral-700"
      data-orientation="horizontal"
      role="separator"
    ></div>
    {children}
    <div
      aria-hidden="true"
      className="h-px w-full bg-gray-200 dark:bg-neutral-700"
      data-orientation="horizontal"
      role="separator"
    ></div>
  </div>
);

export const InfoTip = ({ children }: PropsWithChildren) => {
  return (
    <Popover
      as="span"
      className="relative inline-flex align-middle"
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
        className="z-50 rounded-lg bg-white p-2 shadow-lg dark:bg-neutral-800"
      >
        {children}
      </PopoverPanel>
    </Popover>
  );
};

export const Badge = ({
  children,
  className,
}: PropsWithChildren & { className?: string }) => {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-700/30 dark:text-blue-100',
        className,
      )}
    >
      {children}
    </span>
  );
};

export function ProgressButton({
  percentage = 0,
  loading,
  className,
  children,
  variant,
  ...props
}: PropsWithChildren<{
  percentage?: number;
  loading?: boolean;
  className?: string;
  variant?: 'primary' | 'secondary' | 'subtle' | 'destructive' | 'cta';
}> &
  Parameters<typeof Button>[0]) {
  const progressFillStyle = {
    transform: loading
      ? `scaleX(${Math.max(0, Math.min(100, percentage)) / 100})`
      : 'scaleX(0)',
    transition: 'transform 0.3s ease-in-out',
    transformOrigin: 'left',
  };

  const progressFillClass = cn('absolute inset-0 transition-all', {
    'bg-[#4543e9]': variant === 'primary' || !variant,
    'bg-orange-500': variant === 'cta',
    'bg-gray-200': variant === 'secondary',
    'bg-gray-300': variant === 'subtle',
    'bg-red-200': variant === 'destructive',
  });

  return (
    <Button
      {...props}
      variant={variant}
      loading={loading}
      className={cn('relative overflow-hidden', className)}
    >
      {loading && (
        <div className={progressFillClass} style={progressFillStyle} />
      )}
      <span className="relative z-10">{children}</span>
    </Button>
  );
}

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { useDarkMode } from './dash/DarkModeToggle';

function TooltipProvider({
  delayDuration = 100,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  );
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'text-primary-foreground origin-(--radix-tooltip-content-transform-origin) text-balance z-50 w-fit border border-gray-100 bg-white px-3 py-1.5 text-xs animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700/50',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };

// utils

export function twel<T = {}>(el: string, cls: ClassValue[] | ClassValue) {
  return function (props: { className?: string; children: ReactNode } & T) {
    return createElement(el, {
      ...props,
      className: cn(cls, props.className),
    });
  };
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function FullscreenLoading() {
  return (
    <div className="animate-slow-pulse flex w-full flex-1 flex-col bg-gray-300"></div>
  );
}
