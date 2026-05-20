import clsx from 'clsx';

import { Prism } from 'prism-react-renderer';
import { ReactNode } from 'react';

if (typeof global !== 'undefined') {
  (global as any).Prism = Prism;
} else {
  (window as any).Prism = Prism;
}

require('prismjs/components/prism-clojure');

import Link from 'next/link';

import { ui } from '@instantdb/components';

export const {
  Button,
  Badge,
  BlockHeading,
  Content,
  Divider,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Group,
  Hint,
  IconButton,
  InfoTip,
  Label,
  LogoIcon,
  ScreenHeading,
  SectionHeading,
  Stack,
  SubsectionHeading,
  Tooltip,
  TooltipContent,
  ActionButton,
  Checkbox,
  Copyable,
  Copytext,
  Dialog,
  FullscreenLoading,
  ProgressButton,
  Select,
  SmallCopyable,
  TextArea,
  TextInput,
  ToggleCollection,
  ToggleGroup,
  cn,
  redactedValue,
  twel,
  useDialog,
  TooltipProvider,
  TooltipTrigger,
  CodeEditor,
  Fence,
  JSONDiffEditor,
  JSONEditor,
  BaseSelect,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Switch,
} = ui;

export type TabItem = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  link?: { href: string; target?: '_blank' };
};

export type TabButton = Omit<TabItem, 'link'>;

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
        'no-scrollbar flex flex-row gap-1 overflow-x-auto rounded-md border border-gray-200 bg-white p-1 text-sm shadow-xs dark:border-neutral-700 dark:bg-neutral-900',
        className,
      )}
    >
      {tabs.map((t) =>
        t.link ? (
          <Link
            key={t.id}
            {...t.link}
            rel="noopener noreferrer"
            className={clsx(
              'flex cursor-pointer rounded px-3 py-1.5 whitespace-nowrap text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-950 disabled:text-gray-400 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white',
              {
                'bg-gray-100 font-semibold text-gray-950 dark:bg-neutral-800 dark:text-white':
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
              'flex cursor-pointer rounded px-3 py-1.5 whitespace-nowrap text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-950 disabled:text-gray-400 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white',
              {
                'bg-gray-100 font-semibold text-gray-950 dark:bg-neutral-800 dark:text-white':
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
        'no-scrollbar flex flex-row gap-1 overflow-x-auto border-b border-gray-200 px-3 py-2 text-sm dark:border-b-neutral-700',
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
              'flex cursor-pointer rounded-md px-3 py-1.5 whitespace-nowrap text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-950 disabled:text-gray-400 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-white',
              {
                'bg-gray-100 font-semibold text-gray-950 dark:bg-neutral-700 dark:text-white':
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
              'flex cursor-pointer rounded-md px-3 py-1.5 whitespace-nowrap text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-950 disabled:text-gray-400 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-white',
              {
                'bg-gray-100 font-semibold text-gray-950 dark:bg-neutral-700 dark:text-white':
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

export type FenceLanguage =
  | 'jsx'
  | 'tsx'
  | 'javascript'
  | 'typescript'
  | 'bash'
  | 'json'
  | 'sql';
