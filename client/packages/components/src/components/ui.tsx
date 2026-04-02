'use client';
import { cn, twel } from './cn';
// Button is used internally by ActionButton, ProgressButton
import { Button } from './button';
import { Toaster, toast } from 'sonner';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import clsx from 'clsx';
import React from 'react';
import {
  Select as BaseSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';

import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as HeadlessToggleGroup from '@radix-ui/react-toggle-group';
import {
  ComponentProps,
  CSSProperties,
  PropsWithChildren,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

import { InformationCircleIcon } from '@heroicons/react/24/outline';
import {
  CheckCircleIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  EyeSlashIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import CopyToClipboard from 'react-copy-to-clipboard';
import { errorToast, successToast } from './toast';



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

export const LogoIcon = ({
  size = 'mini',
  className,
}: {
  size?: 'mini' | 'normal';
  className?: string;
}) => {
  const sizeToClass = {
    mini: 'h-4 w-4',
    normal: 'h-6 w-6',
  };
  return (
    <img
      src="/img/icon/logo-512.svg"
      className={cn(sizeToClass[size], className)}
    />
  );
};

// controls

export type TabItem = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
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
      {items.map((a) => (
        <button
          key={a.id}
          disabled={disabled}
          onClick={() => {
            onChange(a);
          }}
          className={cn(
            'block cursor-pointer truncate rounded bg-none px-3 py-1 text-left whitespace-nowrap hover:bg-gray-100 disabled:text-gray-400 dark:hover:bg-neutral-700/80',
            {
              'bg-gray-200 dark:bg-neutral-600/50': selectedId === a.id,
            },
            buttonClassName,
          )}
        >
          {a.label}
        </button>
      ))}
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
      className="flex gap-1 rounded-sm border border-gray-300 bg-gray-200 p-0.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
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
  label?: ReactNode;
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
  style,
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
  style?: CSSProperties;
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
        style={style}
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

export function Select<Value extends string | boolean>({
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
      value={value?.toString() ?? ''}
    >
      <SelectTrigger className={className} title={title} tabIndex={tabIndex}>
        <SelectValue placeholder={emptyLabel}>{visibleValue}</SelectValue>
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map((option) => (
          <SelectItem
            key={option.value?.toString()}
            value={option.value?.toString()}
          >
            {option.label}
          </SelectItem>
        ))}
        {options.length === 0 && noOptionsLabel}
      </SelectContent>
    </BaseSelect>
  );
}

// Button — canonical definition lives in ./button.tsx; re-export for barrel compat
export { Button };

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
      <TooltipTrigger asChild>
        <button
          title={label}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'flex h-9 w-9 cursor-pointer items-center justify-center rounded-sm p-2',
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

function MainDialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="dialog-overlay"
    className={cn(
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50',
      className,
    )}
    {...props}
  />
));

/**
 * Radix Dialog's TitleWarning uses document.getElementById to check for a title,
 * but this doesn't work in Shadow DOM. This component creates a hidden element
 * in the main document to satisfy the check, using a ref to get the actual ID
 * that Radix assigns to the title.
 */
