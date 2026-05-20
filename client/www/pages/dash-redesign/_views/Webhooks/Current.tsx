import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { init } from '@instantdb/react';

import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch } from '@/lib/fetch';
import { messageFromInstantError } from '@/lib/errors';
import { successToast, errorToast } from '@/lib/toast';
import {
  InstantApp,
  InstantIssue,
  InstantWebhook,
  InstantWebhookAction,
  SchemaNamespace,
} from '@/lib/types';
import {
  Button,
  Checkbox,
  Content,
  Dialog,
  Label,
  SubsectionHeading,
  TextInput,
  useDialog,
} from '@/components/ui';
import { useSchemaQuery } from '@/lib/hooks/explorer';
import { useReadyRouter } from '@/components/clientOnlyPage';
import { Webhooks } from '@/components/dash/Webhooks';

import { DashNotice, DashShell } from '../_shared';
import { useEphemeralApp } from '../_ephemeral';
import { WebhooksSubState } from './index';

const ALL_ACTIONS: InstantWebhookAction[] = ['create', 'update', 'delete'];

// ---- API ----

type CreateBody = {
  url: string;
  namespaces: string[];
  actions: InstantWebhookAction[];
};

const headers = (token: string) => ({
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
});

function createWebhook(token: string, appId: string, body: CreateBody) {
  return jsonFetch(`${config.apiURI}/dash/apps/${appId}/webhooks`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
  }) as Promise<{ webhook: InstantWebhook }>;
}

function updateWebhook(
  token: string,
  appId: string,
  webhookId: string,
  body: Partial<CreateBody>,
) {
  return jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/webhooks/${webhookId}`,
    {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify(body),
    },
  ) as Promise<{ webhook: InstantWebhook }>;
}

function deleteWebhook(token: string, appId: string, webhookId: string) {
  return jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/webhooks/${webhookId}`,
    { method: 'DELETE', headers: headers(token) },
  ) as Promise<{ webhook: InstantWebhook }>;
}

function fetchWebhooks(
  token: string,
  appId: string,
): Promise<{ webhooks: InstantWebhook[] }> {
  return jsonFetch(`${config.apiURI}/dash/apps/${appId}/webhooks`, {
    method: 'GET',
    headers: headers(token),
  }) as Promise<{ webhooks: InstantWebhook[] }>;
}

