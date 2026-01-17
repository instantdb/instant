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
  JSONEditor,
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
              'flex cursor-pointer rounded bg-none p-2 py-0.5 whitespace-nowrap disabled:text-gray-400',
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
              'flex cursor-pointer rounded bg-none whitespace-nowrap decoration-gray-400 transition-colors hover:underline disabled:text-gray-400',
              {
                'underline decoration-[#606AF4]! decoration-2':
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
              'flex cursor-pointer rounded bg-none px-4 py-0.5 whitespace-nowrap hover:bg-gray-100 disabled:text-gray-400 dark:hover:bg-neutral-600',
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
              'flex cursor-pointer rounded bg-none px-4 py-0.5 whitespace-nowrap hover:bg-gray-100 disabled:text-gray-400 dark:hover:bg-neutral-600',
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