function ShadowDialogTitle({ title }: { title: string }) {
  const shadowRoot = useShadowRoot();
  const titleRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    // Only needed in Shadow DOM and in development
    if (!shadowRoot || process.env.NODE_ENV === 'production') {
      return;
    }

    const titleId = titleRef.current?.id;
    if (!titleId) return;

    // Create a hidden element in the main document to satisfy Radix's getElementById check
    const hiddenTitle = document.createElement('span');
    hiddenTitle.id = titleId;
    hiddenTitle.style.display = 'none';
    document.body.appendChild(hiddenTitle);

    return () => {
      hiddenTitle.remove();
    };
  }, [shadowRoot]);

  return (
    <VisuallyHidden>
      <DialogPrimitive.Title ref={titleRef}>{title}</DialogPrimitive.Title>
    </VisuallyHidden>
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = false,
  title,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  title: string;
}) {
  const shadowRoot = useShadowRoot();
  const darkMode = useShadowDarkMode();

  return (
    <DialogPortal container={shadowRoot} data-slot="dialog-portal">
      <DialogOverlay className={cn(darkMode ? 'dark' : '', 'overflow-y-auto')}>
        <DialogPrimitive.Content
          aria-label={title}
          data-slot="dialog-content"
          className={cn(
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 relative top-[50%] left-[50%] z-50 grid max-h-[calc(100%-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-lg border border-gray-200 bg-white p-6 shadow-lg duration-200 sm:max-w-lg dark:border-neutral-700 dark:bg-neutral-800 dark:text-white',
            darkMode ? 'dark' : '',
            className,
          )}
          {...props}
        >
          <ShadowDialogTitle title={title} />
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity duration-100 hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogOverlay>
    </DialogPortal>
  );
}

export { DialogContent, DialogOverlay, DialogPortal };

export function Dialog({
  open,
  children,
  onClose,
  className,
  title,
  stopFocusPropagation = false,
  hideCloseButton = false,
}: {
  open: boolean;
  children: React.ReactNode;
  title: string;
  onClose: () => void;
  className?: string;
  stopFocusPropagation?: boolean;
  hideCloseButton?: boolean;
}) {
  return (
    <MainDialog
      onOpenChange={(s) => {
        if (!s) {
          onClose();
        }
      }}
      open={open}
    >
      <DialogContent
        title={title}
        onFocusCapture={(e) => {
          if (stopFocusPropagation) {
            e.stopPropagation();
          }
        }}
        autoFocus={false}
        tabIndex={undefined}
        className={`w-full max-w-xl overflow-y-auto rounded border-solid bg-white p-3 text-sm shadow dark:bg-neutral-800 dark:text-white ${className}`}
      >
        {!hideCloseButton && (
          <XMarkIcon
            className="absolute top-[18px] right-3 h-4 w-4 cursor-pointer"
            onClick={onClose}
          />
        )}
        {children}
      </DialogContent>
      {/*</div>*/}
    </MainDialog>
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

function createErrorMesageFromEx(errorMessage: string, error: any): string {
  let base = errorMessage;

  const topLevelMessage = error?.message as string | undefined;
  const hintMessage = error?.hint?.errors?.[0]?.message as string | undefined;

  const hasTopLevelMessage = topLevelMessage?.length;
  if (hasTopLevelMessage) {
    base += `\n${topLevelMessage}`;
  }

  const hasHint = hintMessage?.length;
  // Sometimes, the `hint` is directly embedded in the top-level message,
  // so we avoid repeating it here.
  const hintIsDistinct =
    hasHint &&
    (!hasTopLevelMessage || topLevelMessage.indexOf(hintMessage) === -1);

  if (hintIsDistinct) {
    base += `\n${hintMessage}`;
  }

  return base;
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
      errorToast(createErrorMesageFromEx(errorMessage, error));
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
            className={clsx('flex-1 cursor-pointer px-2 py-1.5 select-text', {
              truncate: !multiline,
              'break-all whitespace-pre-wrap': multiline,
            })}
            title={hideValue || hidden ? 'Copy to clipboard' : value}
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
  onCopy,
}: {
  value: string;
  label?: string;
  size?: 'normal' | 'large';
  defaultHidden?: boolean;
  hideValue?: boolean;
  onChangeHideValue?: () => void;
  multiline?: boolean;
  onCopy?: () => void;
}) {
  const [hidden, setHidden] = useState(defaultHidden);
  const [tooltipOpen, setTooltipOpen] = useState(false);
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
      <Tooltip open={tooltipOpen}>
        <TooltipTrigger asChild>
          <pre
            className={clsx('flex-1 cursor-pointer px-2 py-1.5 select-text', {
              truncate: !multiline,
              'break-all whitespace-pre-wrap': multiline,
            })}
            title={hideValue || hidden ? 'Copy to clipboard' : value}
            onClick={(e) => {
              // Only copy if no text is selected
              const selection = window.getSelection();
              if (!selection || selection.toString().length === 0) {
                window.navigator.clipboard.writeText(value);
                setTooltipOpen(true);
                setTimeout(() => setTooltipOpen(false), 1000);
                onCopy?.();
              }
            }}
          >
            {hideValue || hidden ? redactedValue(value) : value}
          </pre>
        </TooltipTrigger>
        <TooltipContent side="bottom">Copied!</TooltipContent>
      </Tooltip>
      <div className="flex gap-1 px-1">
        {!!handleChangeHideValue && (
          <button
            onClick={handleChangeHideValue}
            className={cn(
              'flex items-center gap-x-1 rounded-sm bg-white px-2 py-1 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-neutral-600/20 dark:ring-neutral-600 dark:hover:bg-neutral-600',
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
              'flex items-center gap-x-1 rounded-sm bg-white px-2 py-1 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-neutral-600/20 dark:ring-neutral-600 dark:hover:bg-neutral-600',
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

// Tooltip — canonical definitions live in ./tooltip.tsx; re-export for barrel compat
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root {...props} />;
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger {...props} />;
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  const shadowRoot = useShadowRoot();
  const darkMode = useShadowDarkMode();
  return (
    <DropdownMenuPrimitive.Portal container={shadowRoot}>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-48 overflow-visible rounded-md border border-neutral-200 bg-white p-1 text-neutral-950 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-50',
          darkMode ? 'dark' : '',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'relative flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none select-none focus:bg-neutral-100 focus:text-neutral-900 data-disabled:pointer-events-none data-disabled:opacity-50 dark:focus:bg-neutral-700 dark:focus:text-neutral-50',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn(
        '-mx-1 my-1 h-px bg-neutral-100 dark:bg-neutral-700',
        className,
      )}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};

// utils — canonical definitions live in ./cn.ts; re-export for barrel compat
export { cn, twel } from './cn';

export function FullscreenLoading() {
  return (
    <div className="animate-slow-pulse flex w-full flex-1 flex-col bg-gray-300"></div>
  );
}

// Code editors (CodeEditor, JSONEditor, Fence) have been moved to
// ./code-editors.tsx to avoid top-level Monaco/Prism imports.
// Import them directly: import { CodeEditor } from '@instantdb/components/components/code-editors'
export type { FenceLanguage } from './code-editors';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { useShadowRoot, useShadowDarkMode } from './StyleMe';
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'focus-visible:border-ring focus-visible:ring-ring/50 peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-2xs outline-hidden transition-all focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-neutral-800 data-[state=unchecked]:bg-neutral-300 dark:border dark:border-neutral-600 dark:data-[state=checked]:border-transparent dark:data-[state=checked]:bg-white dark:data-[state=unchecked]:bg-neutral-700',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block size-3.5 translate-y-0 rounded-full border-transparent bg-white ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=checked]:bg-white data-[state=unchecked]:translate-x-0 dark:bg-neutral-200 dark:data-[state=checked]:bg-neutral-600 dark:data-[state=unchecked]:bg-neutral-200',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Toaster, toast };

export { Switch };
