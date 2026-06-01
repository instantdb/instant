import { SectionHeading, Button } from '@/components/ui';
import { friendlyErrorMessage, useAuthedFetch } from '@/lib/auth';
import { messageFromInstantError } from '@/lib/errors';
import config, { stripeKey } from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch } from '@/lib/fetch';
import { AppsSubscriptionResponse, InstantIssue } from '@/lib/types';
import { loadStripe } from '@stripe/stripe-js';
import { useContext } from 'react';
import { Loading, ErrorMessage } from '@/components/dash/shared';
import { errorToast } from '@/lib/toast';
import confetti from 'canvas-confetti';
import { useOrgPaid } from '@/lib/hooks/useOrgPaid';
import Link from 'next/link';

export const GB_1 = 1024 * 1024 * 1024;
export const GB_10 = 10 * GB_1;
export const GB_250 = 250 * GB_1;

export function roundToDecimal(num: number, decimalPlaces: number) {
  const factor = Math.pow(10, decimalPlaces);
  return Math.round(num * factor) / factor;
}

export function friendlyUsage(usage: number) {
  if (usage < GB_1) {
    return `${roundToDecimal(usage / (1024 * 1024), 2)} MB`;
  }
  return `${roundToDecimal(usage / (1024 * 1024 * 1024), 2)} GB`;
}

async function createCheckoutSession(appId: string, token: string) {
  const sessionPromise = jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/checkout_session`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
  );
  Promise.all([loadStripe(stripeKey), sessionPromise])
    .then(([stripe, session]) => {
      if (!stripe || !session) {
        throw new Error('Failed to create checkout session');
      }
      stripe.redirectToCheckout({ sessionId: session.id });
    })
    .catch((err) => {
      const message =
        messageFromInstantError(err as InstantIssue) ||
        'Failed to connect w/ Stripe! Try again or ping us on Discord if this persists.';
      const friendlyMessage = friendlyErrorMessage('dash-billing', message);
      errorToast(friendlyMessage);
      console.error(err);
    });
}

async function createPortalSession(appId: string, token: string) {
  const sessionPromise = jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/portal_session`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
  );
  Promise.all([loadStripe(stripeKey), sessionPromise])
    .then(([stripe, session]) => {
      if (!stripe || !session) {
        throw new Error('Failed to create portal session');
      }
      window.open(session.url, '_blank');
    })
    .catch((err) => {
      const message =
        messageFromInstantError(err as InstantIssue) ||
        'Failed to connect w/ Stripe! Try again or ping us on Discord if this persists.';
      const friendlyMessage = friendlyErrorMessage('dash-billing', message);
      errorToast(friendlyMessage);
      console.error(err);
    });
}

export function ProgressBar({ width }: { width: number }) {
  return (
    <div className="relative h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
      <div
        style={{ width: `${width}%` }}
        className="absolute top-0 left-0 h-full bg-indigo-500"
      />
    </div>
  );
}

// A title plus a one-line description. Mirrors the auth dashboard so billing
// reads as part of the same product.
export function BillingHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <SectionHeading>{title}</SectionHeading>
      <p className="text-sm text-gray-500 dark:text-neutral-400">
        {description}
      </p>
    </div>
  );
}

// The usage readout: headline number against its limit, a progress bar, and the
// DB/Storage split. Shared by app and org billing. A null limit (free org tier)
// hides the denominator and bar, since there's nothing to measure against.
export function UsageMeter({
  label,
  usedBytes,
  limitBytes,
  dbBytes,
  storageBytes,
}: {
  label: string;
  usedBytes: number;
  limitBytes: number | null;
  dbBytes: number;
  storageBytes: number;
}) {
  const progress = limitBytes
    ? Math.min(100, Math.round((usedBytes / limitBytes) * 100))
    : 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-sm text-gray-500 dark:text-neutral-400">
          {friendlyUsage(usedBytes)}
          {limitBytes ? ` / ${friendlyUsage(limitBytes)}` : null}
        </span>
      </div>
      {limitBytes ? <ProgressBar width={progress} /> : null}
      <div className="flex gap-4 font-mono text-xs text-gray-500 dark:text-neutral-400">
        <span>DB · {friendlyUsage(dbBytes)}</span>
        <span>Storage · {friendlyUsage(storageBytes)}</span>
      </div>
    </div>
  );
}

