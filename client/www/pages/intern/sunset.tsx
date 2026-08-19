import Head from 'next/head';
import { useCallback, useEffect, useRef, useState } from 'react';
import { init } from '@instantdb/react';
import { v4 } from 'uuid';

import config from '@/lib/config';
import { useAuthToken } from '@/lib/auth';
import { jsonFetch, jsonMutate } from '@/lib/fetch';
import { errorToast, successToast } from '@/lib/toast';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import useLocalStorage from '@/lib/hooks/useLocalStorage';
import { SunsetStage } from '@/lib/types';

type SunsetState = {
  stage: SunsetStage;
  'app-creation-allowed': boolean;
  env: string;
};

const steps: {
  stage: SunsetStage;
  title: string;
  when: string;
  description: string;
}[] = [
  {
    stage: 'none',
    title: 'Normal operation',
    when: 'today',
    description: 'Apps behave normally; only their own status applies.',
  },
  {
    stage: 'signups-closed',
    title: 'Close sign-ups',
    when: 'month 0 (announcement day)',
    description:
      'New account sign-ups are rejected (magic code and Google). Existing users sign in as usual, apps are untouched, and dashboard and CLI app creation closes except for allowlisted users. Platform SDK creation keeps working.',
  },
  {
    stage: 'read-only',
    title: 'Pause all writes',
    when: 'month 12',
    description:
      'Every app becomes read-only. Reads and presence keep working. Platform SDK app creation also stops, and the dashboard only shows the backups page.',
  },
  {
    stage: 'disabled',
    title: 'Disable all apps',
    when: 'month 13',
    description:
      'Reads and writes stop. The dashboard only shows the backups page.',
  },
];

const stepIndex = (stage: SunsetStage) =>
  steps.findIndex((s) => s.stage === stage);

