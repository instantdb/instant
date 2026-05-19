import { Button, Content, SectionHeading } from '@/components/ui';
import {
  DashShell,
  EphemeralError,
  EphemeralLoading,
  useEphemeralInstantApp,
} from '../_shared';

function ProgressBar({ width }: { width: number }) {
  const pct = Math.max(0, Math.min(100, width));
  return (
    <div className="h-2 w-full rounded-sm bg-gray-200 dark:bg-neutral-700">
      <div
        className="h-2 rounded-sm bg-orange-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function BillingBody() {
  // Static mock for the redesign viewer
  const subscriptionName = 'Free';
  const totalAppBytes = 12 * 1024 * 1024; // 12 MB
  const totalStorageBytes = 4 * 1024 * 1024; // 4 MB
  const totalUsageBytes = totalAppBytes + totalStorageBytes;
  const limitBytes = 1024 * 1024 * 1024; // 1 GB
  const progress = Math.round((totalUsageBytes / limitBytes) * 100);

  const friendly = (n: number) => {
    if (n >= 1024 * 1024 * 1024) return `${(n / 1024 ** 3).toFixed(2)} GB`;
    if (n >= 1024 * 1024) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${n} B`;
  };

  return (
    <div className="flex max-w-md flex-col gap-4 p-4">
      <SectionHeading>Billing</SectionHeading>
      <div className="flex items-center gap-2">
        <h1 className="font-bold">Current plan</h1>
        <div className="rounded-sm border px-2 py-1 font-bold dark:border-neutral-600">
          {subscriptionName}
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded-sm border bg-white px-2 pt-1 pb-3 dark:border-neutral-700 dark:bg-neutral-800">
        <h2 className="flex justify-between gap-2 p-2">
          <span className="font-bold">Usage</span>{' '}
          <span className="font-mono text-sm">
            {friendly(totalUsageBytes)} / {friendly(limitBytes)}
          </span>
        </h2>
        <ProgressBar width={progress} />
        <div className="flex justify-start gap-4 pt-3 pl-2 text-sm">
          <span className="font-mono text-sm text-gray-500 dark:text-neutral-400">
            DB ({friendly(totalAppBytes)})
          </span>
          <span className="font-mono text-sm text-gray-500 dark:text-neutral-400">
            Storage ({friendly(totalStorageBytes)})
          </span>
        </div>
      </div>

      <div className="flex flex-col space-y-4">
        <Button variant="primary">Upgrade to Pro</Button>
        <Content className="rounded-sm border border-purple-400 bg-purple-100 px-2 py-1 text-sm text-purple-800 italic dark:border-purple-500/50 dark:bg-purple-500/20 dark:text-white">
          Pro offers 10GB of storage, backups, multiple team members for apps,
          and priority support.
        </Content>
      </div>
    </div>
  );
}

export function Current() {
  const ephemeral = useEphemeralInstantApp();
  if (ephemeral.status === 'loading') return <EphemeralLoading />;
  if (ephemeral.status === 'error') {
    return <EphemeralError error={ephemeral.error} reset={ephemeral.reset} />;
  }
  return (
    <DashShell active="billing" app={ephemeral.app}>
      <BillingBody />
    </DashShell>
  );
}