// The paid-plan badge: click it for confetti. Pure delight, so it only shows
// once you've actually upgraded.
function PaidPlanBadge({ name }: { name: string }) {
  return (
    <div style={{ animation: 'wiggle 5s infinite' }} className="self-start">
      <div
        className="cursor-pointer rounded-sm border border-purple-400 bg-purple-100 px-2 py-1 font-mono font-bold text-purple-800 transition-all select-none hover:-translate-y-1 active:scale-90 dark:border-purple-400/50 dark:bg-purple-800/40 dark:text-purple-100"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const originX = (rect.x + 0.5 * rect.width) / window.innerWidth;
          const originY = (rect.y + 0.5 * rect.height) / window.innerHeight;
          confetti({
            angle: randomInRange(55, 125),
            spread: randomInRange(50, 70),
            particleCount: randomInRange(50, 100),
            origin: { x: originX, y: originY },
          });
        }}
      >
        {name} <span>🎉</span>
      </div>
    </div>
  );
}

export default function Billing({ appId }: { appId: string }) {
  const token = useContext(TokenContext);

  const onUpgrade = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.preventDefault();
    createCheckoutSession(appId, token);
  };

  const onManage = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.preventDefault();
    createPortalSession(appId, token);
  };

  const orgIsPaid = useOrgPaid();

  const authResponse = useAuthedFetch<AppsSubscriptionResponse>(
    `${config.apiURI}/dash/apps/${appId}/billing`,
  );

  if (authResponse.isLoading) {
    return <Loading />;
  }

  if (orgIsPaid) {
    return (
      <div className="flex max-w-xl flex-col gap-6 p-4">
        <BillingHeader
          title="Billing"
          description="This app is billed as part of your organization."
        />
        <div className="flex flex-col items-start gap-3 rounded-sm border bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <p className="text-sm text-gray-600 dark:text-neutral-300">
            Usage and payment for this app are managed in your organization's
            billing settings.
          </p>
          <Link href={'/dash/org?tab=billing'}>
            <Button variant="primary">Manage organization billing</Button>
          </Link>
        </div>
      </div>
    );
  }

  const data = authResponse.data;

  if (!data) {
    return (
      <div className="flex max-w-xl flex-col gap-4 p-4">
        <ErrorMessage>
          <div className="flex gap-2">
            There was an error loading the data.{' '}
            <Button
              variant="subtle"
              size="mini"
              onClick={() =>
                authResponse.mutate(undefined, { revalidate: true })
              }
            >
              Refresh.
            </Button>
          </div>
        </ErrorMessage>
      </div>
    );
  }

  const subscriptionName = data['subscription-name'];
  const isFreeTier = subscriptionName === 'Free';
  const totalAppBytes = data['total-app-bytes'] || 0;
  const totalStorageBytes = data['total-storage-bytes'] || 0;
  const totalUsageBytes = totalAppBytes + totalStorageBytes;
  const progressDen = isFreeTier ? GB_1 : GB_10;

  return (
    <div className="flex max-w-xl flex-col gap-6 p-4">
      <BillingHeader
        title="Billing"
        description="Keep track of your usage and manage your plan."
      />

      <div className="rounded-sm border bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-gray-500 dark:text-neutral-400">
              Current plan
            </span>
            {isFreeTier ? (
              <span className="text-lg font-semibold">Free</span>
            ) : (
              <PaidPlanBadge name={subscriptionName} />
            )}
          </div>
          {isFreeTier ? (
            <Button variant="primary" onClick={onUpgrade}>
              Upgrade to Pro
            </Button>
          ) : (
            <Button variant="secondary" onClick={onManage}>
              Manage subscription
            </Button>
          )}
        </div>
        {isFreeTier ? (
          <p className="mt-3 text-sm text-gray-500 dark:text-neutral-400">
            Pro includes 10 GB of storage, backups, multiple team members, and
            priority support.
          </p>
        ) : null}
      </div>

      <div className="rounded-sm border bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
        <UsageMeter
          label="Usage"
          usedBytes={totalUsageBytes}
          limitBytes={progressDen}
          dbBytes={totalAppBytes}
          storageBytes={totalStorageBytes}
        />
      </div>
    </div>
  );
}

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