function fetchSunsetState(token: string | undefined): Promise<SunsetState> {
  return jsonFetch(`${config.apiURI}/dash/sunset`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
}

function Checklist({
  token,
  state,
  onSaved,
}: {
  token: string;
  state: SunsetState;
  onSaved: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const isDev = state.env === 'dev';
  const current = stepIndex(state.stage);
  const next = current < steps.length - 1 ? steps[current + 1] : null;
  const confirmed = isDev || confirmText === next?.stage;

  async function setStage(stage: SunsetStage) {
    setSaving(true);
    try {
      await jsonMutate(`${config.apiURI}/dash/sunset`, {
        method: 'POST',
        token,
        body: { stage },
      });
      successToast(`Stage set to ${stage}. Propagates within seconds.`);
      setConfirming(false);
      setConfirmText('');
      onSaved();
    } catch (e: any) {
      errorToast(`Failed: ${e?.body?.message ?? e?.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col rounded border border-gray-300 bg-white">
      {steps.map((step, i) => {
        const isDone = i < current;
        const isCurrent = i === current;
        const isNext = i === current + 1;
        return (
          <div
            key={step.stage}
            className={`flex items-start gap-3 border-b border-gray-100 p-4 last:border-b-0 ${
              isCurrent || isNext ? '' : 'opacity-50'
            }`}
          >
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                isDone
                  ? 'bg-green-100 text-green-700'
                  : isCurrent
                    ? 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-500'
              }`}
            >
              {isDone ? '✓' : i + 1}
            </span>
            <div className="flex min-w-0 grow flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{step.title}</span>
                <span className="text-xs text-gray-400">{step.when}</span>
                {isCurrent && (
                  <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs font-medium text-white">
                    we are here
                  </span>
                )}
              </div>
              <span className="text-sm text-gray-600">{step.description}</span>
              {isCurrent && i > 0 && !confirming && (
                <button
                  disabled={saving}
                  onClick={() => setStage(steps[i - 1].stage)}
                  className="self-start text-xs text-gray-500 underline"
                >
                  {saving ? 'saving…' : `step back to “${steps[i - 1].title}”`}
                </button>
              )}
              {isNext && !confirming && (
                <button
                  disabled={saving}
                  onClick={() => {
                    setConfirming(true);
                    setConfirmText('');
                  }}
                  className="mt-1 self-start rounded bg-gray-800 px-3 py-1 text-sm font-medium text-white"
                >
                  {step.title} →
                </button>
              )}
              {isNext && confirming && (
                <div className="mt-1 flex flex-col gap-2 rounded border border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm">
                    This affects <strong>every app on Instant</strong> within
                    seconds.{' '}
                    {isDev ? (
                      <span className="text-gray-600">(dev: just click)</span>
                    ) : (
                      <>
                        Type <code className="font-bold">{step.stage}</code> to
                        confirm.
                      </>
                    )}
                  </p>
                  {!isDev && (
                    <input
                      className="rounded border border-gray-300 px-2 py-1 text-sm"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder={step.stage}
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      disabled={!confirmed || saving}
                      onClick={() => setStage(step.stage)}
                      className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Confirm'}
                    </button>
                    <button
                      disabled={saving}
                      onClick={() => setConfirming(false)}
                      className="rounded border border-gray-300 px-3 py-1 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ----------
// Test playground

type TestApp = { id: string; title: string };

function TestAppCard({
  app,
  token,
  onRemove,
}: {
  app: TestApp;
  token: string;
  onRemove: () => void;
}) {
  const [db] = useState(() =>
    init({
      appId: app.id,
      apiURI: config.apiURI,
      websocketURI: config.websocketURI,
    }),
  );
  const appStatus = db.useAppStatus();
  const connection = db.useConnectionStatus();
  const { data, error } = db.useQuery({ sunset_docs: {} });
  const [rawStatus, setRawStatus] = useState<string | undefined>(undefined);
  const [writeResult, setWriteResult] = useState<string>('');

  // The public API collapses `disabled` into isReadOnly; peek at the raw
  // status like the app-status sandbox page does.
  useEffect(() => {
    const reactor = (db as any).core._reactor;
    const update = () => setRawStatus(reactor._appStatusState?.status);
    update();
    return reactor.subscribeAppStatus?.(update);
  }, [db]);

  async function addDoc() {
    try {
      await db.transact(
        db.tx.sunset_docs[v4()].update({ createdAt: Date.now() }),
      );
      setWriteResult('write ok');
    } catch (e: any) {
      setWriteResult(`write rejected: ${e?.message}`);
    }
  }

  async function deleteApp() {
    try {
      await jsonMutate(`${config.apiURI}/dash/apps/${app.id}`, {
        method: 'DELETE',
        token,
      });
      successToast(`Deleted ${app.title}`);
      onRemove();
    } catch (e: any) {
      errorToast(`Failed to delete: ${e?.body?.message ?? e?.message}`);
    }
  }

  const docCount = data?.sunset_docs?.length;

  return (
    <div className="flex flex-col gap-1 rounded border border-gray-300 bg-white p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{app.title}</span>
        <div className="flex gap-2">
          <button
            onClick={deleteApp}
            className="text-xs text-red-600 underline"
          >
            delete app
          </button>
          <button onClick={onRemove} className="text-xs underline">
            remove card
          </button>
        </div>
      </div>
      <span className="font-mono text-xs text-gray-500">{app.id}</span>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>
          connection: <strong>{connection}</strong>
        </span>
        <span>
          status:{' '}
          <strong>
            {appStatus.isLoading
              ? 'loading…'
              : (rawStatus ?? (appStatus.isReadOnly ? 'read-only' : 'active'))}
          </strong>
        </span>
        <span>
          reads:{' '}
          <strong>
            {error ? `error: ${error.message}` : `${docCount ?? '…'} docs`}
          </strong>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={addDoc}
          className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50"
        >
          Add doc
        </button>
        <span className="text-xs text-gray-600">{writeResult}</span>
      </div>
    </div>
  );
}

function TestPlayground({
  token,
  state,
}: {
  token: string;
  state: SunsetState;
}) {
  // Test apps are regular apps owned by you (ephemeral apps expire, these
  // don't), tracked in localStorage so they survive the whole wind-down.
  const [testApps, setTestApps] = useLocalStorage<TestApp[]>(
    'intern-sunset-test-apps',
    [],
  );
  const [creating, setCreating] = useState(false);
  const creationBlocked = !state['app-creation-allowed'];

  async function createTestApp() {
    setCreating(true);
    const title = `Sunset Test ${new Date().toISOString().slice(11, 19)}`;
    try {
      const res = await jsonMutate<{ app: { id: string } }>(
        `${config.apiURI}/dash/apps`,
        {
          method: 'POST',
          token,
          body: { id: v4(), title, admin_token: v4() },
        },
      );
      setTestApps([...testApps, { id: res.app.id, title }]);
      successToast(`Created ${title}`);
    } catch (e: any) {
      errorToast(`Failed to create: ${e?.body?.message ?? e?.message}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 pt-2">
      <p className="text-sm text-gray-600">
        These are regular apps owned by you, so they never expire. This button
        works during &ldquo;signups-closed&rdquo; only while your email is on
        the app-creation allowlist. Each card keeps a live connection; walk the
        steps and watch writes get rejected and reads error in real time.
      </p>
      <div>
        <button
          disabled={creating}
          onClick={createTestApp}
          className="rounded border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {creating
            ? 'Creating…'
            : creationBlocked
              ? 'Create test app (will be rejected)'
              : 'Create test app'}
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {testApps.map((app) => (
          <TestAppCard
            key={app.id}
            app={app}
            token={token}
            onRemove={() =>
              setTestApps(testApps.filter((a) => a.id !== app.id))
            }
          />
        ))}
      </div>
    </div>
  );
}

// ----------
// Billing

type BillingState = {
  'stripe-mode': 'test' | 'live' | 'missing' | 'unknown';
  'active-count': number;
  'already-scheduled-count': number;
  'remaining-count': number;
  'remaining-monthly-revenue': number;
};

function formatMonthlyRevenue(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function BillingCard({ token, state }: { token: string; state: SunsetState }) {
  const [billing, setBilling] = useState<BillingState | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [running, setRunning] = useState(false);
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await jsonFetch(`${config.apiURI}/dash/sunset/billing`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
      });
      setBilling(data);
      setError(undefined);
    } catch (e: any) {
      setError(e?.body?.message ?? e?.message ?? 'Failed to load');
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The cancellations run in a background job on the server; poll for a
  // bit so the card reflects the drain.
  const pollAfterRun = useCallback(() => {
    let remaining = 15;
    const tick = async () => {
      await refresh();
      remaining -= 1;
      if (remaining > 0) {
        pollTimeout.current = setTimeout(tick, 2000);
      }
    };
    if (pollTimeout.current) clearTimeout(pollTimeout.current);
    pollTimeout.current = setTimeout(tick, 1000);
  }, [refresh]);

  useEffect(
    () => () => {
      if (pollTimeout.current) clearTimeout(pollTimeout.current);
    },
    [],
  );

  async function cancelAll() {
    setRunning(true);
    try {
      const res = await jsonMutate<{ 'scheduling-count': number }>(
        `${config.apiURI}/dash/sunset/cancel_subscriptions`,
        {
          method: 'POST',
          token,
        },
      );
      successToast(
        `Scheduling ${res['scheduling-count']} subscription cancellations.`,
      );
      setConfirming(false);
      setConfirmText('');
      pollAfterRun();
    } catch (e: any) {
      errorToast(`Failed: ${e?.body?.message ?? e?.message}`);
    } finally {
      setRunning(false);
    }
  }

  const confirmed = confirmText === 'cancel-subscriptions';

  return (
    <div className="flex flex-col gap-3 rounded border border-gray-300 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="font-semibold">Stripe subscriptions</span>
        {billing && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              billing['stripe-mode'] === 'test'
                ? 'bg-green-100 text-green-700'
                : billing['stripe-mode'] === 'live'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-gray-100 text-gray-500'
            }`}
          >
            {billing['stripe-mode']} mode
          </span>
        )}
        <button onClick={refresh} className="text-xs text-gray-500 underline">
          refresh
        </button>
      </div>
      <div className="flex flex-col gap-2 text-sm text-gray-600">
        <p>
          Announcement day, after closing sign-ups: schedule every active Stripe
          subscription to end at the close of its billing period.
        </p>
        <p>
          This only <em>updates</em> each subscription: it sets Stripe&apos;s
          cancel-at-period-end flag. Nothing is canceled immediately, nothing is
          deleted, and no invoices or refunds are generated. Until a period
          actually ends, the flag can be flipped back from the Stripe dashboard.
        </p>
        <p>
          Re-running is safe: subscriptions already scheduled to cancel are
          skipped.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!billing && !error && (
        <p className="text-sm text-gray-500">
          Listing Stripe subscriptions… (this pages through every active
          subscription, so it can take a while)
        </p>
      )}
      {billing && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>
            active: <strong>{billing['active-count']}</strong>
          </span>
          <span>
            scheduled to cancel:{' '}
            <strong>{billing['already-scheduled-count']}</strong>
          </span>
          <span>
            remaining: <strong>{billing['remaining-count']}</strong>
          </span>
          <span>
            remaining MRR:{' '}
            <strong>
              {formatMonthlyRevenue(billing['remaining-monthly-revenue'])}
            </strong>
          </span>
        </div>
      )}
      {state.stage === 'none' && (
        <p className="text-sm text-amber-700">
          Tip: close sign-ups first. That same stage makes paid features free
          for everyone, so nobody loses team access while their subscription
          winds down.
        </p>
      )}
      {!confirming && (
        <button
          disabled={running || !billing || billing['remaining-count'] === 0}
          onClick={() => {
            setConfirming(true);
            setConfirmText('');
          }}
          className="self-start rounded bg-gray-800 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
        >
          Cancel all subscriptions →
        </button>
      )}
      {confirming && (
        <div className="flex flex-col gap-2 rounded border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm">
            This schedules <strong>every active subscription</strong> to end at
            the close of its billing period. Type{' '}
            <code className="font-bold">cancel-subscriptions</code> to confirm.
            (Prod only: in dev the server refuses, so it doesn&apos;t sweep the
            shared test-mode account.)
          </p>
          <input
            className="rounded border border-gray-300 px-2 py-1 text-sm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="cancel-subscriptions"
          />
          <div className="flex gap-2">
            <button
              disabled={!confirmed || running}
              onClick={cancelAll}
              className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
            >
              {running ? 'Scheduling…' : 'Confirm'}
            </button>
            <button
              disabled={running}
              onClick={() => setConfirming(false)}
              className="rounded border border-gray-300 px-3 py-1 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SunsetDashboard() {
  const token = useAuthToken() ?? undefined;
  const [state, setState] = useState<SunsetState | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchSunsetState(token);
      setState(data);
      setError(undefined);
    } catch (e: any) {
      setError(e?.body?.message ?? e?.message ?? 'Failed to load');
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // After a save, poll for a bit so the page reflects the flag once it
  // propagates back through the reactive subscription.
  const pollAfterSave = useCallback(() => {
    let remaining = 8;
    const tick = async () => {
      await refresh();
      remaining -= 1;
      if (remaining > 0) {
        pollTimeout.current = setTimeout(tick, 1000);
      }
    };
    if (pollTimeout.current) clearTimeout(pollTimeout.current);
    pollTimeout.current = setTimeout(tick, 800);
  }, [refresh]);

  useEffect(
    () => () => {
      if (pollTimeout.current) clearTimeout(pollTimeout.current);
    },
    [],
  );

  if (error) {
    return (
      <div className="p-4 text-sm text-red-600">
        {error} (are you on the team email list?)
      </div>
    );
  }
  if (!token) {
    return (
      <div className="p-4 text-sm text-gray-500">
        Sign in on the dashboard first.
      </div>
    );
  }
  if (!state) {
    return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-bold">Sunset</h1>
        <p className="text-sm text-gray-600">
          One step at a time. Changes propagate to every server within seconds,
          and every step is reversible.
        </p>
      </div>
      <Checklist token={token} state={state} onSaved={pollAfterSave} />
      <BillingCard token={token} state={state} />
      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          Test playground
        </summary>
        <TestPlayground token={token} state={state} />
      </details>
    </div>
  );
}

export default function Page() {
  const isHydrated = useIsHydrated();
  if (!isHydrated) return null;
  return (
    <div className="min-h-screen bg-gray-100">
      <Head>
        <title>Instant Intern - Sunset</title>
      </Head>
      <SunsetDashboard />
    </div>
  );
}
