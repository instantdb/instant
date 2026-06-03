import React, {
  Fragment,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/solid';

import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { useAuthedFetch } from '@/lib/auth';
import { jsonMutate } from '@/lib/fetch';
import { messageFromInstantError } from '@/lib/errors';
import { errorToast, successToast } from '@/lib/toast';
import useLocalStorage from '@/lib/hooks/useLocalStorage';
import {
  InstantApp,
  InstantWebhook,
  InstantWebhookAction,
  InstantWebhookAttempt,
  InstantWebhookEvent,
  InstantWebhookEventStatus,
  InstantWebhookEventsPage,
  InstantWebhookPayload,
  InstantWebhookPayloadRecord,
  SchemaNamespace,
} from '@/lib/types';
import { Button, Content, SectionHeading } from '@/components/ui';
import { useReadyRouter } from '@/components/clientOnlyPage';
import {
  ALL_ACTIONS,
  CopyableText,
  WebhookActionsMenu,
} from '@/components/dash/Webhooks';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/components/ui/tabs';
import { Card, CardContent } from '@/components/components/ui/card';

// ---- Data ----

function useWebhookEvents(app: InstantApp, webhook: InstantWebhook) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [byIsn, setByIsn] = useState<Map<string, InstantWebhookEvent>>(
    () => new Map(),
  );

  useEffect(() => {
    setCursor(null);
    setByIsn(new Map());
  }, [webhook.id]);

  const url = `${config.apiURI}/dash/apps/${app.id}/webhooks/${webhook.id}/events${cursor ? `?after=${encodeURIComponent(cursor)}` : ''}`;
  const { data, isLoading, isValidating, error, mutate } =
    useAuthedFetch<InstantWebhookEventsPage>(url);

  useEffect(() => {
    if (data?.events) {
      setByIsn((prev) => {
        const next = new Map(prev);
        for (const e of data.events) next.set(e.isn, e);
        return next;
      });
    }
  }, [data]);

  const events = useMemo(
    () =>
      [...byIsn.values()].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    [byIsn],
  );

  return {
    events,
    isLoading,
    isValidating,
    error,
    hasNext: !!data?.pageInfo?.hasNextPage,
    endCursor: data?.pageInfo?.endCursor ?? null,
    loadMore: (next: string) => setCursor(next),
    refresh: () => mutate(),
  };
}

