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
import { Button, cn, Content, SectionHeading } from '@/components/ui';
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
  const progressDen = isFreeTier ? GB_1 : GB_250;
  const progress = Math.round((totalUsageBytes / progressDen) * 100);

  return (
    <div className="pt-2">
      <div className="flex flex-col bg-white gap px-2 pt-1 rounded border">
        <div className="flex gap-2 items-end p-2 justify-between">
          <span className="font-bold">Usage (all apps)</span>{' '}
          <span className="font-mono text-sm">
            {friendlyUsage(totalUsageBytes)}{' '}
            {isPaid && <span>/ {friendlyUsage(progressDen)}</span>}
          </span>
        </div>
        {isPaid && <ProgressBar width={progress} />}
        <div
          className={cn('flex justify-start text-sm space-x-2 pl-2', 'pt-3')}
        >
          <span className="text-sm font-mono text-gray-500">
            DB ({friendlyUsage(totalAppBytes)})
          </span>

          <span className="text-sm font-mono pb-3 text-gray-500">
            Storage ({friendlyUsage(totalStorageBytes)})
          </span>
        </div>
      </div>
      <SectionHeading className="pt-8">Billing</SectionHeading>
      {isFreeTier ? (
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={onUpgrade}>
            Upgrade to Startup
          </Button>
          <div className="italic text-sm w-full bg-purple-100 text-purple-800 rounded border border-purple-400 px-2 py-1">
            Startup offer 250GB of storage across all apps, multiple team
            members for apps, and priority support.
          </div>
        </div>
      ) : (
        <Button variant="primary" onClick={onManageBilling}>
          Manage Startup subscription
        </Button>
      )}
    </div>
  );
};
