import { ReactNode } from 'react';
import { SectionHeading } from '@/components/ui';

export function SettingsSection({
  title,
  description,
  action,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <SectionHeading>{title}</SectionHeading>
          {description ? (
            <div className="text-sm text-gray-500 dark:text-neutral-400">
              {description}
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function SettingsList({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y rounded-sm border bg-white dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-800">
      {children}
    </div>
  );
}

export function SettingsEmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-sm border border-dashed px-6 py-10 text-center dark:border-neutral-700">
      <div className="text-gray-400 dark:text-neutral-500">{icon}</div>
      <div className="font-medium">{title}</div>
      <p className="max-w-sm text-sm text-gray-400 dark:text-neutral-500">
        {description}
      </p>
    </div>
  );
}