function useWebhookEvent(
  app: InstantApp,
  webhook: InstantWebhook,
  isn: string | null,
) {
  const url = isn
    ? `${config.apiURI}/dash/apps/${app.id}/webhooks/${webhook.id}/events/${isn}`
    : '';
  const { data, isLoading, error, mutate } = useAuthedFetch<{
    event: InstantWebhookEvent;
  }>(url);
  const event = data?.event ?? null;

  const inFlight =
    event?.status === 'pending' || event?.status === 'processing';

  // Poll while the event is still pending/processing. Backoff so we react fast
  // right after a transition but ease off if it stays in-flight for a while.
  useEffect(() => {
    if (!inFlight) return;
    const intervalsMs = [1000, 3000, 5000, 10000, 15000, 30000, 60000];
    let cancelled = false;
    let i = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const delay = intervalsMs[Math.min(i, intervalsMs.length - 1)];
      timeoutId = setTimeout(async () => {
        if (cancelled) return;
        try {
          await mutate();
        } catch {
          // ignore — keep polling
        }
        if (cancelled) return;
        i++;
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [inFlight, mutate]);

  return {
    event,
    isLoading,
    error,
    refresh: () => mutate(),
  };
}

function usePayload(
  app: InstantApp,
  webhook: InstantWebhook,
  isn: string | null,
) {
  const url = isn
    ? `${config.apiURI}/webhooks/payload/${app.id}/${webhook.id}/${isn}`
    : '';
  return useAuthedFetch<InstantWebhookPayload>(url);
}

// ---- Atoms ----

const STATUS_BADGE_CLASS: Record<InstantWebhookEventStatus, string> = {
  pending:
    'bg-gray-100 text-gray-700 dark:bg-neutral-700 dark:text-neutral-200',
  processing:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  success:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  error: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const ACTION_BADGE_CLASS: Record<InstantWebhookAction, string> = {
  create:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  update: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  delete: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function StatusBadge({ status }: { status: InstantWebhookEventStatus }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[status] ?? STATUS_BADGE_CLASS.pending}`}
    >
      {status}
    </span>
  );
}

function ActionBadge({ action }: { action: InstantWebhookAction }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${ACTION_BADGE_CLASS[action] ?? ''}`}
    >
      {action}
    </span>
  );
}

function formatTimestamp(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function DetailGrid({
  rows,
  size = 'sm',
}: {
  rows: { label: string; value: React.ReactNode }[];
  size?: 'sm' | 'xs';
}) {
  return (
    <dl
      className={`grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 ${size === 'xs' ? 'text-xs' : 'text-sm'}`}
    >
      {rows.map(({ label, value }) => (
        <React.Fragment key={label}>
          <dt className="font-semibold text-gray-700 dark:text-neutral-200">
            {label}
          </dt>
          <dd className="text-gray-800 dark:text-neutral-100">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function CodeBlock({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'error';
}) {
  return (
    <pre
      className={`overflow-x-auto rounded-xs p-2 font-mono text-xs ${
        tone === 'error'
          ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'
          : 'bg-gray-50 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300'
      }`}
    >
      {children}
    </pre>
  );
}

function EntityBlock({
  label,
  entity,
}: {
  label: string;
  entity: Record<string, unknown> | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-gray-700 dark:text-neutral-200">
        {label}
      </span>
      {entity == null ? (
        <span className="text-sm text-gray-400 italic dark:text-neutral-500">
          null
        </span>
      ) : (
        <CodeBlock>{JSON.stringify(entity, null, 2)}</CodeBlock>
      )}
    </div>
  );
}

// ---- Request row ----

function AttemptDetails({ attempt }: { attempt: InstantWebhookAttempt }) {
  const at = attempt['attempt-at'];
  const ms = attempt['duration-ms'];
  const code = attempt['status-code'];
  const success = attempt['success?'];
  const errType = attempt['error-type'];
  const errMsg = attempt['error-message'];
  const respText = attempt['response-text'];

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'Sent at', value: at ? formatTimestamp(at) : '—' },
    {
      label: 'Status',
      value:
        success == null ? (
          '—'
        ) : success ? (
          <span className="text-green-700 dark:text-green-300">Success</span>
        ) : (
          <span className="text-red-700 dark:text-red-300">Failure</span>
        ),
    },
    { label: 'Status code', value: code != null ? code : '—' },
    { label: 'Duration', value: ms != null ? `${ms} ms` : '—' },
  ];
  if (errType) rows.push({ label: 'Error type', value: errType });

  return (
    <div className="flex flex-col gap-3">
      <DetailGrid rows={rows} />
      {errMsg ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-gray-700 dark:text-neutral-200">
            Error message
          </span>
          <CodeBlock tone="error">{errMsg}</CodeBlock>
        </div>
      ) : null}
      {respText ? (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-gray-700 dark:text-neutral-200">
            Response body
          </span>
          <CodeBlock>{respText}</CodeBlock>
        </div>
      ) : null}
    </div>
  );
}

function AttemptOneLiner({ attempt }: { attempt: InstantWebhookAttempt }) {
  const at = attempt['attempt-at'];
  const ms = attempt['duration-ms'];
  const code = attempt['status-code'];
  const success = attempt['success?'];
  const errType = attempt['error-type'];

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-gray-500 dark:text-neutral-500">
        {at ? formatTimestamp(at) : 'pending'}
      </span>
      {code != null ? (
        <span
          className={
            success
              ? 'text-green-700 dark:text-green-300'
              : 'text-red-700 dark:text-red-300'
          }
        >
          HTTP {code}
        </span>
      ) : null}
      {ms != null ? (
        <span className="text-gray-500 dark:text-neutral-500">{ms} ms</span>
      ) : null}
      {errType ? (
        <span className="text-red-700 dark:text-red-300">{errType}</span>
      ) : null}
    </div>
  );
}

function AttemptRow({ attempt }: { attempt: InstantWebhookAttempt }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="flex flex-col gap-2">
      <button
        className="flex cursor-pointer items-center gap-3 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <ChevronRightIcon
          height={10}
          className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <AttemptOneLiner attempt={attempt} />
      </button>
      {open ? (
        <div id={panelId} className="pl-5">
          <AttemptDetails attempt={attempt} />
        </div>
      ) : null}
    </div>
  );
}

// ---- Payload ----

function RecordRow({ record }: { record: InstantWebhookPayloadRecord }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="flex flex-col gap-2">
      <button
        className="flex cursor-pointer items-center gap-2 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <ChevronRightIcon
          height={10}
          className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm font-medium text-gray-700 dark:bg-neutral-700 dark:text-neutral-200">
          {record.namespace}
        </span>
        <ActionBadge action={record.action} />
        <span className="font-mono text-sm break-all text-gray-500 dark:text-neutral-500">
          {record.id}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="flex flex-col gap-1 pl-5 text-sm">
          <div>
            <span className="font-semibold">namespace</span>:{' '}
            <span className="font-mono">{record.namespace}</span>
          </div>
          <div>
            <span className="font-semibold">id</span>:{' '}
            <span className="font-mono break-all">{record.id}</span>
          </div>
          <div>
            <span className="font-semibold">action</span>:{' '}
            <span className="font-mono">{record.action}</span>
          </div>
          <div>
            <span className="font-semibold">idempotencyKey</span>:{' '}
            <span className="font-mono break-all">{record.idempotencyKey}</span>
          </div>
          {record.action !== 'create' ? (
            <EntityBlock label="before" entity={record.before} />
          ) : null}
          {record.action !== 'delete' ? (
            <EntityBlock label="after" entity={record.after} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EventPayload({
  app,
  webhook,
  isn,
}: {
  app: InstantApp;
  webhook: InstantWebhook;
  isn: string | null;
}) {
  const { data, isLoading, error } = usePayload(app, webhook, isn);
  const records = data?.data ?? [];
  const [tab, setTab] = useLocalStorage<'formatted' | 'raw'>(
    'webhook-payload-view',
    'formatted',
  );

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as 'formatted' | 'raw')}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-3">
        <h4 className="text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-neutral-400">
          Payload
        </h4>
        {data ? (
          <TabsList className="h-6 p-0.5">
            <TabsTrigger
              value="formatted"
              className="h-5 cursor-pointer px-2 py-0 text-xs"
            >
              Formatted
            </TabsTrigger>
            <TabsTrigger
              value="raw"
              className="h-5 cursor-pointer px-2 py-0 text-xs"
            >
              Raw
            </TabsTrigger>
          </TabsList>
        ) : null}
      </div>
      {isLoading && !data ? (
        <Content className="text-sm text-gray-500 dark:text-neutral-500">
          Loading…
        </Content>
      ) : error ? (
        <Content className="text-sm text-red-700 dark:text-red-300">
          Failed to load payload.
        </Content>
      ) : !data ? null : (
        <>
          <TabsContent value="formatted" className="mt-0">
            {records.length === 0 ? (
              <Content className="text-sm text-gray-500 dark:text-neutral-500">
                No records.
              </Content>
            ) : (
              <div className="flex flex-col gap-2">
                {records.map((r) => (
                  <RecordRow
                    key={`${r.namespace}:${r.id}:${r.action}`}
                    record={r}
                  />
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="raw" className="mt-0">
            <CodeBlock>{JSON.stringify(data, null, 2)}</CodeBlock>
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}

// ---- Event row ----

function EventRow({ event }: { event: InstantWebhookEvent }) {
  const router = useReadyRouter();
  return (
    <Link
      href={eventDetailHref(router, event.isn)}
      className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-neutral-800/50"
    >
      <StatusBadge status={event.status} />
      <span className="text-sm text-gray-700 dark:text-neutral-200">
        {formatTimestamp(event.created_at)}
      </span>
      <span className="ml-auto font-mono text-xs text-gray-500 dark:text-neutral-500">
        {event.isn}
      </span>
    </Link>
  );
}

function EventDetail({
  app,
  webhook,
  event,
  onResent,
}: {
  app: InstantApp;
  webhook: InstantWebhook;
  event: InstantWebhookEvent;
  onResent: () => void;
}) {
  const token = useContext(TokenContext);
  const [isResending, setIsResending] = useState(false);
  const attempts = useMemo(() => {
    const arr = (event.attempts ?? []).map((event, i) => {
      return {
        ...event,
        key: i,
        sortKey: new Date(event['attempt-at'] ?? new Date()).getTime(),
      };
    });

    arr.sort((a, b) => b.sortKey - a.sortKey);
    return arr;
  }, [event.attempts]);

  const ageMs = Date.now() - new Date(event.created_at).getTime();
  const tooOldToResend = ageMs > 30 * 24 * 60 * 60 * 1000;

  const handleResend = async () => {
    setIsResending(true);
    try {
      await jsonMutate(
        `${config.apiURI}/dash/apps/${app.id}/webhooks/${webhook.id}/events/${event.isn}`,
        { token, body: {} },
      );
      successToast('Event resent');
      onResent();
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(
          e as Parameters<typeof messageFromInstantError>[0],
        ) || 'Error resending event.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-neutral-400">
              Details
            </h4>
            <Button
              variant="secondary"
              size="mini"
              loading={isResending}
              disabled={tooOldToResend}
              title={
                tooOldToResend
                  ? "Events older than 30 days can't be resent"
                  : undefined
              }
              onClick={handleResend}
            >
              Resend
            </Button>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <div>
              <span className="font-semibold">status</span>: {event.status}
              {event.status === 'failed' ? (
                <span className="ml-2 text-gray-500 italic dark:text-neutral-500">
                  (exceeded max attempts, will not be retried)
                </span>
              ) : null}
            </div>
            <div>
              <span className="font-semibold">id</span>:{' '}
              <span className="font-mono break-all">{event.isn}</span>
            </div>
            <div>
              <span className="font-semibold">created</span>:{' '}
              {formatTimestamp(event.created_at)}
            </div>
            {event.next_attempt_after ? (
              <div>
                <span className="font-semibold">next attempt</span>:{' '}
                {formatTimestamp(event.next_attempt_after)}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <h4 className="text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-neutral-400">
            Requests
          </h4>
          {attempts.length === 0 ? (
            <Content className="text-sm text-gray-500 dark:text-neutral-500">
              No requests yet.
            </Content>
          ) : (
            <div className="flex flex-col gap-2">
              {attempts.map((a) => (
                <AttemptRow key={a.key} attempt={a} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <EventPayload app={app} webhook={webhook} isn={event.isn} />
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Page ----

function webhooksHref(router: ReturnType<typeof useReadyRouter>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(router.query)) {
    if (k === 'webhook' || k === 'event' || v == null) continue;
    if (Array.isArray(v)) params.set(k, v[0] ?? '');
    else params.set(k, v);
  }
  return `${router.pathname}?${params.toString()}`;
}

function eventsListHref(router: ReturnType<typeof useReadyRouter>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(router.query)) {
    if (k === 'event' || v == null) continue;
    if (Array.isArray(v)) params.set(k, v[0] ?? '');
    else params.set(k, v);
  }
  return `${router.pathname}?${params.toString()}`;
}

function eventDetailHref(
  router: ReturnType<typeof useReadyRouter>,
  isn: string,
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(router.query)) {
    if (k === 'event' || v == null) continue;
    if (Array.isArray(v)) params.set(k, v[0] ?? '');
    else params.set(k, v);
  }
  params.set('event', isn);
  return `${router.pathname}?${params.toString()}`;
}

export function WebhookEventsPage({
  app,
  webhook,
  namespaces,
  onChanged,
}: {
  app: InstantApp;
  webhook: InstantWebhook;
  namespaces: SchemaNamespace[] | null;
  onChanged: () => void;
}) {
  const router = useReadyRouter();
  const focusedIsn =
    typeof router.query.event === 'string' ? router.query.event : null;

  if (focusedIsn) {
    return (
      <FocusedEventPage
        app={app}
        webhook={webhook}
        isn={focusedIsn}
        router={router}
      />
    );
  }

  return (
    <EventsListPage
      app={app}
      webhook={webhook}
      namespaces={namespaces}
      onChanged={onChanged}
      router={router}
    />
  );
}

function FocusedEventPage({
  app,
  webhook,
  isn,
  router,
}: {
  app: InstantApp;
  webhook: InstantWebhook;
  isn: string;
  router: ReturnType<typeof useReadyRouter>;
}) {
  const { event, isLoading, error, refresh } = useWebhookEvent(
    app,
    webhook,
    isn,
  );
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div className="flex flex-row items-center gap-1">
        <Link href={webhooksHref(router)} className="underline">
          <SectionHeading>Webhooks</SectionHeading>
        </Link>
        <SectionHeading>/</SectionHeading>{' '}
        <Link href={eventsListHref(router)} className="underline">
          <SectionHeading>Events</SectionHeading>
        </Link>
        <SectionHeading>/</SectionHeading>{' '}
        <SectionHeading className="font-mono">{isn}</SectionHeading>
      </div>
      {event ? (
        <EventDetail
          app={app}
          webhook={webhook}
          event={event}
          onResent={refresh}
        />
      ) : (
        <Card>
          <CardContent className="p-4 text-sm text-gray-500 dark:text-neutral-500">
            {error
              ? 'Event not found.'
              : isLoading
                ? 'Loading…'
                : 'Event not found.'}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EventsListPage({
  app,
  webhook,
  namespaces,
  onChanged,
  router,
}: {
  app: InstantApp;
  webhook: InstantWebhook;
  namespaces: SchemaNamespace[] | null;
  onChanged: () => void;
  router: ReturnType<typeof useReadyRouter>;
}) {
  const {
    events,
    isLoading,
    isValidating,
    error,
    hasNext,
    endCursor,
    loadMore,
  } = useWebhookEvents(app, webhook);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div className="flex flex-row items-center justify-between gap-2">
        <div className="flex flex-row items-center gap-1">
          <Link href={webhooksHref(router)} className="underline">
            <SectionHeading>Webhooks</SectionHeading>
          </Link>
          <SectionHeading>/</SectionHeading>{' '}
          <SectionHeading>Events</SectionHeading>
        </div>
        <WebhookActionsMenu
          app={app}
          namespaces={namespaces}
          webhook={webhook}
          onChanged={onChanged}
        />
      </div>

      <h4 className="text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-neutral-400">
        Details
      </h4>

      <Card>
        <CardContent className="p-4">
          <DetailGrid
            rows={[
              {
                label: 'ID',
                value: (
                  <CopyableText
                    value={webhook.id}
                    className="font-mono text-xs break-all"
                  />
                ),
              },
              {
                label: 'URL',
                value: (
                  <CopyableText
                    value={webhook.sink.url}
                    className="font-mono text-xs break-all"
                  />
                ),
              },
              {
                label: 'Status',
                value:
                  webhook.status === 'active' ? (
                    <span className="font-mono text-xs text-green-700 dark:text-green-300">
                      Active
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-red-700 dark:text-red-300">
                      Disabled
                    </span>
                  ),
              },
              {
                label: 'Namespaces',
                value:
                  (webhook.namespaces ?? []).length === 0 ? (
                    <span className="text-gray-400 dark:text-neutral-500">
                      (none)
                    </span>
                  ) : (
                    <span className="font-mono text-xs">
                      {[...(webhook.namespaces ?? [])]
                        .sort()
                        .map((e, i, arr) => (
                          <Fragment key={e}>
                            <span className="whitespace-nowrap">{e}</span>
                            {i < arr.length - 1 ? ', ' : ''}
                          </Fragment>
                        ))}
                    </span>
                  ),
              },
              {
                label: 'Actions',
                value: (
                  <span className="font-mono text-xs">
                    {ALL_ACTIONS.filter((a) =>
                      webhook.actions.includes(a),
                    ).join(', ')}
                  </span>
                ),
              },
              {
                label: 'Created at',
                value: (
                  <span className="font-mono text-xs">
                    {formatTimestamp(webhook.created_at)}
                  </span>
                ),
              },
              ...(webhook.disabled_reason
                ? [
                    {
                      label: 'Disabled reason',
                      value: (
                        <span className="text-red-700 dark:text-red-300">
                          {webhook.disabled_reason}
                        </span>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </CardContent>
      </Card>

      <h4 className="text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-neutral-400">
        Events
      </h4>

      {isLoading && events.length === 0 ? (
        <Content className="text-sm text-gray-500 dark:text-neutral-500">
          Loading…
        </Content>
      ) : error ? (
        <Content className="text-sm text-red-700 dark:text-red-300">
          Failed to load events.
        </Content>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-gray-500 dark:text-neutral-500">
            No events in the last 60 days.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y divide-gray-200 dark:divide-neutral-700">
            {events.map((e) => (
              <EventRow key={e.isn} event={e} />
            ))}
          </div>
        </Card>
      )}

      {hasNext && endCursor ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="mini"
            loading={isValidating}
            disabled={isValidating}
            onClick={() => loadMore(endCursor)}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
