import { Button, Content, SectionHeading } from '@/components/ui';
import {
  DashPage,
  DashNotice,
  DashPanel,
  DashPanelHeader,
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
    <DashPage size="default">
      <div>
        <SectionHeading>Billing</SectionHeading>
        <Content className="mt-1">
          Review usage and upgrade when you need more room.
        </Content>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
        <DashPanel>
          <DashPanelHeader
            title="Usage"
            description={`${friendly(totalUsageBytes)} of ${friendly(
              limitBytes,
            )} used`}
          />
          <ProgressBar width={progress} />
          <div className="flex justify-start gap-4 pt-4 text-sm">
            <span className="font-mono text-sm text-gray-500 dark:text-neutral-400">
              DB ({friendly(totalAppBytes)})
            </span>
            <span className="font-mono text-sm text-gray-500 dark:text-neutral-400">
              Storage ({friendly(totalStorageBytes)})
            </span>
          </div>
        </DashPanel>

        <DashPanel>
          <DashPanelHeader
            title="Current plan"
            description="Free plan"
            action={
              <div className="rounded-md border border-gray-200 bg-[#fbfaf8] px-3 py-1.5 text-sm font-semibold dark:border-neutral-700 dark:bg-neutral-800">
                {subscriptionName}
              </div>
            }
          />
          <div className="flex flex-col gap-3">
            <Button variant="primary" size="large">
              Upgrade to Pro
            </Button>
            <DashNotice tone="neutral">
              Pro includes 10GB of storage, backups, multiple team members, and
              priority support.
            </DashNotice>
          </div>
        </DashPanel>
      </div>
    </DashPage>
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
