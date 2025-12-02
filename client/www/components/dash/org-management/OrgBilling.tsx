import { useAuthedFetch, friendlyErrorMessage } from '@/lib/auth';
import config, { stripeKey } from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch } from '@/lib/fetch';
import { useContext } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { messageFromInstantError } from '@/lib/errors';
import { InstantIssue } from '@instantdb/core';
import { errorToast } from '@/lib/toast';
import { friendlyUsage, GB_1, GB_10, GB_250, ProgressBar } from '../Billing';
import { useFetchedDash } from '../MainDashLayout';
import {
  Button,
  cn,
  Content,
  SectionHeading,
  SubsectionHeading,
} from '@/components/ui';
import { OrgWorkspace } from '@/lib/hooks/useWorkspace';

async function createPortalSession(orgId: string, token: string) {
  const sessionPromise = jsonFetch(
    `${config.apiURI}/dash/orgs/${orgId}/portal_session`,
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

async function createCheckoutSession(orgId: string, token: string) {
  const sessionPromise = jsonFetch(
    `${config.apiURI}/dash/orgs/${orgId}/checkout_session`,
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

export function formatCredit(credit: number) {
  const dollars = (credit / 100) * -1;
  // Format as currency (you can customize the locale and currency)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars);
}

export const OrgBilling = () => {
  const token = useContext(TokenContext);
  const fetchedDash = useFetchedDash();
  const orgId = fetchedDash.data.currentWorkspaceId;

  const onUpgrade = async () => {
    createCheckoutSession(orgId, token);
  };

  const onManageBilling = async () => {
    createPortalSession(orgId, token);
  };

  const fetchResult = useAuthedFetch<{
    'total-app-bytes': number;
    'total-storage-bytes': number;
    'subscription-name': string;
    'stripe-subscription-id': string | null;
    'customer-balance': number | null;
  }>(`${config.apiURI}/dash/orgs/${orgId}/billing`);
  if (fetchResult.error) {
    return <div>Error fetching data</div>;
  }
  const org = fetchedDash.data.workspace as OrgWorkspace;

  const isPaid = org.org.paid;

  if (!fetchResult.data) {
    return <div>Loading...</div>;
  }
  const data = fetchResult.data;

  const totalAppBytes = data['total-app-bytes'] || 0;
  const totalStorageBytes = data['total-storage-bytes'] || 0;
  const totalUsageBytes = totalAppBytes + totalStorageBytes;
  const isFreeTier = data['subscription-name'] === 'Free';
  const credit = data['customer-balance'] || 0;
  const progressDen = isFreeTier ? GB_1 : GB_250;
  const progress = Math.round((totalUsageBytes / progressDen) * 100);

  return (
    <div className="pt-2">
      <div className="gap flex flex-col rounded-sm border bg-white px-2 pt-1 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="flex items-end justify-between gap-2 p-2">
          <span className="font-bold">Usage (all apps)</span>{' '}
          <span className="font-mono text-sm">
            {friendlyUsage(totalUsageBytes)}{' '}
            {isPaid && <span>/ {friendlyUsage(progressDen)}</span>}
          </span>
        </div>
        {isPaid && <ProgressBar width={progress} />}
        <div
          className={cn('flex justify-start space-x-2 pl-2 text-sm', 'pt-3')}
        >
          <span className="font-mono text-sm text-gray-500">
            DB ({friendlyUsage(totalAppBytes)})
          </span>

          <span className="pb-3 font-mono text-sm text-gray-500">
            Storage ({friendlyUsage(totalStorageBytes)})
          </span>
        </div>
      </div>
      <SectionHeading className="pt-8 pb-2">Billing</SectionHeading>
      {isFreeTier ? (
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={onUpgrade}>
            Upgrade to Startup
          </Button>
          <div className="w-full rounded-sm border border-purple-400 bg-purple-100 px-2 py-1 text-sm text-purple-800 italic">
            Startup offer 250GB of storage across all apps, multiple team
            members for apps, and priority support.
          </div>
        </div>
      ) : (
        <Button variant="primary" onClick={onManageBilling}>
          Manage Startup subscription
        </Button>
      )}
      {credit < 0 ? (
        <div className="pt-4">
          <SubsectionHeading>Credit</SubsectionHeading>
          <Content>
            You have a {formatCredit(credit)} credit that will be applied to
            your next invoice.
          </Content>
        </div>
      ) : null}
    </div>
  );
};