function disableWebhook(
  token: string,
  appId: string,
  webhookId: string,
  reason: string | null,
) {
  return jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/webhooks/${webhookId}/disable`,
    {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify(reason ? { reason } : {}),
    },
  ) as Promise<{ webhook: InstantWebhook }>;
}

function reportError(e: unknown, fallback: string) {
  console.error(e);
  const msg = messageFromInstantError(e as InstantIssue) || fallback;
  errorToast(msg, { autoClose: 5000 });
}

// ---- Form + dialogs (copied so we can open them programmatically) ----

function WebhookForm({
  namespaces,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  isLoading,
}: {
  namespaces: SchemaNamespace[] | null;
  initial?: {
    url: string;
    namespaces: string[];
    actions: InstantWebhookAction[];
  };
  submitLabel: string;
  onSubmit: (body: CreateBody) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [url, setUrl] = useState(initial?.url ?? '');
  const [selectedNamespaces, setSelectedNamespaces] = useState<Set<string>>(
    () => new Set(initial?.namespaces ?? []),
  );
  const [actions, setActions] = useState<Set<InstantWebhookAction>>(
    () => new Set(initial?.actions ?? ['create']),
  );

  const namespaceNames = useMemo(
    () => (namespaces ?? []).map((n) => n.name).sort(),
    [namespaces],
  );

  const allOptions = useMemo(() => {
    const set = new Set<string>(namespaceNames);
    for (const e of initial?.namespaces ?? []) set.add(e);
    return [...set].sort();
  }, [namespaceNames, initial?.namespaces]);

  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      url: url.trim(),
      namespaces: [...selectedNamespaces],
      actions: [...actions],
    });
  };

  return (
    <form onSubmit={handle} className="flex flex-col gap-5">
      <div>
        <SubsectionHeading>Webhook endpoint</SubsectionHeading>
        <Content className="mt-1 text-sm">
          Deliver events to one public HTTPS endpoint.
        </Content>
      </div>
      <div className="flex flex-col gap-1">
        <Label>Endpoint URL</Label>
        <TextInput
          autoFocus
          size="large"
          value={url}
          onChange={setUrl}
          placeholder="https://example.com/api/instant-webhook"
        />
        <Content className="text-xs text-gray-500 dark:text-neutral-500">
          Must be an https URL. Localhost is not allowed.
        </Content>
      </div>
      <div className="flex flex-col gap-1">
        <Label>Namespaces</Label>
        {allOptions.length === 0 ? (
          <Content className="text-sm">
            No namespaces yet. Create one in the Explorer first.
          </Content>
        ) : (
          <div className="grid max-h-44 grid-cols-1 gap-2 overflow-y-auto rounded-md border border-gray-200 bg-[#fbfaf8] p-3 sm:grid-cols-2 dark:border-neutral-700 dark:bg-neutral-800/50">
            {allOptions.map((ns) => (
              <Checkbox
                key={ns}
                checked={selectedNamespaces.has(ns)}
                onChange={() => setSelectedNamespaces((s) => toggle(s, ns))}
                label={ns}
              />
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <Label>Actions</Label>
        <div className="flex flex-wrap gap-3 rounded-md border border-gray-200 bg-[#fbfaf8] p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
          {ALL_ACTIONS.map((a) => (
            <Checkbox
              key={a}
              checked={actions.has(a)}
              onChange={() => setActions((s) => toggle(s, a))}
              label={a}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-row justify-end gap-2 border-t border-gray-200 pt-4 dark:border-neutral-800">
        <Button
          type="submit"
          loading={isLoading}
          variant="primary"
          size="large"
        >
          {submitLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="large"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function CreateDialog({
  app,
  namespaces,
  dialog,
  onCreated,
}: {
  app: InstantApp;
  namespaces: SchemaNamespace[] | null;
  dialog: ReturnType<typeof useDialog>;
  onCreated: () => void;
}) {
  const token = useContext(TokenContext)!;
  const [isLoading, setIsLoading] = useState(false);

  const handle = async (body: CreateBody) => {
    setIsLoading(true);
    try {
      const { webhook } = await createWebhook(token, app.id, body);
      dialog.onClose();
      successToast(`Webhook created for ${webhook.sink.url}`);
      onCreated();
    } catch (e) {
      reportError(e, 'Error creating webhook.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog title="New webhook" {...dialog}>
      <WebhookForm
        namespaces={namespaces}
        submitLabel="Create"
        onSubmit={handle}
        onCancel={dialog.onClose}
        isLoading={isLoading}
      />
    </Dialog>
  );
}

function EditDialog({
  app,
  namespaces,
  webhook,
  dialog,
  onUpdated,
}: {
  app: InstantApp;
  namespaces: SchemaNamespace[] | null;
  webhook: InstantWebhook;
  dialog: ReturnType<typeof useDialog>;
  onUpdated: () => void;
}) {
  const token = useContext(TokenContext)!;
  const [isLoading, setIsLoading] = useState(false);

  const handle = async (body: CreateBody) => {
    setIsLoading(true);
    try {
      await updateWebhook(token, app.id, webhook.id, body);
      dialog.onClose();
      onUpdated();
    } catch (e) {
      reportError(e, 'Error updating webhook.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog title="Edit webhook" {...dialog}>
      <WebhookForm
        namespaces={namespaces}
        initial={{
          url: webhook.sink.url,
          namespaces: webhook.namespaces ?? [],
          actions: webhook.actions,
        }}
        submitLabel="Save"
        onSubmit={handle}
        onCancel={dialog.onClose}
        isLoading={isLoading}
      />
    </Dialog>
  );
}

function DisableDialog({
  app,
  webhook,
  dialog,
  onDisabled,
}: {
  app: InstantApp;
  webhook: InstantWebhook;
  dialog: ReturnType<typeof useDialog>;
  onDisabled: () => void;
}) {
  const token = useContext(TokenContext)!;
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handle = async () => {
    setIsLoading(true);
    try {
      await disableWebhook(token, app.id, webhook.id, reason.trim() || null);
      dialog.onClose();
      onDisabled();
    } catch (e) {
      reportError(e, 'Error disabling webhook.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog title="Disable webhook" {...dialog}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handle();
        }}
        className="flex flex-col gap-4"
      >
        <SubsectionHeading>Disable webhook</SubsectionHeading>
        <DashNotice tone="warning">
          Disabled webhooks won't deliver events. You can re-enable it at any
          time.
        </DashNotice>
        <div className="flex flex-col gap-1">
          <Label>Reason (optional)</Label>
          <TextInput
            autoFocus
            size="large"
            value={reason}
            onChange={setReason}
          />
        </div>
        <div className="flex flex-row justify-end gap-2 border-t border-gray-200 pt-4 dark:border-neutral-800">
          <Button
            type="submit"
            loading={isLoading}
            variant="destructive"
            size="large"
          >
            Disable
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="large"
            onClick={dialog.onClose}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({
  app,
  webhook,
  dialog,
  onDeleted,
}: {
  app: InstantApp;
  webhook: InstantWebhook;
  dialog: ReturnType<typeof useDialog>;
  onDeleted: () => void;
}) {
  const token = useContext(TokenContext)!;
  const [isLoading, setIsLoading] = useState(false);

  const handle = async () => {
    setIsLoading(true);
    try {
      await deleteWebhook(token, app.id, webhook.id);
      dialog.onClose();
      onDeleted();
    } catch (e) {
      reportError(e, 'Error deleting webhook.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog title="Delete webhook" {...dialog}>
      <div className="flex flex-col gap-3">
        <SubsectionHeading className="font-mono text-base break-all">
          {webhook.sink.url}
        </SubsectionHeading>
        <DashNotice tone="danger">
          Deleting a webhook is permanent. Any pending events for this webhook
          will be discarded.
        </DashNotice>
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-neutral-800">
          <Button
            loading={isLoading}
            variant="destructive"
            size="large"
            onClick={handle}
          >
            Delete
          </Button>
          <Button variant="secondary" size="large" onClick={dialog.onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---- Seeding ----

async function seedWebhooks(token: string, appId: string) {
  await createWebhook(token, appId, {
    url: 'https://example.com/todo-events',
    namespaces: ['todos'],
    actions: ['create', 'update', 'delete'],
  });
  const toDisable = await createWebhook(token, appId, {
    url: 'https://example.com/legacy-webhook',
    namespaces: ['todos'],
    actions: ['create'],
  });
  await disableWebhook(token, appId, toDisable.webhook.id, 'Seeded for demo');
}

function asInstantApp(id: string, adminToken: string): InstantApp {
  return {
    id,
    title: 'Dash Redesign Sandbox',
    admin_token: adminToken,
    pro: false,
    created_at: new Date().toISOString(),
    rules: null,
    rules_version: null,
    user_app_role: 'owner',
    members: null,
    invites: null,
    magic_code_email_template: null,
    magic_code_expiry_minutes: null,
    org: null,
    webhooks: [],
  };
}

function useWebhooksForApp(appId: string | null) {
  const token = useContext(TokenContext);
  const [webhooks, setWebhooks] = useState<InstantWebhook[] | null>(null);
  const [tick, setTick] = useState(0);
  const refetch = () => setTick((t) => t + 1);

  useEffect(() => {
    if (!appId || !token) return;
    let cancelled = false;
    fetchWebhooks(token, appId)
      .then((res) => {
        if (cancelled) return;
        setWebhooks(res.webhooks ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('[dash-redesign] fetchWebhooks failed', e);
        setWebhooks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [appId, token, tick]);

  // Poll so external mutations (the imported Webhooks's own dialog buttons
  // call useFetchedDash().refetch() which is a no-op for our sandbox app)
  // eventually show up here.
  useEffect(() => {
    if (!appId) return;
    const id = setInterval(refetch, 5000);
    return () => clearInterval(id);
  }, [appId]);

  return { webhooks, refetch };
}

// ---- Inner view ----

function WebhooksWithData({
  app,
  sub,
  namespaces,
  onChanged,
}: {
  app: InstantApp;
  sub: WebhooksSubState;
  namespaces: SchemaNamespace[] | null;
  onChanged: () => void;
}) {
  const router = useReadyRouter();
  const refresh = onChanged;

  const webhooks = useMemo(
    () =>
      [...(app.webhooks ?? [])].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    [app.webhooks],
  );

  const firstWebhook = webhooks[0];
  const firstActive = webhooks.find((w) => w.status === 'active');

  // Drive ?webhook=<id> for the events sub-state; clear it otherwise.
  const targetWebhookId = sub === 'events' ? (firstActive?.id ?? null) : null;
  useEffect(() => {
    const current =
      typeof router.query.webhook === 'string' ? router.query.webhook : null;
    if (targetWebhookId === current) return;
    const nextQuery = { ...router.query };
    if (targetWebhookId) {
      nextQuery.webhook = targetWebhookId;
    } else {
      delete nextQuery.webhook;
    }
    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, {
      shallow: true,
    });
  }, [targetWebhookId, router.query.webhook]);

  // App data shaped per sub-state.
  const renderedApp: InstantApp = useMemo(() => {
    switch (sub) {
      case 'empty':
        return { ...app, webhooks: [] };
      case 'list':
        return {
          ...app,
          webhooks: webhooks.filter((w) => w.status === 'active'),
        };
      default:
        return { ...app, webhooks };
    }
  }, [app, webhooks, sub]);

  const createDialog = useDialog();
  const editDialog = useDialog();
  const disableDialog = useDialog();
  const deleteDialog = useDialog();

  // Open the right dialog when the sub-state matches.
  useEffect(() => {
    createDialog.open && createDialog.onClose();
    editDialog.open && editDialog.onClose();
    disableDialog.open && disableDialog.onClose();
    deleteDialog.open && deleteDialog.onClose();
    if (sub === 'create') createDialog.onOpen();
    if (sub === 'edit' && firstWebhook) editDialog.onOpen();
    if (sub === 'disable' && firstActive) disableDialog.onOpen();
    if (sub === 'delete' && firstWebhook) deleteDialog.onOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, firstWebhook?.id, firstActive?.id]);

  return (
    <>
      <Webhooks app={renderedApp} namespaces={namespaces} />

      <CreateDialog
        app={app}
        namespaces={namespaces}
        dialog={createDialog}
        onCreated={refresh}
      />
      {firstWebhook && (
        <EditDialog
          key={`edit-${firstWebhook.id}`}
          app={app}
          namespaces={namespaces}
          webhook={firstWebhook}
          dialog={editDialog}
          onUpdated={refresh}
        />
      )}
      {firstActive && (
        <DisableDialog
          key={`disable-${firstActive.id}`}
          app={app}
          webhook={firstActive}
          dialog={disableDialog}
          onDisabled={refresh}
        />
      )}
      {firstWebhook && (
        <DeleteDialog
          key={`delete-${firstWebhook.id}`}
          app={app}
          webhook={firstWebhook}
          dialog={deleteDialog}
          onDeleted={refresh}
        />
      )}
    </>
  );
}

// ---- Outer view: sandbox app + schema + seeding ----

function WebhooksOnSandbox({
  ephemeralId,
  ephemeralAdminToken,
  sub,
}: {
  ephemeralId: string;
  ephemeralAdminToken: string;
  sub: WebhooksSubState;
}) {
  // The ephemeral sandbox isn't owned by the user, so the user's dash token
  // gets a 403 from the webhook routes. The server's superadmin auth also
  // accepts the app's admin token as a Bearer — so we override TokenContext
  // here. Everything inside (useWebhooksForApp, our dialogs, and the imported
  // Webhooks component's internal API calls) will pick that up.
  return (
    <TokenContext.Provider value={ephemeralAdminToken}>
      <WebhooksOnSandboxInner
        ephemeralId={ephemeralId}
        ephemeralAdminToken={ephemeralAdminToken}
        sub={sub}
      />
    </TokenContext.Provider>
  );
}

function WebhooksOnSandboxInner({
  ephemeralId,
  ephemeralAdminToken,
  sub,
}: {
  ephemeralId: string;
  ephemeralAdminToken: string;
  sub: WebhooksSubState;
}) {
  const token = useContext(TokenContext);
  const baseApp = useMemo(
    () => asInstantApp(ephemeralId, ephemeralAdminToken),
    [ephemeralId, ephemeralAdminToken],
  );

  const { webhooks, refetch } = useWebhooksForApp(ephemeralId);
  const seededRef = useRef(false);
  const [seedAttempted, setSeedAttempted] = useState(false);

  // Seed two webhooks (one active, one disabled) on first load.
  useEffect(() => {
    if (seededRef.current) return;
    if (!token) return;
    if (webhooks === null) return; // initial fetch still pending
    if (webhooks.length > 0) {
      seededRef.current = true;
      setSeedAttempted(true);
      return;
    }
    seededRef.current = true;
    seedWebhooks(token, ephemeralId)
      .catch((e) => console.error('[dash-redesign] seed webhooks failed', e))
      .finally(() => {
        refetch();
        setSeedAttempted(true);
      });
  }, [webhooks, token, ephemeralId, refetch]);

  const [db, setDb] = useState<ReturnType<typeof init> | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const next = init({
      appId: ephemeralId,
      apiURI: config.apiURI,
      websocketURI: config.websocketURI,
      // @ts-expect-error - dashboard uses admin token under the hood
      __adminToken: ephemeralAdminToken,
      disableValidation: true,
    });
    setDb(next);
    return () => {
      next.core.shutdown();
      setDb(null);
    };
  }, [ephemeralId, ephemeralAdminToken]);

  if (!db || webhooks === null || !seedAttempted) {
    return (
      <DashShell active="webhooks" app={baseApp}>
        <div className="p-4 text-sm text-gray-500">
          {webhooks === null
            ? 'Loading webhooks…'
            : !seedAttempted
              ? 'Seeding sandbox webhooks…'
              : 'Connecting…'}
        </div>
      </DashShell>
    );
  }

  const appWithWebhooks: InstantApp = { ...baseApp, webhooks };

  return (
    <WebhooksWithSchema
      sandboxApp={appWithWebhooks}
      sub={sub}
      db={db}
      onChanged={refetch}
    />
  );
}

function WebhooksWithSchema({
  sandboxApp,
  sub,
  db,
  onChanged,
}: {
  sandboxApp: InstantApp;
  sub: WebhooksSubState;
  db: ReturnType<typeof init>;
  onChanged: () => void;
}) {
  const { namespaces } = useSchemaQuery(db);
  return (
    <DashShell active="webhooks" app={sandboxApp}>
      <WebhooksWithData
        app={sandboxApp}
        sub={sub}
        namespaces={namespaces}
        onChanged={onChanged}
      />
    </DashShell>
  );
}

export function Current({ sub }: { sub: WebhooksSubState }) {
  const ephemeral = useEphemeralApp();

  if (ephemeral.status === 'loading') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-sm text-gray-600 dark:text-neutral-400">
        Provisioning sandbox app…
      </div>
    );
  }

  if (ephemeral.status === 'error') {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-4 text-center text-sm">
        <div className="text-red-700 dark:text-red-400">
          Failed to provision sandbox: {ephemeral.error.message}
        </div>
      </div>
    );
  }

  return (
    <WebhooksOnSandbox
      ephemeralId={ephemeral.app.id}
      ephemeralAdminToken={ephemeral.app.adminToken}
      sub={sub}
    />
  );
}
