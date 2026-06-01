import { useAuthedFetch, friendlyErrorMessage } from '@/lib/auth';
import config, { stripeKey } from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch } from '@/lib/fetch';
import { useContext } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { messageFromInstantError } from '@/lib/errors';
import { InstantIssue } from '@instantdb/core';
import { errorToast } from '@/lib/toast';
import { BillingHeader, GB_250, UsageMeter } from '../Billing';
import { useFetchedDash } from '../MainDashLayout';
import { Button } from '@/components/ui';
import { Loading, ErrorMessage } from '@/components/dash/shared';
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

  if (fetchResult.isLoading) {
    return <Loading />;
  }

  const data = fetchResult.data;

  if (fetchResult.error || !data) {
    return (
      <div className="flex flex-col gap-4 pt-6">
        <ErrorMessage>
          <div className="flex gap-2">
            There was an error loading your billing data.{' '}
            <Button
              variant="subtle"
              size="mini"
              onClick={() =>
                fetchResult.mutate(undefined, { revalidate: true })
              }
            >
              Refresh.
            </Button>
          </div>
        </ErrorMessage>
      </div>
    );
  }

  const org = fetchedDash.data.workspace as OrgWorkspace;
  const isPaid = org.org.paid;
  const isFreeTier = data['subscription-name'] === 'Free';
  const totalAppBytes = data['total-app-bytes'] || 0;
  const totalStorageBytes = data['total-storage-bytes'] || 0;
  const totalUsageBytes = totalAppBytes + totalStorageBytes;
  const credit = data['customer-balance'] || 0;
  // Only paid orgs have a storage allowance to meter against, so free orgs show
  // the raw usage with no bar.
  const limitBytes = isPaid ? GB_250 : null;

  return (
    <div className="flex flex-col gap-6 pt-6">
      <div className="rounded-sm border bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
        <UsageMeter
          label="Usage (all apps)"
          usedBytes={totalUsageBytes}
          limitBytes={limitBytes}
          dbBytes={totalAppBytes}
          storageBytes={totalStorageBytes}
        />
      </div>

      <div className="flex flex-col gap-3">
        <BillingHeader
          title="Plan"
          description={
            isFreeTier
              ? 'Upgrade to Startup for more storage and team features across every app.'
              : 'Manage your subscription and payment details.'
          }
        />
        {isFreeTier ? (
          <div className="flex flex-col gap-2">
            <Button variant="primary" onClick={onUpgrade}>
              Upgrade to Startup
            </Button>
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              Startup includes 250 GB of storage across all apps, multiple team
              members, and priority support.
            </p>
          </div>
        ) : (
          <Button variant="primary" onClick={onManageBilling}>
            Manage Startup subscription
          </Button>
        )}
      </div>

      {credit < 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Credit</span>
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            You have a {formatCredit(credit)} credit that will be applied to
            your next invoice.
          </p>
        </div>
      ) : null}
    </div>
  );
};
