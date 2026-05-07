import { FormEventHandler, useContext, useMemo, useState } from 'react';
import {
  EllipsisVerticalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import { ListBulletIcon, NoSymbolIcon } from '@heroicons/react/24/outline';

import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch } from '@/lib/fetch';
import { messageFromInstantError } from '@/lib/errors';
import { errorToast, successToast } from '@/lib/toast';
import { useReadyRouter } from '@/components/clientOnlyPage';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
  SectionHeading,
  SubsectionHeading,
  TextInput,
  useDialog,
} from '@/components/ui';
import { useFetchedDash } from '@/components/dash/MainDashLayout';
import { WebhookEventsPage } from '@/components/dash/WebhookEvents';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/components/ui/item';

const ALL_ACTIONS: InstantWebhookAction[] = ['create', 'update', 'delete'];

// ---- API ----

type CreateBody = {
  url: string;
  etypes: string[];
  actions: InstantWebhookAction[];
};

type UpdateBody = Partial<CreateBody>;

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
  body: UpdateBody,
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

function enableWebhook(token: string, appId: string, webhookId: string) {
  return jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/webhooks/${webhookId}/enable`,
    { method: 'POST', headers: headers(token), body: '{}' },
  ) as Promise<{ webhook: InstantWebhook }>;
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

// ---- UI ----

function reportError(e: unknown, fallback: string) {
  console.error(e);
  const msg = messageFromInstantError(e as InstantIssue) || fallback;
  errorToast(msg, { autoClose: 5000 });
}

function WebhookForm({
  heading,
  namespaces,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  isLoading,
}: {
  heading: string;
  namespaces: SchemaNamespace[] | null;
  initial?: { url: string; etypes: string[]; actions: InstantWebhookAction[] };
  submitLabel: string;
  onSubmit: (body: CreateBody) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [url, setUrl] = useState(initial?.url ?? '');
  const [etypes, setEtypes] = useState<Set<string>>(
    () => new Set(initial?.etypes ?? []),
  );
  const [actions, setActions] = useState<Set<InstantWebhookAction>>(
    () => new Set(initial?.actions ?? ['create']),
  );

  const namespaceNames = useMemo(
    () => (namespaces ?? []).map((n) => n.name).sort(),
    [namespaces],
  );

  // Show any etype the webhook already references even if it's no longer in
  // the schema (renamed/deleted), so the user can deselect it intentionally.
  const allOptions = useMemo(() => {
    const set = new Set<string>(namespaceNames);
    for (const e of initial?.etypes ?? []) set.add(e);
    return [...set].sort();
  }, [namespaceNames, initial?.etypes]);

  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const handle: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!url.trim()) {
      errorToast('URL is required.', { autoClose: 5000 });
      return;
    }
    if (etypes.size === 0) {
      errorToast('Select at least one entity.', { autoClose: 5000 });
      return;
    }
    if (actions.size === 0) {
      errorToast('Select at least one action.', { autoClose: 5000 });
      return;
    }
    await onSubmit({
      url: url.trim(),
      etypes: [...etypes],
      actions: [...actions],
    });
  };

  return (
    <form onSubmit={handle} className="flex flex-col gap-4">
      <SubsectionHeading>{heading}</SubsectionHeading>
      <div className="flex flex-col gap-1">
        <Label>Endpoint URL</Label>
        <TextInput
          autoFocus
          value={url}
          onChange={setUrl}
          placeholder="https://example.com/api/instant-webhook"
        />
        <Content className="text-xs text-gray-500 dark:text-neutral-500">
          Must be an https URL. Localhost is not allowed.
        </Content>
      </div>

      <div className="flex flex-col gap-1">
        <Label>Entities</Label>
        {allOptions.length === 0 ? (
          <Content className="text-xs text-gray-500 dark:text-neutral-500">
            Define entities in your schema to enable webhooks.
          </Content>
        ) : (
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-sm border bg-gray-50 p-2 dark:border-neutral-700 dark:bg-neutral-800/50">
            {allOptions.map((n) => (
              <Checkbox
                key={n}
                checked={etypes.has(n)}
                onChange={() => setEtypes((s) => toggle(s, n))}
                label={n}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Label>Actions</Label>
        <div className="flex gap-3">
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

      <div className="flex flex-row gap-2">
        <Button loading={isLoading} variant="primary" type="submit">
          {submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
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
  const token = useContext(TokenContext);
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
        heading="New webhook"
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
  const token = useContext(TokenContext);
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
        heading="Edit webhook"
        namespaces={namespaces}
        initial={{
          url: webhook.sink.url,
          etypes: webhook.etypes ?? [],
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
  const token = useContext(TokenContext);
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
        <Content>
          Disabled webhooks won't deliver events. You can re-enable it at any
          time.
        </Content>
        <div className="flex flex-col gap-1">
          <Label>Reason (optional)</Label>
          <TextInput autoFocus value={reason} onChange={setReason} />
        </div>
        <div className="flex flex-row gap-2">
          <Button type="submit" loading={isLoading} variant="destructive">
            Disable
          </Button>
          <Button type="button" variant="secondary" onClick={dialog.onClose}>
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
  const token = useContext(TokenContext);
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
        <SubsectionHeading>{webhook.sink.url}</SubsectionHeading>
        <Content>
          Deleting a webhook is permanent. Any pending events for this webhook
          will be discarded.
        </Content>
        <div className="flex gap-2">
          <Button loading={isLoading} variant="destructive" onClick={handle}>
            Delete
          </Button>
          <Button variant="secondary" onClick={dialog.onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function eventsHref(
  router: ReturnType<typeof useReadyRouter>,
  webhookId: string,
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(router.query)) {
    if (v == null) continue;
    if (Array.isArray(v)) params.set(k, v[0] ?? '');
    else params.set(k, v);
  }
  params.set('webhook', webhookId);
  return `${router.pathname}?${params.toString()}`;
}

function WebhookRow({
  app,
  namespaces,
  webhook,
  onChanged,
}: {
  app: InstantApp;
  namespaces: SchemaNamespace[] | null;
  webhook: InstantWebhook;
  onChanged: () => void;
}) {
  const token = useContext(TokenContext);
  const router = useReadyRouter();
  const editDialog = useDialog();
  const disableDialog = useDialog();
  const deleteDialog = useDialog();
  const [isToggling, setIsToggling] = useState(false);

  const handleEnable = async () => {
    setIsToggling(true);
    try {
      await enableWebhook(token, app.id, webhook.id);
      onChanged();
    } catch (e) {
      reportError(e, 'Error enabling webhook.');
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <Item variant="outline" className="bg-white dark:bg-neutral-900">
      <ItemContent>
        <ItemTitle className="truncate font-mono">{webhook.sink.url}</ItemTitle>
        {webhook.disabled_reason ? (
          <ItemDescription className="text-red-700 dark:text-red-300">
            {webhook.disabled_reason}
          </ItemDescription>
        ) : null}
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-gray-500 dark:text-neutral-500">Entities</dt>
          <dd className="font-mono">
            {(webhook.etypes ?? []).length === 0
              ? '(none)'
              : (webhook.etypes ?? []).join(', ')}
          </dd>
          <dt className="text-gray-500 dark:text-neutral-500">Actions</dt>
          <dd>{webhook.actions.join(', ')}</dd>
        </dl>
      </ItemContent>
      <ItemActions>
        <Button
          variant="secondary"
          size="mini"
          onClick={() => router.push(eventsHref(router, webhook.id))}
        >
          <ListBulletIcon width={14} /> Events
        </Button>
        {webhook.status === 'disabled' ? (
          <Button
            variant="secondary"
            size="mini"
            loading={isToggling}
            onClick={handleEnable}
          >
            Enable
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button
              className="cursor-pointer rounded p-1 hover:bg-gray-200 dark:hover:bg-neutral-700"
              title="More"
            >
              <EllipsisVerticalIcon height={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-fit min-w-0">
            <DropdownMenuItem className="group cursor-pointer">
              <button
                className="flex cursor-pointer items-center gap-2"
                onClick={editDialog.onOpen}
              >
                <PencilIcon width={14} />
                Edit
              </button>
            </DropdownMenuItem>
            {webhook.status === 'active' ? (
              <DropdownMenuItem className="group cursor-pointer">
                <button
                  className="flex cursor-pointer items-center gap-2"
                  onClick={disableDialog.onOpen}
                >
                  <NoSymbolIcon width={14} />
                  Disable
                </button>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem className="group cursor-pointer">
              <button
                className="flex cursor-pointer items-center gap-2 text-red-500"
                onClick={deleteDialog.onOpen}
              >
                <TrashIcon width={14} />
                Delete
              </button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>

      <EditDialog
        app={app}
        namespaces={namespaces}
        webhook={webhook}
        dialog={editDialog}
        onUpdated={onChanged}
      />
      <DisableDialog
        app={app}
        webhook={webhook}
        dialog={disableDialog}
        onDisabled={onChanged}
      />
      <DeleteDialog
        app={app}
        webhook={webhook}
        dialog={deleteDialog}
        onDeleted={onChanged}
      />
    </Item>
  );
}

export function Webhooks({
  app,
  namespaces,
}: {
  app: InstantApp;
  namespaces: SchemaNamespace[] | null;
}) {
  const dash = useFetchedDash();
  const router = useReadyRouter();
  const createDialog = useDialog();

  const refresh = () => {
    dash.refetch();
  };

  const webhooks = useMemo(
    () =>
      [...(app.webhooks ?? [])].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    [app.webhooks],
  );

  const focusedWebhookId =
    typeof router.query.webhook === 'string' ? router.query.webhook : null;
  const focusedWebhook = focusedWebhookId
    ? webhooks.find((w) => w.id === focusedWebhookId)
    : undefined;

  if (focusedWebhook) {
    return <WebhookEventsPage app={app} webhook={focusedWebhook} />;
  }

  const activeWebhooks = webhooks.filter((w) => w.status === 'active');
  const disabledWebhooks = webhooks.filter((w) => w.status === 'disabled');

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <SectionHeading>Webhooks</SectionHeading>
          <Content className="text-sm text-gray-500 dark:text-neutral-500">
            Receive HTTP callbacks when entities are created, updated, or
            deleted.
          </Content>
        </div>
        <Button variant="primary" onClick={createDialog.onOpen}>
          <PlusIcon height={14} /> New webhook
        </Button>
      </div>

      {webhooks.length === 0 ? (
        <div className="rounded-sm border bg-gray-50 p-8 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-500">
          No webhooks yet.
        </div>
      ) : (
        <>
          <ItemGroup className="gap-2">
            {activeWebhooks.map((w) => (
              <WebhookRow
                key={w.id}
                app={app}
                namespaces={namespaces}
                webhook={w}
                onChanged={refresh}
              />
            ))}
          </ItemGroup>

          {disabledWebhooks.length > 0 ? (
            <div className="flex flex-col gap-2">
              <SubsectionHeading className="text-gray-500 dark:text-neutral-500">
                Disabled
              </SubsectionHeading>
              <ItemGroup className="gap-2">
                {disabledWebhooks.map((w) => (
                  <WebhookRow
                    key={w.id}
                    app={app}
                    namespaces={namespaces}
                    webhook={w}
                    onChanged={refresh}
                  />
                ))}
              </ItemGroup>
            </div>
          ) : null}
        </>
      )}

      <CreateDialog
        app={app}
        namespaces={namespaces}
        dialog={createDialog}
        onCreated={refresh}
      />
    </div>
  );
}
