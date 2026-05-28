// ============================================================
// Auth disclosure flows — fully interactive, mock, side-effect-free.
//
// The point of these is to *experience* the whole lifecycle (empty →
// add → edit → delete) for each disclosure model, and to feel how the
// heavy leaves (an OAuth client's config + code snippets, the magic-code
// email editor) behave when you go deep:
//
//   drill   — overview is a calm index; heavy leaves open a focused page
//   master  — two-pane: list rail + detail pane
//   sheet   — overview stays put; heavy leaves slide over from the right
//
// Everything is local state. No network, no real clients created.
// ============================================================

import { ReactNode, useState } from 'react';
import Image from 'next/image';
import {
  BeakerIcon,
  BoltIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CodeBracketIcon,
  CreditCardIcon,
  CubeIcon,
  EnvelopeIcon,
  FunnelIcon,
  GlobeAltIcon,
  HomeIcon,
  IdentificationIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

import { Button, TextInput, cn } from '@/components/ui';
import { DashPage } from '../_shared';

import googleIconSvg from '../../../../public/img/google_g.svg';
import appleLogoSvg from '../../../../public/img/apple_logo_black.svg';
import githubIconSvg from '../../../../public/img/github.svg';
import linkedinIconSvg from '../../../../public/img/linkedin.svg';
import clerkLogoSvg from '../../../../public/img/clerk_logo_black.svg';
import firebaseLogoSvg from '../../../../public/img/firebase_auth.svg';

export type FlowIdea = 'drill' | 'master' | 'sheet' | 'merged';

// -------------------- providers --------------------

type ProviderId =
  | 'google'
  | 'apple'
  | 'github'
  | 'linkedin'
  | 'clerk'
  | 'firebase';

const PROVIDERS: {
  id: ProviderId;
  label: string;
  icon: any;
  invert?: boolean;
  hasDevKeys?: boolean;
}[] = [
  { id: 'google', label: 'Google', icon: googleIconSvg, hasDevKeys: true },
  { id: 'apple', label: 'Apple', icon: appleLogoSvg, invert: true },
  { id: 'github', label: 'GitHub', icon: githubIconSvg, invert: true },
  { id: 'linkedin', label: 'LinkedIn', icon: linkedinIconSvg },
  { id: 'clerk', label: 'Clerk', icon: clerkLogoSvg, invert: true },
  { id: 'firebase', label: 'Firebase', icon: firebaseLogoSvg },
];

const providerCfg = (id: ProviderId) =>
  PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

const REDIRECT_URI = 'https://api.instantdb.com/runtime/oauth/callback';

// -------------------- mock model --------------------

type ClientMode = 'dev' | 'custom';
type MockClient = {
  id: string;
  provider: ProviderId;
  name: string;
  mode: ClientMode;
  clientId?: string;
};
type OriginKind = 'website' | 'vercel' | 'netlify' | 'scheme';
type MockOrigin = { id: string; kind: OriginKind; value: string };
type MockTestUser = { id: string; email: string; code: string };
type MockEmail = {
  customized: boolean;
  subject: string;
  from: string;
  body: string;
  senderEmail: string;
};

type AuthModel = {
  clients: MockClient[];
  origins: MockOrigin[];
  testUsers: MockTestUser[];
  email: MockEmail;
};

const defaultBody = `<div style="font-family: Helvetica, Arial, sans-serif">
  <p>Welcome,</p>
  <p>Your verification code is:</p>
  <h2>{code}</h2>
  <p>This code expires in 10 minutes.</p>
</div>`;

function freshEmail(): MockEmail {
  return {
    customized: false,
    subject: '{code} is your code for {app_title}',
    from: '',
    body: defaultBody,
    senderEmail: '',
  };
}

function useAuthModel() {
  const [model, setModel] = useState<AuthModel>({
    clients: [],
    origins: [],
    testUsers: [],
    email: freshEmail(),
  });

  const actions = {
    addClient(c: Omit<MockClient, 'id'>) {
      const id = crypto.randomUUID();
      setModel((m) => ({ ...m, clients: [...m.clients, { ...c, id }] }));
      return id;
    },
    updateClient(id: string, patch: Partial<MockClient>) {
      setModel((m) => ({
        ...m,
        clients: m.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
    },
    deleteClient(id: string) {
      setModel((m) => ({
        ...m,
        clients: m.clients.filter((c) => c.id !== id),
      }));
    },
    addOrigin(o: Omit<MockOrigin, 'id'>) {
      setModel((m) => ({
        ...m,
        origins: [...m.origins, { ...o, id: crypto.randomUUID() }],
      }));
    },
    removeOrigin(id: string) {
      setModel((m) => ({
        ...m,
        origins: m.origins.filter((o) => o.id !== id),
      }));
    },
    addTestUser(u: Omit<MockTestUser, 'id'>) {
      setModel((m) => ({
        ...m,
        testUsers: [{ ...u, id: crypto.randomUUID() }, ...m.testUsers],
      }));
    },
    removeTestUser(id: string) {
      setModel((m) => ({
        ...m,
        testUsers: m.testUsers.filter((u) => u.id !== id),
      }));
    },
    saveEmail(patch: Partial<MockEmail>) {
      setModel((m) => ({
        ...m,
        email: { ...m.email, ...patch, customized: true },
      }));
    },
    resetEmail() {
      setModel((m) => ({ ...m, email: freshEmail() }));
    },
  };

  return { model, actions };
}

type Actions = ReturnType<typeof useAuthModel>['actions'];

// -------------------- small shared atoms --------------------

function Field({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-gray-500 dark:text-neutral-400">
        {label}
      </div>
      {children}
    </div>
  );
}

function CopyField({
  label,
  value,
  mono = true,
}: {
  label?: ReactNode;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const inner = (
    <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-[#fbfaf8] px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
      <span
        className={cn(
          'truncate text-sm text-gray-800 dark:text-neutral-200',
          mono && 'font-mono',
        )}
      >
        {value}
      </span>
      <button
        type="button"
        className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
  return label ? <Field label={label}>{inner}</Field> : inner;
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-md border border-gray-200 dark:border-neutral-800">
      <div className="flex items-center justify-between border-b border-gray-100 bg-[#fbfaf8] px-3 py-1.5 dark:border-neutral-800 dark:bg-neutral-950">
        <span className="font-mono text-[11px] tracking-wider text-gray-400 uppercase dark:text-neutral-500">
          {title}
        </span>
        <button
          type="button"
          className="text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-auto bg-white px-3 py-3 font-mono text-xs leading-5 text-gray-700 dark:bg-neutral-900 dark:text-neutral-300">
        {code}
      </pre>
    </div>
  );
}

function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-gray-200 bg-[#fbfaf8] p-3 text-sm text-gray-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
      {children}
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500 dark:border-neutral-700 dark:text-neutral-400">
      {children}
    </span>
  );
}

function MethodHeading({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h3 className="text-lg font-semibold tracking-tight text-gray-950 dark:text-white">
        {title}
      </h3>
      <span className="text-sm text-gray-400 dark:text-neutral-500">{meta}</span>
    </div>
  );
}

function SubLabel({ title, helper }: { title: string; helper?: string }) {
  return (
    <div className="mb-3">
      <div className="text-sm font-semibold text-gray-900 dark:text-white">
        {title}
      </div>
      {helper ? (
        <p className="mt-0.5 text-sm text-gray-500 dark:text-neutral-400">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

function ProviderIcon({ id, size = 20 }: { id: ProviderId; size?: number }) {
  const cfg = providerCfg(id);
  return (
    <Image
      alt={cfg.label}
      src={cfg.icon}
      width={size}
      height={size}
      className={cfg.invert ? 'dark:invert' : ''}
    />
  );
}

// -------------------- leaf editors (the deep content) --------------------

function AddClientWizard({
  onAdd,
  onCancel,
}: {
  onAdd: (c: Omit<MockClient, 'id'>) => void;
  onCancel: () => void;
}) {
  const [provider, setProvider] = useState<ProviderId | null>(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ClientMode>('dev');
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');

  if (!provider) {
    return (
      <div className="flex flex-col gap-4">
        <div className="text-sm text-gray-500 dark:text-neutral-400">
          Choose a provider to configure.
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setProvider(p.id);
                setName(`${p.id}-web`);
                setMode(p.hasDevKeys ? 'dev' : 'custom');
              }}
              className="flex flex-col items-center gap-2 rounded-md border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 hover:bg-[#fbfaf8] dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
            >
              <ProviderIcon id={p.id} size={24} />
              <span className="text-sm">{p.label}</span>
            </button>
          ))}
        </div>
        <div>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const cfg = providerCfg(provider);
  const showCustomFields = mode === 'custom';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ProviderIcon id={provider} />
        <span className="text-sm font-medium">{cfg.label}</span>
      </div>

      <Field label="Client name">
        <TextInput value={name} onChange={setName} placeholder="my-web-client" />
      </Field>

      {cfg.hasDevKeys ? (
        <div className="inline-flex w-fit rounded-md border border-gray-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-900">
          {(['dev', 'custom'] as ClientMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'rounded-sm px-3 py-1.5 text-sm transition-colors',
                mode === m
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white',
              )}
            >
              {m === 'dev' ? 'Use Instant dev keys' : 'Use my own'}
            </button>
          ))}
        </div>
      ) : null}

      {mode === 'dev' ? (
        <InfoBox>
          Instant's shared development keys let you try sign-in immediately. Add
          your own credentials before launch.
        </InfoBox>
      ) : (
        <>
          <Field label={`Client ID from the ${cfg.label} console`}>
            <TextInput
              value={clientId}
              onChange={setClientId}
              placeholder="1234567890-abc.apps..."
            />
          </Field>
          <Field label="Client secret">
            <TextInput
              value={secret}
              onChange={setSecret}
              placeholder="••••••••••••••••"
            />
          </Field>
          <Field label='Add this to "Authorized redirect URIs"'>
            <CopyField value={REDIRECT_URI} />
          </Field>
        </>
      )}

      <div className="flex gap-2 border-t border-gray-200 pt-4 dark:border-neutral-800">
        <Button
          variant="primary"
          disabled={!name || (showCustomFields && !clientId)}
          onClick={() =>
            onAdd({
              provider,
              name,
              mode,
              clientId: showCustomFields ? clientId : undefined,
            })
          }
        >
          Add client
        </Button>
        <Button variant="secondary" onClick={() => setProvider(null)}>
          Back
        </Button>
      </div>
    </div>
  );
}

function ClientConfigPanel({
  client,
  onUpdate,
  onDelete,
}: {
  client: MockClient;
  onUpdate: (patch: Partial<MockClient>) => void;
  onDelete: () => void;
}) {
  const cfg = providerCfg(client.provider);
  const [editing, setEditing] = useState(false);
  const [clientId, setClientId] = useState(client.clientId ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const code = `const url = db.auth.createAuthorizationURL({
  clientName: "${client.name}",
  redirectURL: window.location.href,
});

// <a href={url}>Log in with ${cfg.label}</a>`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <ProviderIcon id={client.provider} size={24} />
        <span className="text-sm font-medium">{client.name}</span>
        <Pill>
          {client.mode === 'dev' ? 'Instant dev keys' : 'Custom credentials'}
        </Pill>
      </div>

      <CopyField label="Client name" value={client.name} mono={false} />

      {client.mode === 'dev' ? (
        <InfoBox>
          Using Instant's shared development keys. Great for prototyping; switch
          to your own credentials before launch.
        </InfoBox>
      ) : editing ? (
        <Field label="Client ID">
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput value={clientId} onChange={setClientId} />
            </div>
            <Button
              variant="primary"
              onClick={() => {
                onUpdate({ clientId });
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </Field>
      ) : (
        <CopyField label="Client ID" value={client.clientId || ''} />
      )}

      <Field label='Redirect URI — add this to the provider console'>
        <CopyField value={REDIRECT_URI} />
      </Field>

      <Field label="Sign in from your app">
        <CodeBlock title="example" code={code} />
      </Field>

      <div className="flex items-center justify-between border-t border-gray-200 pt-4 dark:border-neutral-800">
        {client.mode === 'custom' && !editing ? (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Update credentials
          </Button>
        ) : (
          <span />
        )}
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Remove this client?</span>
            <Button variant="destructive" onClick={onDelete}>
              Delete
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

function DnsRow({
  record,
  type,
  host,
  value,
}: {
  record: string;
  type: string;
  host: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_70px_2fr] gap-2 border-b border-gray-100 px-3 py-3 text-sm last:border-b-0 dark:border-neutral-800">
      <div className="font-medium">{record}</div>
      <div className="text-gray-500 dark:text-neutral-400">{type}</div>
      <div className="flex flex-col gap-1">
        <code className="block truncate rounded-sm bg-gray-100 px-2 py-1 text-xs dark:bg-neutral-800">
          {host}
        </code>
        <code className="block truncate rounded-sm bg-gray-100 px-2 py-1 text-xs dark:bg-neutral-800">
          {value}
        </code>
      </div>
    </div>
  );
}

function EmailEditor({
  appTitle,
  email,
  onSave,
  onDelete,
}: {
  appTitle: string;
  email: MockEmail;
  onSave: (patch: Partial<MockEmail>) => void;
  onDelete: () => void;
}) {
  const [subject, setSubject] = useState(email.subject);
  const [from, setFrom] = useState(email.from);
  const [body, setBody] = useState(email.body);
  const [senderEmail, setSenderEmail] = useState(email.senderEmail);
  const [showExpiry, setShowExpiry] = useState(false);
  const [expiry, setExpiry] = useState(10);

  return (
    <div className="flex flex-col gap-4">
      <InfoBox>
        <div className="font-semibold text-gray-700 dark:text-neutral-200">
          Template variables
        </div>
        <p className="mt-1">
          Use <code className="font-mono">{'{code}'}</code>,{' '}
          <code className="font-mono">{'{app_title}'}</code> (
          {appTitle || 'your app'}), and{' '}
          <code className="font-mono">{'{user_email}'}</code> in the subject and
          body. <code className="font-mono">{'{code}'}</code> is required.
        </p>
      </InfoBox>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Subject">
          <TextInput value={subject} onChange={setSubject} />
        </Field>
        <Field label="From">
          <TextInput
            value={from}
            onChange={setFrom}
            placeholder="YourName from YourCo"
          />
        </Field>
      </div>

      <Field label="Body (HTML or plain text)">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          spellCheck={false}
          className="h-60 w-full rounded-md border border-gray-200 bg-white p-3 font-mono text-xs leading-5 text-gray-700 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
        />
      </Field>

      <div className="rounded-md border border-gray-200 bg-[#fbfaf8] p-3 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">
          Use a custom "From" address (optional)
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
          Send from your own domain to build trust with recipients.
        </p>
        <div className="mt-2">
          <TextInput
            value={senderEmail}
            onChange={setSenderEmail}
            placeholder="hi@yourdomain.co"
          />
        </div>
      </div>

      {senderEmail ? (
        <div className="rounded-md border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-neutral-800">
            <span className="text-sm font-medium">Verify {senderEmail}</span>
            <span className="text-xs text-gray-400">Pending confirmation</span>
          </div>
          <DnsRow
            record="DKIM"
            type="TXT"
            host="instant._domainkey.yourdomain.co"
            value="k=rsa; p=MIGfMA0GCSq…"
          />
          <DnsRow
            record="Return-Path"
            type="CNAME"
            host="pm-bounces.yourdomain.co"
            value="pm.mtasv.net"
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t border-gray-200 pt-4 dark:border-neutral-800">
        <Button
          variant="primary"
          onClick={() => onSave({ subject, from, body, senderEmail })}
        >
          Save template
        </Button>
        {email.customized ? (
          <Button variant="destructive" onClick={onDelete}>
            Delete template
          </Button>
        ) : null}
      </div>

      <button
        type="button"
        className="self-start text-sm text-gray-400 underline hover:text-gray-600 dark:text-neutral-500 dark:hover:text-neutral-300"
        onClick={() => setShowExpiry((s) => !s)}
      >
        Change magic code expiration
      </button>
      {showExpiry ? (
        <div className="flex flex-col gap-2">
          {[
            { label: '10 minutes', value: 10 },
            { label: '1 hour', value: 60 },
            { label: '24 hours', value: 1440 },
          ].map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-[#fbfaf8] p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950"
            >
              <input
                type="radio"
                name="expiry"
                checked={expiry === o.value}
                onChange={() => setExpiry(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const ORIGIN_KINDS: { value: OriginKind; label: string; placeholder: string }[] =
  [
    { value: 'website', label: 'Website', placeholder: 'example.com' },
    { value: 'vercel', label: 'Vercel previews', placeholder: 'my-project' },
    { value: 'netlify', label: 'Netlify previews', placeholder: 'my-site' },
    { value: 'scheme', label: 'App scheme', placeholder: 'myapp://' },
  ];

function OriginsEditor({
  model,
  actions,
}: {
  model: AuthModel;
  actions: Actions;
}) {
  const [showForm, setShowForm] = useState(model.origins.length === 0);
  const [kind, setKind] = useState<OriginKind>('website');
  const [value, setValue] = useState('');
  const placeholder =
    ORIGIN_KINDS.find((k) => k.value === kind)?.placeholder ?? '';

  return (
    <div className="flex flex-col gap-2">
      {model.origins.map((o) => (
        <div
          key={o.id}
          className="flex items-center justify-between rounded-md border border-gray-200 bg-[#fbfaf8] px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-950"
        >
          <div className="flex items-center gap-3">
            <GlobeAltIcon className="h-4 w-4 text-gray-400" />
            <div className="flex flex-col">
              <span className="text-xs text-gray-400 dark:text-neutral-500">
                {ORIGIN_KINDS.find((k) => k.value === o.kind)?.label}
              </span>
              <span className="text-sm font-medium">{o.value}</span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Remove origin"
            className="text-gray-400 hover:text-red-500"
            onClick={() => actions.removeOrigin(o.id)}
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      ))}

      {showForm ? (
        <div className="flex flex-col gap-3 rounded-md border border-gray-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as OriginKind)}
              className="rounded-md border border-gray-200 bg-white px-2 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
            >
              {ORIGIN_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <div className="flex-1">
              <TextInput
                value={value}
                onChange={setValue}
                placeholder={placeholder}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={!value}
              onClick={() => {
                actions.addOrigin({ kind, value });
                setValue('');
                setShowForm(false);
              }}
            >
              Add
            </Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setShowForm(true)}>
          <PlusIcon className="h-3.5 w-3.5" /> Add an origin
        </Button>
      )}
    </div>
  );
}

function TestUsersEditor({
  model,
  actions,
}: {
  model: AuthModel;
  actions: Actions;
}) {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('424242');
  const valid = email.trim().length > 0 && /^\d{6}$/.test(code);

  return (
    <div className="flex flex-col gap-2">
      {model.testUsers.map((u) => (
        <div
          key={u.id}
          className="flex items-center justify-between rounded-md border border-gray-200 bg-[#fbfaf8] px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-950"
        >
          <div className="flex flex-col">
            <span className="text-sm font-medium">{u.email}</span>
            <span className="font-mono text-xs text-gray-500 dark:text-neutral-400">
              code {u.code}
            </span>
          </div>
          <button
            type="button"
            aria-label="Remove test user"
            className="text-gray-400 hover:text-red-500"
            onClick={() => actions.removeTestUser(u.id)}
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      ))}

      {showForm ? (
        <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex-1">
            <TextInput
              label="Email"
              placeholder="test@example.com"
              value={email}
              onChange={setEmail}
              autoFocus
            />
          </div>
          <div className="w-32">
            <TextInput
              label="Code"
              placeholder="123456"
              value={code}
              onChange={setCode}
              error={code && !/^\d{6}$/.test(code) ? '6 digits' : undefined}
            />
          </div>
          <div className="pt-6">
            <Button
              variant="primary"
              disabled={!valid}
              onClick={() => {
                actions.addTestUser({ email: email.trim().toLowerCase(), code });
                setEmail('');
                setCode('424242');
                setShowForm(false);
              }}
            >
              Add
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setShowForm(true)}>
          <PlusIcon className="h-3.5 w-3.5" /> Add a test user
        </Button>
      )}
    </div>
  );
}

// -------------------- targets + shared renderers --------------------

// social / magic select a method's management pane; the rest are leaf editors.
type Target =
  | { kind: 'social' }
  | { kind: 'magic' }
  | { kind: 'add-client' }
  | { kind: 'client'; id: string }
  | { kind: 'email' };

function targetTitle(t: Target, model: AuthModel): string {
  switch (t.kind) {
    case 'social':
      return 'Social login';
    case 'magic':
      return 'Magic codes';
    case 'add-client':
      return 'Add a client';
    case 'client': {
      const c = model.clients.find((x) => x.id === t.id);
      return c ? `${providerCfg(c.provider).label} client` : 'Client';
    }
    case 'email':
      return 'Magic code email';
  }
}

function LeafDetail({
  target,
  appTitle,
  model,
  actions,
  onClose,
}: {
  target: Target;
  appTitle: string;
  model: AuthModel;
  actions: Actions;
  onClose: () => void;
}) {
  switch (target.kind) {
    case 'social':
    case 'magic':
      return null; // section panes are rendered by the shells, not here
    case 'add-client':
      return (
        <AddClientWizard
          onCancel={onClose}
          onAdd={(c) => {
            actions.addClient(c);
            onClose();
          }}
        />
      );
    case 'client': {
      const c = model.clients.find((x) => x.id === target.id);
      if (!c) return null;
      return (
        <ClientConfigPanel
          client={c}
          onUpdate={(patch) => actions.updateClient(c.id, patch)}
          onDelete={() => {
            actions.deleteClient(c.id);
            onClose();
          }}
        />
      );
    }
    case 'email':
      return (
        <EmailEditor
          appTitle={appTitle}
          email={model.email}
          onSave={(patch) => {
            actions.saveEmail(patch);
            onClose();
          }}
          onDelete={() => {
            actions.resetEmail();
            onClose();
          }}
        />
      );
  }
}

function socialMeta(model: AuthModel): string {
  if (model.clients.length === 0 && model.origins.length === 0)
    return 'Not set up';
  return `${model.clients.length} client${
    model.clients.length === 1 ? '' : 's'
  }, ${model.origins.length} origin${model.origins.length === 1 ? '' : 's'}`;
}
function magicMeta(model: AuthModel): string {
  return model.email.customized ? 'Custom email' : 'Default email';
}

function ClientRow({
  client,
  onOpen,
}: {
  client: MockClient;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-gray-300 hover:bg-[#fbfaf8] dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
    >
      <div className="flex items-center gap-3">
        <ProviderIcon id={client.provider} />
        <div className="flex flex-col">
          <span className="text-sm font-medium">{client.name}</span>
          <span className="text-xs text-gray-500 dark:text-neutral-400">
            {client.mode === 'dev' ? 'Instant dev keys' : client.clientId}
          </span>
        </div>
      </div>
      <ChevronRightIcon className="h-4 w-4 text-gray-400" />
    </button>
  );
}

function EmptyClients({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-gray-300 bg-[#fbfaf8] px-4 py-6 text-center dark:border-neutral-700 dark:bg-neutral-950">
      <div className="text-sm font-semibold text-gray-900 dark:text-white">
        No social logins yet
      </div>
      <div className="flex gap-2 opacity-60">
        {PROVIDERS.slice(0, 4).map((p) => (
          <ProviderIcon key={p.id} id={p.id} />
        ))}
      </div>
      <Button variant="secondary" onClick={onAdd}>
        <PlusIcon className="h-3.5 w-3.5" /> Add client
      </Button>
    </div>
  );
}

// Overview shared by drill + sheet: light leaves inline, heavy leaves trigger onOpen.
// One method's management surface. Light leaves (origins, test users) are
// inline; heavy leaves (a client, the email editor) call onOpen to drill in.
function SocialSection({
  model,
  actions,
  onOpen,
}: {
  model: AuthModel;
  actions: Actions;
  onOpen: (t: Target) => void;
}) {
  return (
    <section>
      <MethodHeading title="Social login" meta={socialMeta(model)} />
      <div className="mt-3 flex flex-col gap-2">
        {model.clients.length === 0 ? (
          <EmptyClients onAdd={() => onOpen({ kind: 'add-client' })} />
        ) : (
          <>
            {model.clients.map((c) => (
              <ClientRow
                key={c.id}
                client={c}
                onOpen={() => onOpen({ kind: 'client', id: c.id })}
              />
            ))}
            <Button
              variant="secondary"
              onClick={() => onOpen({ kind: 'add-client' })}
            >
              <PlusIcon className="h-3.5 w-3.5" /> Add client
            </Button>
          </>
        )}
      </div>
      <div className="mt-6">
        <SubLabel
          title="Redirect origins"
          helper="Allowed URLs for the OAuth redirect flow."
        />
        <OriginsEditor model={model} actions={actions} />
      </div>
    </section>
  );
}

function MagicSection({
  model,
  actions,
  onOpen,
}: {
  model: AuthModel;
  actions: Actions;
  onOpen: (t: Target) => void;
}) {
  return (
    <section>
      <MethodHeading title="Magic codes" meta={magicMeta(model)} />
      <div className="mt-3">
        <button
          type="button"
          onClick={() => onOpen({ kind: 'email' })}
          className="flex w-full items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-gray-300 hover:bg-[#fbfaf8] dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
        >
          <div className="flex flex-col">
            <span className="text-sm font-medium">Magic code email</span>
            <span className="truncate font-mono text-xs text-gray-500 dark:text-neutral-400">
              {model.email.subject}
            </span>
          </div>
          <ChevronRightIcon className="h-4 w-4 text-gray-400" />
        </button>
      </div>
      <div className="mt-6">
        <SubLabel title="Test users" helper="Codes that never expire." />
        <TestUsersEditor model={model} actions={actions} />
      </div>
    </section>
  );
}

// drill-in / sheet show both methods at once.
function OverviewBody({
  model,
  actions,
  onOpen,
}: {
  model: AuthModel;
  actions: Actions;
  onOpen: (t: Target) => void;
}) {
  return (
    <div className="flex flex-col gap-10">
      <SocialSection model={model} actions={actions} onOpen={onOpen} />
      <div className="border-t border-gray-200 dark:border-neutral-800" />
      <MagicSection model={model} actions={actions} onOpen={onOpen} />
    </div>
  );
}

function BackLink({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white"
    >
      <ChevronLeftIcon className="h-4 w-4" /> {label}
    </button>
  );
}

// -------------------- shell: drill-in --------------------

function DrillInShell({
  appTitle,
  model,
  actions,
}: {
  appTitle: string;
  model: AuthModel;
  actions: Actions;
}) {
  const [route, setRoute] = useState<Target | null>(null);

  if (route) {
    return (
      <DashPage size="default">
        <BackLink onClick={() => setRoute(null)} label="Authentication" />
        <h2 className="text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">
          {targetTitle(route, model)}
        </h2>
        <div
          key={`${route.kind}-${'id' in route ? route.id : ''}`}
          className="duration-300 animate-in fade-in slide-in-from-bottom-1"
        >
          <LeafDetail
            target={route}
            appTitle={appTitle}
            model={model}
            actions={actions}
            onClose={() => setRoute(null)}
          />
        </div>
      </DashPage>
    );
  }

  return (
    <DashPage size="default">
      <OverviewBody model={model} actions={actions} onOpen={setRoute} />
    </DashPage>
  );
}

// -------------------- shell: sheet --------------------

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-black/20 duration-200 animate-in fade-in"
        onClick={onClose}
      />
      <div className="absolute top-0 right-0 flex h-full w-full max-w-[640px] flex-col bg-[#fbfaf8] shadow-2xl duration-300 animate-in slide-in-from-right-4 dark:bg-neutral-950">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-neutral-800">
          <h3 className="text-lg font-semibold tracking-tight text-gray-950 dark:text-white">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-neutral-200"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function SheetShell({
  appTitle,
  model,
  actions,
}: {
  appTitle: string;
  model: AuthModel;
  actions: Actions;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  return (
    <>
      <DashPage size="default">
        <OverviewBody model={model} actions={actions} onOpen={setTarget} />
      </DashPage>
      {target ? (
        <Sheet
          title={targetTitle(target, model)}
          onClose={() => setTarget(null)}
        >
          <LeafDetail
            target={target}
            appTitle={appTitle}
            model={model}
            actions={actions}
            onClose={() => setTarget(null)}
          />
        </Sheet>
      ) : null}
    </>
  );
}

// -------------------- shell: master-detail --------------------

function parentSection(t: Target): Target {
  return t.kind === 'email' ? { kind: 'magic' } : { kind: 'social' };
}

function sameTarget(a: Target, b: Target | null): boolean {
  if (!b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'client' && b.kind === 'client') return a.id === b.id;
  return true;
}

// The detail pane for the rail shells: a method's management surface, or a leaf
// editor with a back link up to its parent method.
function MethodPane({
  selected,
  onSelect,
  model,
  actions,
  appTitle,
}: {
  selected: Target;
  onSelect: (t: Target) => void;
  model: AuthModel;
  actions: Actions;
  appTitle: string;
}) {
  if (selected.kind === 'social') {
    return <SocialSection model={model} actions={actions} onOpen={onSelect} />;
  }
  if (selected.kind === 'magic') {
    return <MagicSection model={model} actions={actions} onOpen={onSelect} />;
  }
  const parent = parentSection(selected);
  return (
    <div className="flex flex-col gap-4">
      <BackLink
        label={targetTitle(parent, model)}
        onClick={() => onSelect(parent)}
      />
      <h2 className="text-lg font-semibold tracking-tight text-gray-950 dark:text-white">
        {targetTitle(selected, model)}
      </h2>
      <LeafDetail
        target={selected}
        appTitle={appTitle}
        model={model}
        actions={actions}
        onClose={() => onSelect(parent)}
      />
    </div>
  );
}

function railSectionCls(active: boolean) {
  return cn(
    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
    active
      ? 'bg-gray-200/70 font-semibold text-gray-950 dark:bg-neutral-800 dark:text-white'
      : 'font-medium text-gray-700 hover:bg-gray-200/40 dark:text-neutral-300 dark:hover:bg-neutral-900',
  );
}

function railSubCls(active: boolean) {
  return cn(
    'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors',
    active
      ? 'bg-gray-200/70 font-medium text-gray-950 dark:bg-neutral-800 dark:text-white'
      : 'text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white',
  );
}

// Shared rail body: the two methods, with clients nested under social.
function AuthRailItems({
  selected,
  onSelect,
  model,
}: {
  selected: Target;
  onSelect: (t: Target) => void;
  model: AuthModel;
}) {
  const socialActive =
    selected.kind === 'social' ||
    selected.kind === 'add-client' ||
    selected.kind === 'client';
  const magicActive = selected.kind === 'magic' || selected.kind === 'email';
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        className={railSectionCls(socialActive)}
        onClick={() => onSelect({ kind: 'social' })}
      >
        <IdentificationIcon className="h-4 w-4" />
        <span className="truncate">Social login</span>
      </button>
      <div className="mb-1 ml-[1.4rem] flex flex-col gap-0.5 border-l border-gray-200 pl-1.5 dark:border-neutral-800">
        {model.clients.map((c) => (
          <button
            key={c.id}
            type="button"
            className={railSubCls(
              sameTarget({ kind: 'client', id: c.id }, selected),
            )}
            onClick={() => onSelect({ kind: 'client', id: c.id })}
          >
            <span className="flex h-4 w-4 items-center justify-center">
              <ProviderIcon id={c.provider} size={14} />
            </span>
            <span className="truncate">{c.name}</span>
          </button>
        ))}
        <button
          type="button"
          className={railSubCls(selected.kind === 'add-client')}
          onClick={() => onSelect({ kind: 'add-client' })}
        >
          <span className="flex h-4 w-4 items-center justify-center">
            <PlusIcon className="h-3.5 w-3.5" />
          </span>
          <span>Add client</span>
        </button>
      </div>
      <button
        type="button"
        className={railSectionCls(magicActive)}
        onClick={() => onSelect({ kind: 'magic' })}
      >
        <EnvelopeIcon className="h-4 w-4" />
        <span className="truncate">Magic codes</span>
      </button>
    </div>
  );
}

function MasterDetailShell({
  appTitle,
  model,
  actions,
}: {
  appTitle: string;
  model: AuthModel;
  actions: Actions;
}) {
  const [selected, setSelected] = useState<Target>({ kind: 'social' });
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 max-h-screen w-60 shrink-0 self-start overflow-auto border-r border-gray-200 bg-[#fbfaf8] p-3 dark:border-neutral-800 dark:bg-neutral-950">
        <AuthRailItems
          selected={selected}
          onSelect={setSelected}
          model={model}
        />
      </aside>
      <main className="min-w-0 flex-1 px-6 py-6 md:px-8">
        <div className="mx-auto max-w-2xl">
          <div
            key={`${selected.kind}-${'id' in selected ? selected.id : ''}`}
            className="duration-200 animate-in fade-in"
          >
            <MethodPane
              selected={selected}
              onSelect={setSelected}
              model={model}
              actions={actions}
              appTitle={appTitle}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

// -------------------- shell: merged nav --------------------
// The auth sub-tree lives inside the global left nav (Auth expanded), so there
// is a single rail instead of nav-rail + master-rail. The content area is the
// detail pane. Reuses the same overview/leaf content as master-detail.

const GLOBAL_TABS: { id: string; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <HomeIcon className="h-3.5 w-3.5" /> },
  {
    id: 'explorer',
    label: 'Explorer',
    icon: <FunnelIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'schema',
    label: 'Schema',
    icon: <CodeBracketIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'perms',
    label: 'Permissions',
    icon: <LockClosedIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'auth',
    label: 'Auth',
    icon: <IdentificationIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'repl',
    label: 'Query Inspector',
    icon: <MagnifyingGlassIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    icon: <BoltIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'sandbox',
    label: 'Sandbox',
    icon: <BeakerIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: <ShieldCheckIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: <CreditCardIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'oauth-apps',
    label: 'OAuth Apps',
    icon: <CubeIcon className="h-3.5 w-3.5" />,
  },
];

function MergedNav({
  model,
  selected,
  onSelect,
}: {
  model: AuthModel;
  selected: Target;
  onSelect: (t: Target) => void;
}) {
  return (
    <nav className="sticky top-0 max-h-screen w-56 shrink-0 self-start overflow-auto border-r border-gray-200 bg-[#fbfaf8] p-2 dark:border-neutral-800 dark:bg-neutral-950">
      {GLOBAL_TABS.map((tab) => {
        if (tab.id !== 'auth') {
          return (
            <div
              key={tab.id}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-500 dark:text-neutral-400"
            >
              {tab.icon}
              <span>{tab.label}</span>
            </div>
          );
        }
        return (
          <div key="auth" className="my-0.5">
            <div className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-950 shadow-xs dark:bg-neutral-900 dark:text-white">
              {tab.icon}
              <span>Auth</span>
            </div>
            <div className="mt-1 mb-1 ml-[1.4rem] border-l border-gray-200 pl-1.5 dark:border-neutral-800">
              <AuthRailItems
                selected={selected}
                onSelect={onSelect}
                model={model}
              />
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function MergedNavShell({
  appTitle,
  model,
  actions,
}: {
  appTitle: string;
  model: AuthModel;
  actions: Actions;
}) {
  const [selected, setSelected] = useState<Target>({ kind: 'social' });
  return (
    <div className="flex min-h-full">
      <MergedNav model={model} selected={selected} onSelect={setSelected} />
      <main className="min-w-0 flex-1 px-6 py-6 md:px-8">
        <div className="mx-auto max-w-2xl">
          <div
            key={`${selected.kind}-${'id' in selected ? selected.id : ''}`}
            className="duration-200 animate-in fade-in"
          >
            <MethodPane
              selected={selected}
              onSelect={setSelected}
              model={model}
              actions={actions}
              appTitle={appTitle}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

// -------------------- entry --------------------

export function AuthFlows({
  idea,
  appTitle,
}: {
  idea: FlowIdea;
  appTitle: string;
}) {
  const { model, actions } = useAuthModel();
  if (idea === 'merged') {
    return (
      <MergedNavShell appTitle={appTitle} model={model} actions={actions} />
    );
  }
  if (idea === 'master') {
    return (
      <MasterDetailShell appTitle={appTitle} model={model} actions={actions} />
    );
  }
  if (idea === 'sheet') {
    return <SheetShell appTitle={appTitle} model={model} actions={actions} />;
  }
  return <DrillInShell appTitle={appTitle} model={model} actions={actions} />;
}
