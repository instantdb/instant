'use client';
import { Toaster, toast } from 'sonner';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { DiffEditor, Editor, Monaco, OnMount } from '@monaco-editor/react';
import type { ClassValue } from 'clsx';
import clsx from 'clsx';
import copy from 'copy-to-clipboard';
import React from 'react';
import { twMerge } from 'tailwind-merge';
import {
  Select as BaseSelect,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';

import Highlight, { defaultProps } from 'prism-react-renderer';

import { parsePermsJSON } from '@lib/utils/parsePermsJSON';

import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as HeadlessToggleGroup from '@radix-ui/react-toggle-group';
import {
  ComponentProps,
  createElement,
  CSSProperties,
  MouseEventHandler,
  PropsWithChildren,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { useLocalStorage } from '@lib/hooks/useLocalStorage';
import {
  CheckCircleIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  EyeSlashIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import CopyToClipboard from 'react-copy-to-clipboard';
import { errorToast, successToast } from './toast';

import { useMonacoJSONSchema } from '@lib/hooks/useMonacoJSONSchema';

// content

export const Stack = twel('div', 'flex flex-col gap-2');
export const Group = twel('div', 'flex flex-col gap-2 md:flex-row');

export const Content = twel(
  'div',
  'prose prose-sm max-w-none leading-relaxed text-gray-600 dark:prose-invert dark:text-neutral-400',
);
export const ScreenHeading = twel(
  'div',
  'text-4xl font-semibold tracking-normal text-gray-950 dark:text-white',
);
export const SectionHeading = twel(
  'div',
  'text-xl font-semibold tracking-normal text-gray-950 dark:text-white',
);
export const SubsectionHeading = twel(
  'div',
  'text-lg font-semibold tracking-normal text-gray-900 dark:text-neutral-100',
);
export const BlockHeading = twel(
  'div',
  'text-md font-semibold tracking-normal text-gray-900 dark:text-neutral-100',
);

export const Hint = twel('div', 'text-sm text-gray-400');
export const Label = twel(
  'div',
  'text-sm font-semibold text-gray-700 dark:text-neutral-400',
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
    <div className={cn('flex w-full flex-col gap-1', className)}>
      {items.map((a) => (
        <button
          key={a.id}
          disabled={disabled}
          onClick={() => {
            onChange(a);
          }}
          className={cn(
            'block cursor-pointer truncate rounded-md bg-none px-3 py-2 text-left text-sm whitespace-nowrap text-gray-600 transition-colors hover:bg-white/70 hover:text-gray-950 disabled:text-gray-400 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white',
            {
              'bg-white font-semibold text-gray-950 shadow-xs dark:bg-neutral-900 dark:text-white':
                selectedId === a.id,
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
      className="flex gap-1 rounded-md border border-gray-300 bg-gray-100 p-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      type="single"
      defaultValue="center"
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <HeadlessToggleGroup.Item
          key={item.id}
          className={cn(
            'flex-1 rounded px-3 py-1.5 transition-colors',
            selectedId === item.id
              ? 'bg-white font-semibold text-gray-950 shadow-xs dark:bg-neutral-700 dark:text-white'
              : 'text-gray-600 hover:bg-white/60 dark:bg-transparent dark:text-neutral-400 dark:hover:bg-neutral-800',
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
  size = 'normal',
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
  ignorePasswordManagers,
}: {
  value: string;
  type?: 'text' | 'email' | 'sensitive' | 'password';
  size?: 'normal' | 'large' | 'jumbo';
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
  ignorePasswordManagers?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldIgnorePasswordManagers =
    type === 'sensitive' || ignorePasswordManagers;

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
        // Try to prevent password managers (LastPass, 1Password,
        // BitWarden) from attaching to or saving sensitive input.
        autoComplete={shouldIgnorePasswordManagers ? 'off' : undefined}
        data-lpignore={shouldIgnorePasswordManagers ? 'true' : undefined}
        data-1p-ignore={shouldIgnorePasswordManagers ? 'true' : undefined}
        data-bwignore={shouldIgnorePasswordManagers ? 'true' : undefined}
        data-form-type={shouldIgnorePasswordManagers ? 'other' : undefined}
        // LastPass attaches its UI to any <input type="password"> even
        // when data-lpignore="true" is set. To opt out we render the
        // field as type="text" and use -webkit-text-security to mask
        // the value as discs visually.
        type={type === 'sensitive' ? 'text' : (type ?? 'text')}
        style={
          // @ts-expect-error non-standard css property
          type === 'sensitive' ? { WebkitTextSecurity: 'disc' } : undefined
        }
        // Turn off the text-entry protections that `type="password"`
        // gives you for free but `type="text"` doesn't: browsers
        // spellcheck on desktop and autocorrect / autocapitalize on
        // mobile for text inputs, any of which can quietly mutate a
        // secret or train the keyboard on its characters.
        spellCheck={type === 'sensitive' ? false : undefined}
        autoCapitalize={type === 'sensitive' ? 'none' : undefined}
        autoCorrect={type === 'sensitive' ? 'off' : undefined}
        ref={inputRef}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value ?? ''}
        className={cn(
          'flex w-full flex-1 rounded-md border border-gray-300 bg-white text-gray-950 shadow-xs transition-colors outline-none placeholder:text-gray-400 focus:border-[#606AF4] focus:ring-2 focus:ring-[#606AF4]/15 disabled:text-gray-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-[#8f95ff] dark:focus:ring-[#8f95ff]/15 dark:disabled:text-neutral-700',
          size === 'normal' && 'min-h-10 px-3.5 py-2 text-sm',
          size === 'large' && 'min-h-12 px-4 py-2.5 text-base',
          size === 'jumbo' && 'min-h-16 border-2 px-5 py-3 text-xl font-medium',
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
          'flex w-full flex-1 rounded-md border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-950 shadow-xs transition-colors outline-none placeholder:text-gray-400 focus:border-[#606AF4] focus:ring-2 focus:ring-[#606AF4]/15 disabled:text-gray-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-[#8f95ff] dark:focus:ring-[#8f95ff]/15 dark:disabled:text-neutral-700',
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
  size = 'default',
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
  size?: 'sm' | 'default' | 'lg';
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
      <SelectTrigger
        className={className}
        size={size}
        title={title}
        tabIndex={tabIndex}
      >
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
  size?: 'nano' | 'mini' | 'normal' | 'large' | 'xl' | 'jumbo';
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
    `inline-flex min-h-10 justify-center items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold cursor-pointer transition-colors disabled:cursor-default`,
    {
      // primary
      'bg-[#ff875b] text-white shadow-xs dark:bg-[#ff875b] dark:text-white':
        variant === 'primary',
      'hover:text-white hover:bg-[#ff7448] dark:hover:text-white dark:hover:bg-[#ff7448]':
        variant === 'primary' && isATag,
      'hover:enabled:text-white hover:enabled:bg-[#ff7448] disabled:bg-[#ffc1aa] disabled:text-white dark:hover:enabled:text-white dark:hover:enabled:bg-[#ff7448] dark:disabled:bg-[#8b4f3c]':
        variant === 'primary' && !isATag,
      // cta
      'bg-orange-600 text-white dark:bg-orange-600 dark:text-white':
        variant === 'cta',
      'hover:text-slate-100 hover:bg-orange-500 dark:hover:text-neutral-100 dark:hover:bg-orange-500':
        variant === 'cta' && isATag,
      'hover:enabled:text-slate-100 hover:enabled:bg-orange-500 dark:hover:enabled:text-neutral-100 dark:hover:enabled:bg-orange-500':
        variant === 'cta' && !isATag,
      // secondary
      'border border-gray-300 bg-white text-gray-800 shadow-xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200':
        variant === 'secondary',
      'hover:text-gray-950 hover:bg-gray-50 dark:hover:text-white dark:hover:bg-neutral-800':
        variant === 'secondary' && isATag,
      'hover:enabled:text-gray-950 hover:enabled:bg-gray-50 disabled:text-gray-400 dark:hover:enabled:text-white dark:hover:enabled:bg-neutral-800 dark:disabled:text-neutral-600':
        variant === 'secondary' && !isATag,
      // subtle
      'bg-transparent text-gray-600 shadow-none dark:text-neutral-400':
        variant === 'subtle',
      'hover:text-gray-950 hover:bg-gray-100 dark:hover:text-white dark:hover:bg-neutral-800':
        variant === 'subtle' && isATag,
      'hover:enabled:text-gray-950 hover:enabled:bg-gray-100 dark:hover:enabled:text-white dark:hover:enabled:bg-neutral-800':
        variant === 'subtle' && !isATag,
      // destructive
      'border border-red-200 bg-white text-red-600 shadow-xs dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-400':
        variant === 'destructive',
      'hover:text-red-700 hover:border-red-300 hover:bg-red-50 dark:hover:border-red-800 dark:hover:bg-red-950/30':
        variant === 'destructive' && isATag,
      'hover:enabled:text-red-700 hover:enabled:border-red-300 hover:enabled:bg-red-50 disabled:border-red-50 disabled:text-red-300 dark:hover:enabled:text-red-300 dark:hover:enabled:border-red-800 dark:hover:enabled:bg-red-950/30 dark:disabled:border-red-950 dark:disabled:text-red-800':
        variant === 'destructive' && !isATag,
      'min-h-11 px-5 text-base': size === 'large',
      'min-h-12 px-6 text-lg': size === 'xl',
      'min-h-16 px-6 text-xl': size === 'jumbo',
      'min-h-8 px-3 py-1 text-xs': size === 'mini',
      'min-h-6 rounded px-2 py-0.5 text-xs': size === 'nano',
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
        className={cn(
          'w-full max-w-xl overflow-y-auto rounded-lg border border-gray-200 bg-white p-5 text-sm shadow-xl sm:p-6 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white',
          className,
        )}
      >
        {!hideCloseButton && (
          <button
            type="button"
            aria-label="Close"
            className="absolute top-4 right-4 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-white"
            onClick={onClose}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
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
        'flex min-w-0 items-center rounded-md font-mono text-xs text-gray-500 dark:text-neutral-400',
        {},
      )}
    >
      {label ? (
        <div
          className="shrink-0 py-1.5 text-gray-400 dark:text-neutral-500"
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
            className={clsx(
              'min-w-0 flex-1 cursor-pointer px-2 py-1.5 select-text',
              {
                truncate: !multiline,
                'break-all whitespace-pre-wrap': multiline,
              },
            )}
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
              'flex h-7 w-7 items-center justify-center gap-x-1 rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-neutral-700 dark:hover:text-white',
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
  label?: React.ReactNode;
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
        'flex min-w-0 items-stretch overflow-hidden rounded-md border border-gray-200 bg-[#fbfaf8] font-mono shadow-xs dark:border-neutral-700 dark:bg-neutral-900',
        {
          'text-sm': size === 'normal',
          'text-base': size === 'large',
        },
      )}
    >
      {label ? (
        <div
          className="flex shrink-0 items-center border-r border-gray-200 bg-white/70 px-3 py-2 text-xs font-semibold text-gray-500 dark:border-r-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
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
            className={clsx(
              'min-w-0 flex-1 cursor-pointer px-3 py-2 select-text',
              {
                truncate: !multiline,
                'break-all whitespace-pre-wrap': multiline,
              },
            )}
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
      <div className="flex shrink-0 items-center gap-1 px-1.5">
        {!!handleChangeHideValue && (
          <button
            onClick={handleChangeHideValue}
            className={cn(
              'flex h-8 items-center gap-x-1 rounded-md border border-gray-200 bg-white px-2 text-gray-700 hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700',
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
              'flex h-8 items-center gap-x-1 rounded-md border border-gray-200 bg-white px-2 text-gray-700 hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700',
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
    <span className="inline-flex items-center rounded-sm bg-gray-100 px-2 text-sm text-gray-800 dark:bg-neutral-700 dark:text-neutral-200">
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

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Fragment, useId } from 'react';

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
  const shadowRoot = useShadowRoot();
  const darkMode = useShadowDarkMode();
  return (
    <TooltipPrimitive.Portal container={shadowRoot}>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) border border-gray-100 bg-white px-3 py-1.5 text-xs text-balance text-gray-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white',
          darkMode ? 'dark' : '',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

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

export {
  BaseSelect,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};

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

// code editors
export function CodeEditor(props: {
  value: string;
  darkMode: boolean;
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
  return (
    <Editor
      theme={props.darkMode ? 'instant-dark' : 'instant-light'}
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
        fontSize: 13,
        lineHeight: 20,
        padding: { top: 12, bottom: 12 },
        tabIndex: props.tabIndex,
        readOnly: props.readOnly,
      }}
      onChange={(value) => {
        props.onChange(value || '');
      }}
      onMount={props.onMount}
      beforeMount={(monaco) => {
        monaco.editor.defineTheme('instant-light', {
          base: 'vs',
          inherit: true,
          rules: [
            { token: 'comment', foreground: '737373' },
            { token: 'keyword', foreground: 'b45309' },
            { token: 'string', foreground: '047857' },
            { token: 'number', foreground: '9a3412' },
            { token: 'type', foreground: '365b9d' },
            { token: 'delimiter', foreground: '525252' },
          ],
          colors: {
            'editor.background': '#ffffff',
            'editor.foreground': '#171717',
            'editorLineNumber.foreground': '#b6b6b6',
            'editorLineNumber.activeForeground': '#737373',
            'editor.selectionBackground': '#ffe0d1',
            'editor.inactiveSelectionBackground': '#fff0e8',
            'editorCursor.foreground': '#ff875b',
            'editorIndentGuide.background1': '#eeeeee',
            'editorIndentGuide.activeBackground1': '#d4d4d4',
            'editor.lineHighlightBackground': '#fbfaf8',
          },
        });
        monaco.editor.defineTheme('instant-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [
            { token: 'comment', foreground: '8a8a8a' },
            { token: 'keyword', foreground: 'ffb088' },
            { token: 'string', foreground: '6ee7b7' },
            { token: 'number', foreground: 'fcd34d' },
            { token: 'type', foreground: '93c5fd' },
            { token: 'delimiter', foreground: 'd4d4d4' },
          ],
          colors: {
            'editor.background': '#111111',
            'editor.foreground': '#f5f5f5',
            'editorLineNumber.foreground': '#525252',
            'editorLineNumber.activeForeground': '#a3a3a3',
            'editor.selectionBackground': '#583424',
            'editor.inactiveSelectionBackground': '#2f211b',
            'editorCursor.foreground': '#ffb088',
            'editor.lineHighlightBackground': '#171717',
          },
        });
      }}
      loading={<FullscreenLoading />}
    />
  );
}

export function JSONEditor(props: {
  value: string;
  darkMode: boolean;
  label: ReactNode;
  onSave: (value: string) => void;
  schema?: object;
}) {
  const [draft, setDraft] = useState(props.value);
  const editorId = useId();
  const filePath = `json-editor-${editorId}.json`;

  const [monacoInstance, setMonacomonacoInstance] = useState<
    Monaco | undefined
  >(undefined);

  useMonacoJSONSchema(filePath, monacoInstance, props.schema);

  useEffect(() => {
    setDraft(props.value);
  }, [props.value]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50 dark:bg-[#252525]">
      <div className="flex items-center justify-between gap-4 border-b px-4 py-2 dark:border-b-neutral-700">
        <div className="font-mono">{props.label}</div>
        <Button
          size="mini"
          disabled={draft === props.value}
          title={draft === props.value ? 'No changes' : undefined}
          onClick={() => props.onSave(draft)}
        >
          Save
        </Button>
      </div>
      <div className="min-h-0 grow">
        <CodeEditor
          darkMode={props.darkMode}
          language="json"
          value={props.value}
          path={filePath}
          onChange={(draft) => setDraft(draft)}
          onMount={function handleEditorDidMount(editor, monaco) {
            setMonacomonacoInstance(monaco);
            // cmd+S binding to save
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
              props.onSave(editor.getValue()),
            );

            // Handle JSON5 paste conversion
            editor.onDidPaste(async () => {
              const model = editor.getModel();
              if (!model) return;

              // Wait 20 ms for paste to complete
              setTimeout(async () => {
                const fullContent = model.getValue();
                if (!fullContent.trim()) return;

                const converted = parsePermsJSON(fullContent);
                if (converted.status === 'ok') {
                  model.setValue(JSON.stringify(converted.value, null, 2));
                }
              }, 20);
            });
          }}
        />
      </div>
    </div>
  );
}

export function JSONDiffEditor(props: {
  original: string;
  modified: string;
  darkMode: boolean;
  label: ReactNode;
  action?: ReactNode;
}) {
  const [sideBySide, setSideBySide] = useLocalStorage('diffSideBySide', false);
  const diffEditorRef = useRef<any>(null);

  useEffect(() => {
    const editor = diffEditorRef.current;
    if (!editor) return;
    editor.updateOptions({ renderSideBySide: sideBySide });
    editor.getOriginalEditor().updateOptions({
      lineNumbers: sideBySide ? 'on' : 'off',
    });
  }, [sideBySide]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50 dark:bg-[#252525]">
      <div className="flex items-center justify-between gap-4 border-b px-4 py-2 dark:border-b-neutral-700">
        <div className="font-mono">{props.label}</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSideBySide(!sideBySide)}
            title={sideBySide ? 'Inline diff' : 'Side-by-side diff'}
            className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
          >
            {sideBySide ? 'Inline' : 'Split'}
          </button>
          {props.action}
        </div>
      </div>
      <div className="min-h-0 grow">
        <DiffEditor
          theme={props.darkMode ? 'vs-dark' : 'vs-light'}
          height={'100%'}
          language="json"
          original={props.original}
          modified={props.modified}
          options={{
            scrollBeyondLastLine: false,
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            minimap: { enabled: false },
            automaticLayout: true,
            readOnly: true,
            domReadOnly: true,
            renderSideBySide: sideBySide,
            renderOverviewRuler: false,
          }}
          onMount={(editor) => {
            diffEditorRef.current = editor;
            if (!sideBySide) {
              editor.getOriginalEditor().updateOptions({ lineNumbers: 'off' });
            }
          }}
          loading={<FullscreenLoading />}
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
  darkMode,
  className: _className,
  copyable,
}: {
  code: string;
  darkMode?: boolean;
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
      theme={
        darkMode || false
          ? {
              plain: {
                backgroundColor: '#262626',
                color: 'white',
              },
              styles: [],
            }
          : {
              plain: {
                backgroundColor: '#fffdfa',
                color: '#171717',
              },
              styles: [
                {
                  types: ['comment', 'prolog', 'doctype', 'cdata'],
                  style: { color: '#7a7a7a' },
                },
                { types: ['string'], style: { color: '#166534' } },
                { types: ['number'], style: { color: '#9a3412' } },
                { types: ['keyword'], style: { color: '#4f46e5' } },
                { types: ['function'], style: { color: '#0f766e' } },
              ],
            }
      }
    >
      {({ className, style, tokens, getTokenProps }) => {
        const codeBlock = (
          <pre
            className={clsx(className, _className)}
            style={{
              ...style,
              ..._style,
              marginTop: 0,
              marginBottom: 0,
              border: 'none',
            }}
          >
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
        );

        if (!copyable) {
          return codeBlock;
        }

        return (
          <div className="relative">
            <div className="absolute top-1 right-1 z-10 flex items-center">
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
                className="flex items-center gap-x-1 rounded-sm bg-white px-2 py-1 text-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-neutral-800 dark:ring-neutral-700 dark:hover:bg-neutral-700"
              >
                <ClipboardDocumentIcon
                  className="-ml-0.5 h-4 w-4"
                  aria-hidden="true"
                />
                {copyLabel}
              </button>
            </div>
            {codeBlock}
          </div>
        );
      }}
    </Highlight>
  );
}

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
