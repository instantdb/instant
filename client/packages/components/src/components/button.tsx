'use client';
import {
  type MouseEventHandler,
  type PropsWithChildren,
  useEffect,
  useRef,
} from 'react';
import { cn } from './cn';

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
      'border border-gray-200 text-gray-500 bg-gray-50 shadow-sm dark:border-neutral-600 dark:text-neutral-400 dark:bg-neutral-800':
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
      'cursor-wait opacity-75': loading,
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
