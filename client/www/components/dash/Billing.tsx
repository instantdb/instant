import { SectionHeading, Button, Content } from '@/components/ui';
import { messageFromInstantError, useAuthedFetch } from '@/lib/auth';
import config, { stripeKey } from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch } from '@/lib/fetch';
import {
  AppsSubscriptionResponse,
  InstantError,
  SubscriptionName,
} from '@/lib/types';
import { loadStripe } from '@stripe/stripe-js';
import { useContext, useRef } from 'react';
import { Loading, ErrorMessage } from '@/components/dash/shared';
import { errorToast } from '@/lib/toast';
import clsx from 'clsx';
import confetti from 'canvas-confetti';

const stripePromise = loadStripe(stripeKey);
const GB_1 = 1024 * 1024 * 1024;
const GB_10 = 10 * GB_1;

function roundToDecimal(num: number, decimalPlaces: number) {
  const factor = Math.pow(10, decimalPlaces);
  return Math.round(num * factor) / factor;
}

function friendlyUsage(usage: number) {
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
    }
  );
  Promise.all([stripePromise, sessionPromise])
    .then(([stripe, session]) => {
      if (!stripe || !session) {
        throw new Error('Failed to create checkout session');
      }
      stripe.redirectToCheckout({ sessionId: session.id });
    })
    .catch((err) => {
      const message =
        messageFromInstantError(err as InstantError) ||
        'Failed to connect w/ Stripe! Try again or ping us on Discord if this persists.';
      errorToast(message);
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
    }
  );
  Promise.all([stripePromise, sessionPromise])
    .then(([stripe, session]) => {
      if (!stripe || !session) {
        throw new Error('Failed to create portal session');
      }
      window.open(session.url, '_blank');
    })
    .catch((err) => {
      const message =
        messageFromInstantError(err as InstantError) ||
        'Failed to connect w/ Stripe! Try again or ping us on Discord if this persists.';
      errorToast(message);
      console.error(err);
    });
}

function ProgressBar({ width }: { width: number }) {
  return (
    <div className="h-1.5 relative overflow-hidden rounded-full bg-neutral-200">
      <div
        style={{ width: `${width}%` }}
        className="absolute top-0 left-0 h-full bg-indigo-500"
      />
    </div>
  );
}

export default function Billing({ appId }: { appId: string }) {
  const token = useContext(TokenContext);
  const confettiRef = useRef<HTMLDivElement>(null);

  const onUpgrade = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => {
    e.preventDefault();
    createCheckoutSession(appId, token);
  };

  const onManage = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => {
    e.preventDefault();
    createPortalSession(appId, token);
  };

  const authResponse = useAuthedFetch<AppsSubscriptionResponse>(
    `${config.apiURI}/dash/apps/${appId}/billing`
  );

  if (authResponse.isLoading) {
    return <Loading />;
  }

  const data = authResponse.data;

  if (!data) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-2">
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
  const progress = Math.round((totalUsageBytes / progressDen) * 100);

  return (
    <div className="flex flex-col p-4 gap-4 max-w-md">
      <SectionHeading>Billing</SectionHeading>
      <div className="flex items-center gap-2">
        <h1 className="font-bold">Current plan</h1>
        {isFreeTier ? (
          <div className="font-mono font-bold rounded border px-2 py-1">
            {subscriptionName}
          </div>
        ) : (
          <div style={{ animation: 'wiggle 5s infinite' }}>
            <div
              ref={confettiRef}
              className="font-mono font-bold rounded border px-2 py-1 transition-all active:scale-90 translate-y-0 hover:-translate-y-1 border-purple-400 text-purple-800 bg-purple-100 select-none cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();

                const originX = (rect.x + 0.5 * rect.width) / window.innerWidth;
                const originY =
                  (rect.y + 0.5 * rect.height) / window.innerHeight;

                confetti({
                  angle: randomInRange(55, 125),
                  spread: randomInRange(50, 70),
                  particleCount: randomInRange(50, 100),
                  origin: { x: originX, y: originY },
                });
              }}
            >
              {subscriptionName} <span>🎉</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap px-2 pt-1 pb-3 rounded border">
        <h2 className="flex gap-2 p-2 justify-between">
          <span className="font-bold">Usage</span>{' '}
          <span className="font-mono text-sm">
            {friendlyUsage(totalUsageBytes)} / {friendlyUsage(progressDen)}
          </span>
        </h2>
        <ProgressBar width={progress} />
      </div>
      {isFreeTier ? (
        <div className="flex flex-col space-y-4">
          <Button variant="primary" onClick={onUpgrade}>
            Upgrade to Pro
          </Button>
          <Content className="italic text-sm bg-purple-100 text-purple-800 rounded border border-purple-400 px-2 py-1">
            Pro offers 10GB of storage, backups, multiple team members for apps,
            and priority support.
          </Content>
        </div>
      ) : (
        <Button variant="primary" onClick={onManage}>
          Manage Pro subscription
        </Button>
      )}
    </div>
  );
}

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
