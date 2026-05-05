import { type ReactNode } from 'react';
import {
  CommandLineIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline';

export function SetupPaths({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 border border-gray-200 dark:border-slate-800">
      {children}
    </div>
  );
}

function HeaderBar({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="not-prose flex items-center gap-2 bg-gray-50/80 px-4 py-1.5 text-sm font-medium text-gray-700 dark:bg-slate-900 dark:text-slate-300">
      <span className="text-gray-500 dark:text-slate-400">{icon}</span>
      {label}
    </div>
  );
}

const contentClass =
  'px-5 py-3 prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-pre:my-0 [&_pre]:rounded-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0';

export function DashboardPath({ children }: { children: ReactNode }) {
  return (
    <>
      <HeaderBar
        icon={<ComputerDesktopIcon className="h-4 w-4" />}
        label="From the dashboard"
      />
      <div className={contentClass}>{children}</div>
    </>
  );
}

export function TerminalPath({ children }: { children: ReactNode }) {
  return (
    <>
      <HeaderBar
        icon={<CommandLineIcon className="h-4 w-4" />}
        label="From the terminal"
      />
      <div className={contentClass}>{children}</div>
    </>
  );
}
