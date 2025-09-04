import config, { stripeKey } from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch } from '@/lib/fetch';
import { useContext, useEffect, useState } from 'react';
import { friendlyErrorMessage, useAuthedFetch } from '@/lib/auth';
import { v4 } from 'uuid';
import { loadStripe } from '@stripe/stripe-js';
import { messageFromInstantError } from '@/lib/errors';
import { InstantIssue } from '@instantdb/core';
import { errorToast } from '@/lib/toast';
import { Button } from '@/components/ui';
import {
  MainDashLayout,
  useFetchedDash,
} from '@/components/dash/MainDashLayout';
import { NextPageWithLayout } from '../_app';
import { ClientOnly } from '@/components/clientOnlyPage';

function createOrg(token: string, params: { title: string }) {
  return jsonFetch(`${config.apiURI}/dash/orgs`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(params),
  });
}

function deleteOrg(token: string, params: { id: string }) {
  return jsonFetch(`${config.apiURI}/dash/orgs/${params.id}`, {
    method: 'DELETE',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
}

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

async function rename(
  { orgId, title }: { orgId: string; title: string },
  token: string,
) {
  await jsonFetch(`${config.apiURI}/dash/orgs/${orgId}/rename`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title: title }),
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

function OrgDetails({ id }: { id: string }) {
  const token = useContext(TokenContext);
  const resp = useAuthedFetch(`${config.apiURI}/dash/orgs/${id}`);
  const billingResp = useAuthedFetch(
    `${config.apiURI}/dash/orgs/${id}/billing`,
  );

  if (resp.isLoading || billingResp.isLoading) {
    return <div>Loading...</div>;
  }

  if (resp.error || !resp.data || billingResp.error || !billingResp.data) {
    return (
      <div>
        Error:{' '}
        <pre>{JSON.stringify(resp.error || billingResp.error, null, 2)}</pre>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div>Data</div>
      <pre className="text-sm">{JSON.stringify(resp.data, null, 2)}</pre>
      <div>Billing Data</div>
      <pre className="text-sm">{JSON.stringify(billingResp.data, null, 2)}</pre>
      <Button
        variant="subtle"
        onClick={async () => {
          createCheckoutSession(id, token);
        }}
      >
        Setup Billing
      </Button>

      <Button
        variant="subtle"
        onClick={async () => {
          createPortalSession(id, token);
        }}
      >
        Manage Billing
      </Button>
      <Button
        variant="subtle"
        onClick={async () => {
          const title = prompt('What should we call it?');
          if (title) {
            await rename({ orgId: id, title }, token);
            resp.mutate();
          }
        }}
      >
        Rename
      </Button>
    </div>
  );
}

const OrgsPage: NextPageWithLayout = ({}: {}) => {
  const token = useContext(TokenContext);

  const dashResponse = useFetchedDash();

  const [expandedOrgs, setExpandedOrgs] = useState<string[]>(
    orgId && typeof orgId === 'string' ? [orgId] : [],
  );

  console.log('orgId', orgId);

  useEffect(() => {
    if (orgId && typeof orgId === 'string') {
      setExpandedOrgs((ids) => (ids.includes(orgId) ? ids : [...ids, orgId]));
    }
  }, [orgId]);

  const orgs = dashResponse.data.orgs;

  console.log(expandedOrgs);

  return (
    <div className="flex-1 flex flex-col p-4 max-w-2xl mx-auto overflow-scroll">
      <div>
        {(orgs || []).map((org) => {
          const expanded = expandedOrgs.includes(org.id);
          return (
            <div key={org.id}>
              <Button
                variant="subtle"
                onClick={() => {
                  if (expanded) {
                    setExpandedOrgs(expandedOrgs.filter((x) => x !== org.id));
                  } else {
                    setExpandedOrgs([...expandedOrgs, org.id]);
                  }
                }}
              >
                {org.title}
              </Button>
              <Button
                variant="subtle"
                onClick={async () => {
                  try {
                    await deleteOrg(token, { id: org.id });

                    dashResponse.mutate();
                  } catch (e) {
                    console.log('Error deleting org', e);
                    alert((e as Error).message || (e as any).body?.message);
                  }
                }}
              >
                Delete
              </Button>
              {expanded ? <OrgDetails id={org.id} /> : null}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between flex-row items-center">
        <Button
          onClick={async () => {
            const title = prompt('Give your org a name');
            try {
              if (!title) {
                throw new Error('Missing title.');
              }
              await createOrg(token, { title: title });
              dashResponse.mutate();
            } catch (e) {
              console.error('Error creating org', e);
              alert((e as Error).message || (e as any).body?.message);
            }
          }}
        >
          Create new org
        </Button>
      </div>
    </div>
  );
};

OrgsPage.getLayout = (page) => {
  return (
    <ClientOnly>
      <MainDashLayout>{page}</MainDashLayout>
    </ClientOnly>
  );
};

export default OrgsPage;
