import { ReactNode, useEffect, useState } from 'react';
import {
  ActionForm,
  Button,
  Checkbox,
  Content,
  Dialog,
  Label,
  Select,
  TextInput,
  cn,
} from '@/components/ui';
import {
  DashShell,
  EphemeralError,
  EphemeralLoading,
  useEphemeralInstantApp,
} from '../_shared';
import { AdminRamsSubState } from './index';

type Role = 'owner' | 'admin' | 'collaborator';
type Member = { id: string; email: string; role: Role };

const MEMBERS: Member[] = [
  { id: 'me', email: 'sto.pa@instantdb.com', role: 'owner' },
  { id: '2', email: 'admin@example.com', role: 'admin' },
  { id: '1', email: 'collab@example.com', role: 'collaborator' },
];

const PENDING = [{ id: 'i1', email: 'pending@example.com', role: 'collaborator' }];

const roleLabel: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  collaborator: 'Collaborator',
};

type Actions = {
  invite: () => void;
  edit: () => void;
  clear: () => void;
  remove: () => void;
};

// ---------------------------------------------------------------------------
// Controls — the functional pieces, no chrome
// ---------------------------------------------------------------------------

function TextButton({
  onClick,
  children,
  className,
}: {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-[13px] text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  );
}

function TokenControl({ token }: { token: string }) {
  const [hidden, setHidden] = useState(true);
  const [copied, setCopied] = useState(false);
  const shown = hidden ? token.replace(/[^-]/g, '•') : token;
  return (
    <div className="max-w-xl">
      <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <code className="min-w-0 flex-1 truncate px-3 py-2.5 font-mono text-[13px] text-neutral-800 dark:text-neutral-200">
          {shown}
        </code>
        <button
          type="button"
          onClick={() => setHidden((v) => !v)}
          className="border-l border-neutral-200 px-3 text-[13px] text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {hidden ? 'Reveal' : 'Hide'}
        </button>
        <button
          type="button"
          onClick={() => {
            window.navigator.clipboard.writeText(token);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="border-l border-neutral-200 px-3 text-[13px] text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <TextButton className="mt-2">Regenerate token</TextButton>
    </div>
  );
}

function NameControl({ title }: { title: string }) {
  const [name, setName] = useState(title);
  return (
    <form
      className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="flex-1">
        <TextInput value={name} onChange={setName} placeholder="My app" />
      </div>
      <Button variant="secondary">Save</Button>
    </form>
  );
}

function MembersControl({
  table,
  actions,
}: {
  table?: boolean;
  actions: Actions;
}) {
  if (table) {
    return (
      <div className="max-w-2xl">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-700">
              <th className="py-2 font-normal">Email</th>
              <th className="py-2 font-normal">Role</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {MEMBERS.map((m) => (
              <tr
                key={m.id}
                className="border-b border-neutral-100 dark:border-neutral-800"
              >
                <td className="py-2.5 text-neutral-900 dark:text-neutral-100">
                  {m.email}
                </td>
                <td className="py-2.5 text-neutral-500 dark:text-neutral-400">
                  {roleLabel[m.role]}
                </td>
                <td className="py-2.5 text-right">
                  {m.role !== 'owner' ? (
                    <TextButton onClick={actions.edit}>Edit</TextButton>
                  ) : null}
                </td>
              </tr>
            ))}
            {PENDING.map((i) => (
              <tr
                key={i.id}
                className="border-b border-neutral-100 dark:border-neutral-800"
              >
                <td className="py-2.5 text-neutral-500 dark:text-neutral-400">
                  {i.email}
                </td>
                <td className="py-2.5 text-neutral-400">Pending</td>
                <td className="py-2.5 text-right">
                  <TextButton>Revoke</TextButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3">
          <Button variant="secondary" size="mini" onClick={actions.invite}>
            Invite
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <div>
        {MEMBERS.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-4 border-t border-neutral-100 py-2.5 first:border-t-0 dark:border-neutral-800"
          >
            <div className="min-w-0 truncate text-sm text-neutral-900 dark:text-neutral-100">
              {m.email}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[13px] text-neutral-500 dark:text-neutral-400">
                {roleLabel[m.role]}
              </span>
              {m.role !== 'owner' ? (
                <Button variant="secondary" size="mini" onClick={actions.edit}>
                  Edit
                </Button>
              ) : (
                <span className="w-[42px]" />
              )}
            </div>
          </div>
        ))}
        {PENDING.map((i) => (
          <div
            key={i.id}
            className="flex items-center justify-between gap-4 border-t border-neutral-100 py-2.5 dark:border-neutral-800"
          >
            <div className="min-w-0 truncate text-sm text-neutral-500 dark:text-neutral-400">
              {i.email}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[13px] text-neutral-400">Pending</span>
              <Button variant="secondary" size="mini">
                Revoke
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Button variant="secondary" onClick={actions.invite}>
          Invite
        </Button>
      </div>
    </div>
  );
}

function TransferControl() {
  const [org, setOrg] = useState('my-new-org');
  return (
    <div className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1">
        <Label>Destination organization</Label>
        <Select
          value={org}
          onChange={(o) => o && setOrg(o.value)}
          options={[
            { value: 'my-new-org', label: 'my-new-org' },
            { value: 'side-projects', label: 'side-projects' },
          ]}
        />
      </div>
      <Button variant="secondary">Transfer</Button>
    </div>
  );
}

function DangerControl({ actions }: { actions: Actions }) {
  return (
    <div className="max-w-xl divide-y divide-neutral-100 dark:divide-neutral-800">
      <div className="flex items-center justify-between gap-6 py-3 first:pt-0">
        <div className="min-w-0">
          <div className="text-sm text-neutral-900 dark:text-neutral-100">
            Clear app
          </div>
          <div className="text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
            Deletes all data. Keeps the app, keys, and members.
          </div>
        </div>
        <Button variant="secondary" onClick={actions.clear}>
          Clear
        </Button>
      </div>
      <div className="flex items-center justify-between gap-6 py-3">
        <div className="min-w-0">
          <div className="text-sm text-neutral-900 dark:text-neutral-100">
            Delete app
          </div>
          <div className="text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
            Permanently deletes this app and all its data.
          </div>
        </div>
        <Button variant="destructive" onClick={actions.remove}>
          Delete
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections — shared definition, rendered differently per layout
// ---------------------------------------------------------------------------

type SectionDef = {
  id: string;
  label: string;
  hint?: string;
  content: ReactNode;
};

function buildSections(
  app: { admin_token: string; title: string },
  actions: Actions,
  table?: boolean,
): SectionDef[] {
  return [
    {
      id: 'token',
      label: 'Admin token',
      hint: 'Use only on the server.',
      content: <TokenControl token={app.admin_token} />,
    },
    { id: 'name', label: 'Name', content: <NameControl title={app.title} /> },
    {
      id: 'members',
      label: 'Members',
      hint: 'People with access to this app.',
      content: <MembersControl table={table} actions={actions} />,
    },
    {
      id: 'transfer',
      label: 'Transfer',
      hint: 'Move this app to another organization.',
      content: <TransferControl />,
    },
    {
      id: 'danger',
      label: 'Danger zone',
      content: <DangerControl actions={actions} />,
    },
  ];
}

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

function ListLayout({ sections }: { sections: SectionDef[] }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
      {sections.map((s) => (
        <section
          key={s.id}
          className="grid gap-x-10 gap-y-3 border-neutral-200 py-9 first:pt-0 md:grid-cols-[11rem_minmax(0,1fr)] dark:border-neutral-800 [&:not(:first-child)]:border-t"
        >
          <div className="md:pt-0.5">
            <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
              {s.label}
            </h3>
            {s.hint ? (
              <p className="mt-1 text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
                {s.hint}
              </p>
            ) : null}
          </div>
          <div>{s.content}</div>
        </section>
      ))}
    </div>
  );
}

function SplitLayout({ sections }: { sections: SectionDef[] }) {
  const [active, setActive] = useState(sections[0].id);
  const current = sections.find((s) => s.id === active) ?? sections[0];
  return (
    <div className="mx-auto flex w-full max-w-4xl">
      <nav className="w-48 shrink-0 border-r border-neutral-200 px-3 py-8 dark:border-neutral-800">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActive(s.id)}
            className={cn(
              'block w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
              active === s.id
                ? 'bg-white font-medium text-neutral-900 shadow-xs dark:bg-neutral-900 dark:text-white'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white',
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 px-8 py-9">
        <h3 className="text-sm font-medium text-neutral-900 dark:text-white">
          {current.label}
        </h3>
        {current.hint ? (
          <p className="mt-1 text-[13px] leading-5 text-neutral-500 dark:text-neutral-400">
            {current.hint}
          </p>
        ) : null}
        <div className="mt-5">{current.content}</div>
      </div>
    </div>
  );
}

function TableLayout({ sections }: { sections: SectionDef[] }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8 md:px-8">
      {sections.map((s) => (
        <section
          key={s.id}
          className="border-neutral-200 py-6 first:pt-0 dark:border-neutral-800 [&:not(:first-child)]:border-t"
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
              {s.label}
            </h3>
            {s.hint ? (
              <span className="text-[13px] text-neutral-400">{s.hint}</span>
            ) : null}
          </div>
          {s.content}
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function EditMemberDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog title="Edit member" open={open} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="text-sm text-neutral-600 dark:text-neutral-300">
          collab@example.com · Collaborator
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" className="flex-1">
            Promote to admin
          </Button>
          <Button variant="destructive" className="flex-1">
            Remove
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function InviteMemberDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'collaborator'>('collaborator');
  return (
    <Dialog title="Invite member" open={open} onClose={onClose}>
      <ActionForm className="flex flex-col gap-4">
        <TextInput
          label="Email"
          type="email"
          size="large"
          value={email}
          onChange={setEmail}
        />
        <div className="flex flex-col gap-1">
          <Label>Role</Label>
          <Select
            size="lg"
            value={role}
            onChange={(o) => o && setRole(o.value as 'admin' | 'collaborator')}
            options={[
              { value: 'admin', label: 'Admin' },
              { value: 'collaborator', label: 'Collaborator' },
            ]}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" size="large" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="large" disabled={!email}>
            Invite
          </Button>
        </div>
      </ActionForm>
    </Dialog>
  );
}

function ConfirmDialog({
  open,
  onClose,
  title,
  cta,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  cta: string;
  children: ReactNode;
}) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!open) setOk(false);
  }, [open]);
  return (
    <Dialog title={title} open={open} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Content className="text-sm">{children}</Content>
        <Checkbox checked={ok} onChange={setOk} label="I understand this can't be undone." />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="large" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" size="large" disabled={!ok}>
            {cta}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function Current({ sub = 'list' }: { sub?: AdminRamsSubState }) {
  const ephemeral = useEphemeralInstantApp();
  const [dialog, setDialog] = useState<
    null | 'invite' | 'edit' | 'clear' | 'delete'
  >(null);

  if (ephemeral.status === 'loading') return <EphemeralLoading />;
  if (ephemeral.status === 'error') {
    return <EphemeralError error={ephemeral.error} reset={ephemeral.reset} />;
  }
  const app = ephemeral.app;
  const close = () => setDialog(null);
  const actions: Actions = {
    invite: () => setDialog('invite'),
    edit: () => setDialog('edit'),
    clear: () => setDialog('clear'),
    remove: () => setDialog('delete'),
  };

  return (
    <DashShell active="admin" app={app}>
      <AdminRamsContent sub={sub} app={app} actions={actions} />
      <EditMemberDialog open={dialog === 'edit'} onClose={close} />
      <InviteMemberDialog open={dialog === 'invite'} onClose={close} />
      <ConfirmDialog
        open={dialog === 'clear'}
        onClose={close}
        title="Clear app"
        cta="Clear data"
      >
        Deletes all namespaces, triples, and permissions. The app id, admin
        token, users, billing, and members stay.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={close}
        title="Delete app"
        cta="Delete"
      >
        Permanently deletes this app and everything in it.
      </ConfirmDialog>
    </DashShell>
  );
}

function AdminRamsContent({
  sub,
  app,
  actions,
}: {
  sub: AdminRamsSubState;
  app: { admin_token: string; title: string };
  actions: Actions;
}) {
  const sections = buildSections(app, actions, sub === 'table');
  if (sub === 'split') return <SplitLayout sections={sections} />;
  if (sub === 'table') return <TableLayout sections={sections} />;
  return <ListLayout sections={sections} />;
}
