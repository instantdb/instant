'use client';
import { cn, twel } from './cn';

// Layout primitives
export const Stack = twel('div', 'flex flex-col gap-2');
export const Group = twel('div', 'flex flex-col gap-2 md:flex-row');

// Typography
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

// Icons
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

// Misc lightweight components
export const Divider = ({
  children,
  className,
}: {
  className?: string;
  children?: React.ReactNode;
}) => (
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

export const Badge = ({
  children,
  className,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
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

export function FullscreenLoading() {
  return (
    <div className="animate-slow-pulse flex w-full flex-1 flex-col bg-gray-300"></div>
  );
}

export function redactedValue(v: string): string {
  if (v.length === 36 && v.indexOf('-') === 8) {
    return v.replaceAll(/[^-]/g, '*');
  }
  return v.replaceAll(/./g, '*');
}
