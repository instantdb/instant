import {
  init as initAdmin,
  type WebhookInfo,
  type WebhookEventInfo,
  type WebhookAction,
  type WebhookPayload,
} from '@instantdb/admin';
import { i, id, type InstantReactWebDatabase } from '@instantdb/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import config from '../../config';
import EphemeralAppPage from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    colors: i.entity({
      color: i.string(),
      createdAt: i.number().indexed(),
    }),
    items: i.entity({
      name: i.string(),
      createdAt: i.number().indexed(),
    }),
    webhookEvents: i.entity({
      receivedAt: i.number().indexed(),
      etype: i.string(),
      action: i.string(),
      payload: i.json(),
    }),
    webhookConfig: i.entity({
      nextStatusCode: i.number(),
    }),
  },
});

type Schema = typeof schema;
type EtypeName = Exclude<keyof Schema['entities'] & string, 'webhookEvents'>;

const NGROK_KEY = 'webhooks-ngrok';
const CONFIG_ID = '11111111-1111-4111-9111-111111111111';
const STATUS_OPTIONS = [200, 410, 429, 500, 503];
const colorOptions = ['red', 'green', 'blue', 'purple', 'orange'];
const itemNames = ['apple', 'banana', 'cherry', 'date', 'elderberry'];
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

const btn =
  'px-3 py-1 text-sm bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-50';
const dangerBtn =
  'px-3 py-1 text-sm bg-red-700 text-white rounded hover:bg-red-600 disabled:opacity-50';
const subtleBtn =
  'px-2 py-0.5 text-xs bg-white text-gray-700 border rounded hover:bg-gray-50 disabled:opacity-50';

const ALL_ETYPES: EtypeName[] = ['colors', 'items'];
const ALL_ACTIONS: WebhookAction[] = ['create', 'update', 'delete'];

function statusColor(status: WebhookEventInfo['status']) {
  switch (status) {
    case 'success':
      return 'text-green-700';
    case 'failed':
      return 'text-red-700';
    case 'error':
      return 'text-amber-700';
    case 'processing':
      return 'text-blue-700';
    default:
      return 'text-gray-600';
  }
}

