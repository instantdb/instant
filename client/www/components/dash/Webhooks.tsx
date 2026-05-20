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
  cn,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
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

export const ALL_ACTIONS: InstantWebhookAction[] = [
  'create',
  'update',
  'delete',
];

export function CopyableText({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const handleClick = async () => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    try {
      await window.navigator.clipboard.writeText(value);
      setTooltipOpen(true);
      setTimeout(() => setTooltipOpen(false), 1000);
    } catch (e) {
      console.error('Failed to copy to clipboard', e);
    }
  };

  return (
    <Tooltip open={tooltipOpen}>
      <TooltipTrigger asChild>
        <span
          title="Click to copy"
          className={`cursor-default ${className ?? ''}`}
          onClick={handleClick}
        >
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">Copied!</TooltipContent>
    </Tooltip>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-gray-200 bg-[#fbfaf8] px-1.5 py-0.5 font-mono text-[11px] text-gray-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: InstantWebhook['status'] }) {
  const disabled = status === 'disabled';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        disabled
          ? 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300'
          : 'bg-green-50 text-green-700 ring-1 ring-green-200 ring-inset dark:bg-green-950/30 dark:text-green-300 dark:ring-green-800',
      )}
    >
      {disabled ? 'Disabled' : 'Active'}
    </span>
  );
}

function Notice({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'warning' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-sm leading-6',
        tone === 'neutral' &&
          'border-gray-200 bg-[#fbfaf8] text-gray-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300',
        tone === 'warning' &&
          'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200',
        tone === 'danger' &&
          'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200',
      )}
    >
      {children}
    </div>
  );
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

// ---- API ----

type CreateBody = {
  url: string;
  namespaces: string[];
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

  // Show any namespace the webhook already references even if it's no longer
  // in the schema (renamed/deleted), so the user can deselect it intentionally.
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

  const handle: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      errorToast('URL is required.', { autoClose: 5000 });
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      errorToast('URL must be a valid HTTPS URL.', { autoClose: 5000 });
      return;
    }
    if (parsed.protocol !== 'https:') {
      errorToast('URL must use https.', { autoClose: 5000 });
      return;
    }
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      errorToast('URL must be a public host, not localhost.', {
        autoClose: 5000,
      });
      return;
    }
    if (selectedNamespaces.size === 0) {
      errorToast('Select at least one namespace.', { autoClose: 5000 });
      return;
    }
    if (actions.size === 0) {
      errorToast('Select at least one action.', { autoClose: 5000 });
      return;
    }
    await onSubmit({
      url: trimmed,
      namespaces: [...selectedNamespaces],
      actions: [...actions],
    });
  };

  return (
    <form onSubmit={handle} className="flex flex-col gap-5">
      <div>
        <SubsectionHeading>{heading}</SubsectionHeading>
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
          <Content className="text-xs text-gray-500 dark:text-neutral-500">
            Define namespaces in your schema to enable webhooks.
          </Content>
        ) : (
          <div className="grid max-h-44 grid-cols-1 gap-2 overflow-y-auto rounded-md border border-gray-200 bg-[#fbfaf8] p-3 sm:grid-cols-2 dark:border-neutral-700 dark:bg-neutral-800/50">
            {allOptions.map((n) => (
              <Checkbox
                key={n}
                checked={selectedNamespaces.has(n)}
                onChange={() => setSelectedNamespaces((s) => toggle(s, n))}
                label={n}
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
          loading={isLoading}
          variant="primary"
          size="large"
          type="submit"
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
        <Notice tone="warning">
          Disabled webhooks won't deliver events. You can re-enable it at any
          time.
        </Notice>
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
        <SubsectionHeading className="font-mono text-base break-all">
          {webhook.sink.url}
        </SubsectionHeading>
        <Notice tone="danger">
          Deleting a webhook is permanent. Any pending events for this webhook
          will be discarded.
        </Notice>
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

export function WebhookActionsMenu({
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
  const editDialog = useDialog();
  const disableDialog = useDialog();
  const deleteDialog = useDialog();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="cursor-pointer rounded p-1 hover:bg-gray-200 dark:hover:bg-neutral-700"
            title="More"
          >
            <EllipsisVerticalIcon height={18} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-fit min-w-0">
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={editDialog.onOpen}
          >
            <span className="flex items-center gap-2">
              <PencilIcon className="size-3.5" />
              Edit
            </span>
          </DropdownMenuItem>
          {webhook.status === 'active' ? (
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={disableDialog.onOpen}
            >
              <span className="flex items-center gap-2">
                <NoSymbolIcon className="size-3.5" />
                Disable
              </span>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            className="cursor-pointer text-red-500"
            onSelect={deleteDialog.onOpen}
          >
            <span className="flex items-center gap-2">
              <TrashIcon className="size-3.5" />
              Delete
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
    </>
  );
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
    <Item variant="outline" size="sm" className="items-start gap-3">
      <ItemContent className="min-w-0 gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ItemTitle className="block max-w-full min-w-0 truncate font-mono">
            <CopyableText value={webhook.sink.url} className="block truncate" />
          </ItemTitle>
          <StatusBadge status={webhook.status} />
        </div>
        {webhook.disabled_reason ? (
          <ItemDescription className="text-red-700 dark:text-red-300">
            {webhook.disabled_reason}
          </ItemDescription>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-neutral-500">
          <CopyableText value={webhook.id} className="font-mono" />
          <span>Created {formatCreatedAt(webhook.created_at)}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(webhook.namespaces ?? []).length === 0 ? (
            <Chip>No namespaces</Chip>
          ) : (
            [...(webhook.namespaces ?? [])]
              .sort()
              .map((namespace) => <Chip key={namespace}>{namespace}</Chip>)
          )}
          {ALL_ACTIONS.filter((a) => webhook.actions.includes(a)).map(
            (action) => (
              <Chip key={action}>{action}</Chip>
            ),
          )}
        </div>
      </ItemContent>
      <ItemActions className="shrink-0 self-start">
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
        <WebhookActionsMenu
          app={app}
          namespaces={namespaces}
          webhook={webhook}
          onChanged={onChanged}
        />
      </ItemActions>
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
    return (
      <WebhookEventsPage
        app={app}
        webhook={focusedWebhook}
        namespaces={namespaces}
        onChanged={refresh}
      />
    );
  }

  const activeWebhooks = webhooks.filter((w) => w.status === 'active');
  const disabledWebhooks = webhooks.filter((w) => w.status === 'disabled');

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <SectionHeading>Webhooks</SectionHeading>
          <Content className="text-sm text-gray-500 dark:text-neutral-500">
            Receive HTTP callbacks when entries in a namespace are created,
            updated, or deleted.
          </Content>
        </div>
        <Button variant="primary" size="large" onClick={createDialog.onOpen}>
          <PlusIcon height={14} /> New webhook
        </Button>
      </div>

      {webhooks.length === 0 ? (
        <div className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-gray-300 bg-[#fbfaf8] px-4 py-6 text-center dark:border-neutral-700 dark:bg-neutral-950">
          <div>
            <div className="font-semibold text-gray-950 dark:text-white">
              No webhooks yet
            </div>
            <div className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
              Add an endpoint to receive create, update, and delete events.
            </div>
          </div>
          <Button variant="secondary" size="mini" onClick={createDialog.onOpen}>
            <PlusIcon height={14} /> New webhook
          </Button>
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