function App({
  db,
  appId,
}: {
  db: InstantReactWebDatabase<Schema, any, any>;
  appId: string;
}) {
  const adminToken = useMemo(() => {
    try {
      return localStorage.getItem(`ephemeral-admin-token-${appId}`) ?? '';
    } catch {
      return '';
    }
  }, [appId]);
  const adminDb = useRef(
    initAdmin({
      ...config,
      appId,
      adminToken,
      schema,
    }),
  );
  const manager = adminDb.current.webhooks.manager;

  const [ngrokInput, setNgrokInput] = useState('');
  const [ngrokUrl, setNgrokUrl] = useState('');
  const [port, setPort] = useState('4000');
  const [router, setRouter] = useState<'app' | 'pages'>('app');
  const [webhooks, setWebhooks] = useState<WebhookInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(NGROK_KEY) ?? '';
      setNgrokUrl(saved);
      setNgrokInput(saved);
    } catch {}
    if (typeof window !== 'undefined' && window.location.port) {
      setPort(window.location.port);
    }
  }, []);

  const webhookUrl = useMemo(() => {
    if (!ngrokUrl) return '';
    const path = router === 'app' ? '/api/webhooks' : '/api/webhooks-pages';
    return `${ngrokUrl.replace(/\/$/, '')}${path}?appId=${encodeURIComponent(appId)}`;
  }, [ngrokUrl, appId, router]);

  const refreshWebhooks = async () => {
    try {
      const ws = await manager.list();
      setWebhooks(ws);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  };

  useEffect(() => {
    refreshWebhooks();
  }, []);

  const saveNgrok = () => {
    const trimmed = ngrokInput.trim();
    setNgrokUrl(trimmed);
    try {
      localStorage.setItem(NGROK_KEY, trimmed);
    } catch {}
  };

  const wrap = async (fn: () => Promise<void>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const tryFire = async (fn: () => Promise<void>) => {
    setErr(null);
    try {
      await fn();
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  };

  const createWebhook = () =>
    wrap(async () => {
      await manager.create({
        url: webhookUrl,
        etypes: ['colors'],
        actions: ['create', 'update', 'delete'],
      });
      await refreshWebhooks();
    });

  const deleteWebhook = (webhookId: string) =>
    wrap(async () => {
      await manager.delete(webhookId);
      if (selectedId === webhookId) setSelectedId(null);
      if (editingId === webhookId) setEditingId(null);
      await refreshWebhooks();
    });

  const toggleWebhook = (w: WebhookInfo) =>
    wrap(async () => {
      if (w.status === 'active') {
        await manager.disable(w.id, { reason: 'Disabled from sandbox' });
      } else {
        await manager.enable(w.id);
      }
      await refreshWebhooks();
    });

  const saveEdit = (
    webhookId: string,
    params: { url: string; etypes: EtypeName[]; actions: WebhookAction[] },
  ) =>
    wrap(async () => {
      await manager.update(webhookId, params);
      setEditingId(null);
      await refreshWebhooks();
    });

  const { data: colorsData } = db.useQuery({
    colors: { $: { order: { createdAt: 'desc' } } },
  });
  const { data: itemsData } = db.useQuery({
    items: { $: { order: { createdAt: 'desc' } } },
  });
  const { data: handlerEventsData } = db.useQuery({
    webhookEvents: { $: { order: { receivedAt: 'desc' }, limit: 50 } },
  });

  const addRow = (etype: EtypeName) =>
    tryFire(async () => {
      const createdAt = Date.now();
      if (etype === 'colors') {
        await adminDb.current.transact(
          adminDb.current.tx.colors[id()].update({
            color: pick(colorOptions),
            createdAt,
          }),
        );
      } else {
        await adminDb.current.transact(
          adminDb.current.tx.items[id()].update({
            name: pick(itemNames),
            createdAt,
          }),
        );
      }
    });

  const updateFirstRow = (etype: EtypeName) =>
    tryFire(async () => {
      if (etype === 'colors') {
        const first = colorsData?.colors?.[0];
        if (!first) return;
        await adminDb.current.transact(
          adminDb.current.tx.colors[first.id].update({
            color: pick(colorOptions),
          }),
        );
      } else {
        const first = itemsData?.items?.[0];
        if (!first) return;
        await adminDb.current.transact(
          adminDb.current.tx.items[first.id].update({ name: pick(itemNames) }),
        );
      }
    });

  const deleteFirstRow = (etype: EtypeName) =>
    tryFire(async () => {
      if (etype === 'colors') {
        const first = colorsData?.colors?.[0];
        if (!first) return;
        await adminDb.current.transact(
          adminDb.current.tx.colors[first.id].delete(),
        );
      } else {
        const first = itemsData?.items?.[0];
        if (!first) return;
        await adminDb.current.transact(
          adminDb.current.tx.items[first.id].delete(),
        );
      }
    });

  const burst = () =>
    tryFire(async () => {
      const createdAt = Date.now();
      const tx = adminDb.current.tx;
      const ops: any[] = [
        tx.colors[id()].update({ color: pick(colorOptions), createdAt }),
        tx.colors[id()].update({ color: pick(colorOptions), createdAt }),
        tx.items[id()].update({ name: pick(itemNames), createdAt }),
      ];
      const firstColor = colorsData?.colors?.[0];
      if (firstColor) {
        ops.push(
          tx.colors[firstColor.id].update({ color: pick(colorOptions) }),
        );
      }
      const firstItem = itemsData?.items?.[0];
      if (firstItem) {
        ops.push(tx.items[firstItem.id].delete());
      }
      await adminDb.current.transact(ops);
    });

  const setStatusCode = (code: number) =>
    tryFire(async () => {
      await adminDb.current.transact(
        adminDb.current.tx.webhookConfig[CONFIG_ID].update({
          nextStatusCode: code,
        }),
      );
    });

  const { data: configData } = db.useQuery({
    webhookConfig: { $: { limit: 1 } },
  });
  const currentStatusCode =
    configData?.webhookConfig?.[0]?.nextStatusCode ?? 200;

  const ngrokSet = !!ngrokUrl;

  return (
    <div className="mx-auto mt-10 mb-20 flex max-w-3xl flex-col gap-6 px-4">
      <header>
        <h1 className="text-2xl font-semibold">Webhooks sandbox</h1>
        <p className="mt-1 text-sm text-gray-600">
          App ID: <code className="bg-gray-100 px-1">{appId}</code>
        </p>
      </header>

      <section className="rounded border p-4">
        <h2 className="font-semibold">1. Set up ngrok</h2>
        <p className="mt-1 text-sm text-gray-600">
          Instant needs a public URL to deliver webhooks to. Start ngrok with{' '}
          <code className="bg-gray-100 px-1">ngrok http {port}</code> and paste
          the forwarding URL below (e.g.{' '}
          <code className="bg-gray-100 px-1">https://abc123.ngrok.app</code>).
        </p>
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded border px-2 py-1 text-sm"
            value={ngrokInput}
            onChange={(e) => setNgrokInput(e.target.value)}
            placeholder="https://abc123.ngrok.app"
          />
          <button className={btn} onClick={saveNgrok}>
            Save
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-gray-600">
          <span>Receiver:</span>
          <label>
            <input
              type="radio"
              name="receiver"
              checked={router === 'app'}
              onChange={() => setRouter('app')}
            />{' '}
            App router (
            <code className="bg-gray-100 px-1">app/api/webhooks</code>)
          </label>
          <label>
            <input
              type="radio"
              name="receiver"
              checked={router === 'pages'}
              onChange={() => setRouter('pages')}
            />{' '}
            Pages router (
            <code className="bg-gray-100 px-1">pages/api/webhooks-pages</code>)
          </label>
        </div>
        {ngrokSet && (
          <p className="mt-2 text-xs text-gray-500">
            Webhook URL:{' '}
            <code className="bg-gray-100 px-1 break-all">{webhookUrl}</code>
          </p>
        )}
      </section>

      <section className="rounded border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">2. Manage webhooks</h2>
          <button className={btn} onClick={refreshWebhooks} disabled={busy}>
            Refresh
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            className={btn}
            onClick={createWebhook}
            disabled={!ngrokSet || busy}
          >
            Create webhook on `colors`
          </button>
        </div>
        <ul className="mt-3 space-y-2">
          {webhooks.length === 0 && (
            <li className="text-sm text-gray-500">No webhooks yet.</li>
          )}
          {webhooks.map((w) => (
            <li
              key={w.id}
              className={
                'rounded border p-2 text-sm ' +
                (selectedId === w.id
                  ? 'border-gray-800 bg-gray-100'
                  : 'border-gray-200 bg-gray-50')
              }
            >
              {editingId === w.id ? (
                <WebhookEditor
                  webhook={w}
                  onCancel={() => setEditingId(null)}
                  onSave={(params) => saveEdit(w.id, params)}
                  disabled={busy}
                />
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="break-all">{w.sink.url}</div>
                    <div className="text-xs text-gray-600">
                      status:{' '}
                      <span
                        className={
                          w.status === 'active'
                            ? 'text-green-700'
                            : 'text-gray-500'
                        }
                      >
                        {w.status}
                      </span>
                      {' · '}
                      etypes: {(w.etypes ?? []).join(', ') || '—'}
                      {' · '}
                      actions: {w.actions.join(', ')}
                      {w.disabledReason && (
                        <>
                          {' · '}
                          <span className="text-gray-500">
                            reason: {w.disabledReason}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      created {w.createdAt.toLocaleString()}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    <button
                      className={subtleBtn}
                      onClick={() =>
                        setSelectedId(selectedId === w.id ? null : w.id)
                      }
                    >
                      {selectedId === w.id ? 'Hide events' : 'View events'}
                    </button>
                    <button
                      className={subtleBtn}
                      onClick={() => setEditingId(w.id)}
                    >
                      Edit
                    </button>
                    <button className={btn} onClick={() => toggleWebhook(w)}>
                      {w.status === 'active' ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      className={dangerBtn}
                      onClick={() => deleteWebhook(w.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
              {selectedId === w.id && (
                <div className="mt-3 border-t pt-3">
                  <WebhookInspector key={w.id} webhook={w} manager={manager} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded border p-4">
        <h2 className="font-semibold">3. Trigger some events</h2>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <EtypeControls
            label="colors"
            rows={(colorsData?.colors ?? []).map((c: any) => ({
              id: c.id,
              label: c.color,
            }))}
            onAdd={() => addRow('colors')}
            onUpdate={() => updateFirstRow('colors')}
            onDelete={() => deleteFirstRow('colors')}
          />
          <EtypeControls
            label="items"
            rows={(itemsData?.items ?? []).map((it: any) => ({
              id: it.id,
              label: it.name,
            }))}
            onAdd={() => addRow('items')}
            onUpdate={() => updateFirstRow('items')}
            onDelete={() => deleteFirstRow('items')}
          />
        </div>
        <div className="mt-4 border-t pt-3">
          <div className="text-xs text-gray-600">
            Combine ops into a single{' '}
            <code className="bg-gray-100 px-1">transact</code> — Instant
            delivers all records in one webhook payload.
          </div>
          <button className={btn + ' mt-2'} onClick={burst}>
            Burst transact (add 2 colors + 1 item, update first color, delete
            first item)
          </button>
        </div>
      </section>

      <section className="rounded border p-4">
        <h2 className="font-semibold">4. Handler response</h2>
        <p className="mt-1 text-sm text-gray-600">
          Pick the status the route handler should return for the next delivery.
          Non-200 will cause Instant to retry (visible in the delivery events
          list).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((code) => (
            <button
              key={code}
              onClick={() => setStatusCode(code)}
              className={
                code === currentStatusCode
                  ? btn
                  : subtleBtn + ' px-3 py-1 text-sm'
              }
            >
              {code}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Currently returning{' '}
          <code className="bg-gray-100 px-1">{currentStatusCode}</code>.
        </p>
      </section>

      <section className="rounded border p-4">
        <h2 className="font-semibold">Handler-received events</h2>
        <p className="mt-1 text-xs text-gray-500">
          Written by <code className="bg-gray-100 px-1">/api/webhooks</code>{' '}
          using <code className="bg-gray-100 px-1">processRequest</code>.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {(handlerEventsData?.webhookEvents ?? []).length === 0 && (
            <li className="text-gray-500">
              Waiting for events… trigger one above.
            </li>
          )}
          {(handlerEventsData?.webhookEvents ?? []).map((e: any) => (
            <li key={e.id} className="rounded border bg-gray-50 p-2">
              <div>
                <span className="font-mono">{e.etype}</span> /{' '}
                <span className="font-mono">{e.action}</span>{' '}
                <span className="text-xs text-gray-500">
                  {new Date(e.receivedAt).toLocaleTimeString()}
                </span>
              </div>
              <pre className="mt-1 overflow-x-auto text-xs">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      </section>

      {err && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {err}
        </div>
      )}
    </div>
  );
}

function EtypeControls({
  label,
  rows,
  onAdd,
  onUpdate,
  onDelete,
}: {
  label: string;
  rows: { id: string; label: string }[];
  onAdd: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  return (
    <div>
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={btn} onClick={onAdd}>
          Add
        </button>
        <button className={btn} onClick={onUpdate} disabled={rows.length === 0}>
          Update first
        </button>
        <button
          className={dangerBtn}
          onClick={onDelete}
          disabled={rows.length === 0}
        >
          Delete first
        </button>
      </div>
      <ul className="mt-2 h-[6.25rem] overflow-y-auto text-xs leading-5">
        {rows.map((r) => (
          <li key={r.id}>
            <code className="bg-gray-100 px-1">{r.id.slice(0, 8)}</code> →{' '}
            {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WebhookEditor({
  webhook,
  onSave,
  onCancel,
  disabled,
}: {
  webhook: WebhookInfo;
  onSave: (params: {
    url: string;
    etypes: EtypeName[];
    actions: WebhookAction[];
  }) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [url, setUrl] = useState(webhook.sink.url);
  const [etypes, setEtypes] = useState<Set<EtypeName>>(
    () => new Set((webhook.etypes ?? []) as EtypeName[]),
  );
  const [actions, setActions] = useState<Set<WebhookAction>>(
    () => new Set(webhook.actions),
  );

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-gray-600">URL</label>
      <input
        className="rounded border px-2 py-1 text-sm"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <div className="flex flex-wrap gap-3">
        <div>
          <div className="text-xs text-gray-600">etypes</div>
          <div className="mt-1 flex gap-2">
            {ALL_ETYPES.map((e) => (
              <label key={e} className="text-xs">
                <input
                  type="checkbox"
                  checked={etypes.has(e)}
                  onChange={() => setEtypes((s) => toggle(s, e))}
                />{' '}
                {e}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-600">actions</div>
          <div className="mt-1 flex gap-2">
            {ALL_ACTIONS.map((a) => (
              <label key={a} className="text-xs">
                <input
                  type="checkbox"
                  checked={actions.has(a)}
                  onChange={() => setActions((s) => toggle(s, a))}
                />{' '}
                {a}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-1 flex gap-2">
        <button
          className={btn}
          disabled={disabled}
          onClick={() =>
            onSave({
              url,
              etypes: Array.from(etypes),
              actions: Array.from(actions),
            })
          }
        >
          Save
        </button>
        <button className={subtleBtn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

type Manager = ReturnType<typeof initAdmin<Schema>>['webhooks']['manager'];

function WebhookInspector({
  webhook,
  manager,
}: {
  webhook: WebhookInfo;
  manager: Manager;
}) {
  const [events, setEvents] = useState<WebhookEventInfo[]>([]);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadFirstPage = async () => {
    setLoading(true);
    setErr(null);
    try {
      const page = await manager.listEvents(webhook.id);
      setEvents(page.events);
      setEndCursor(page.pageInfo.endCursor);
      setHasNext(page.pageInfo.hasNextPage);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!endCursor) return;
    setLoading(true);
    setErr(null);
    try {
      const page = await manager.listEvents(webhook.id, { after: endCursor });
      setEvents((prev) => [...prev, ...page.events]);
      setEndCursor(page.pageInfo.endCursor);
      setHasNext(page.pageInfo.hasNextPage);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhook.id]);

  const refreshEvent = async (isn: string) => {
    try {
      const fresh = await manager.getEvent(webhook.id, isn);
      setEvents((prev) => prev.map((e) => (e.isn === isn ? fresh : e)));
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  };

  const resend = async (isn: string) => {
    try {
      const fresh = await manager.resendEvent(webhook.id, isn);
      setEvents((prev) => prev.map((e) => (e.isn === isn ? fresh : e)));
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Delivery events ({' '}
          <code className="bg-gray-100 px-1">manager.listEvents</code> )
        </h3>
        <button
          className={subtleBtn}
          onClick={loadFirstPage}
          disabled={loading}
        >
          Refresh
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {events.length === 0 && (
          <li className="text-sm text-gray-500">
            No deliveries yet for this webhook.
          </li>
        )}
        {events.map((e) => (
          <EventRow
            key={e.isn}
            webhookId={webhook.id}
            event={e}
            manager={manager}
            onRefresh={() => refreshEvent(e.isn)}
            onResend={() => resend(e.isn)}
            onError={setErr}
          />
        ))}
      </ul>
      {hasNext && (
        <button
          className={subtleBtn + ' mt-3'}
          onClick={loadMore}
          disabled={loading}
        >
          Load more
        </button>
      )}
      {err && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">
          {err}
        </div>
      )}
    </div>
  );
}

function EventRow({
  webhookId,
  event,
  manager,
  onRefresh,
  onResend,
  onError,
}: {
  webhookId: string;
  event: WebhookEventInfo;
  manager: Manager;
  onRefresh: () => void;
  onResend: () => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<WebhookPayload<Schema> | null>(null);
  const [payloadLoading, setPayloadLoading] = useState(false);

  const loadPayload = async () => {
    setPayloadLoading(true);
    try {
      const p = await manager.getPayload(webhookId, event.isn);
      setPayload(p);
    } catch (e: any) {
      onError(e?.message || String(e));
    } finally {
      setPayloadLoading(false);
    }
  };

  return (
    <li className="rounded border bg-gray-50 p-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div>
            <span className={statusColor(event.status)}>{event.status}</span>
            {' · '}
            <code className="bg-gray-100 px-1">{event.isn}</code>
          </div>
          <div className="text-xs text-gray-600">
            attempts: {event.attempts?.length ?? 0}
            {' · '}
            created {event.createdAt.toLocaleTimeString()}
            {event.nextAttemptAfter && (
              <>
                {' · '}
                retry after {event.nextAttemptAfter.toLocaleTimeString()}
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <button className={subtleBtn} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide' : 'Details'}
          </button>
          <button className={subtleBtn} onClick={onRefresh}>
            Refresh
          </button>
          <button className={subtleBtn} onClick={onResend}>
            Resend
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-2 space-y-2 border-t pt-2">
          {event.attempts && event.attempts.length > 0 && (
            <div>
              <div className="text-xs font-semibold">Attempts</div>
              <ul className="mt-1 space-y-1 text-xs">
                {event.attempts.map((a, i) => (
                  <li key={i} className="border-l-2 border-gray-300 pl-2">
                    <span
                      className={a.success ? 'text-green-700' : 'text-red-700'}
                    >
                      {a.success ? 'success' : 'failed'}
                    </span>
                    {a.statusCode != null ? ` · status ${a.statusCode}` : ''}
                    {a.durationMs != null ? ` · ${a.durationMs}ms` : ''}
                    {a.errorType ? ` · ${a.errorType}` : ''}
                    {a.errorMessage && (
                      <div className="text-gray-600">{a.errorMessage}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold">Payload</div>
              <button
                className={subtleBtn}
                onClick={loadPayload}
                disabled={payloadLoading}
              >
                {payload ? 'Reload' : 'Load'} payload
              </button>
            </div>
            {payload && (
              <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-xs">
                {JSON.stringify(payload, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export default function Page() {
  return <EphemeralAppPage schema={schema} Component={App} />;
}
