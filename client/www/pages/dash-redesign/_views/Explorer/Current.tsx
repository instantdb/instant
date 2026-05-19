import { useEffect } from 'react';
import { Explorer, ExplorerDialog, ExplorerNav } from '@instantdb/components';
import config from '@/lib/config';
import { InstantApp } from '@/lib/types';
import { useExplorerState } from '@/lib/hooks/useExplorerState';
import { DashShell } from '../_shared';
import { useEphemeralApp } from '../_ephemeral';
import { ExplorerSubState } from './index';

function navFor(
  sub: ExplorerSubState,
  firstTodoId: string,
  firstTodoAttrId: string,
): ExplorerNav {
  const namespace = sub === 'files' ? '$files' : 'todos';
  let dialog: ExplorerDialog | undefined;
  switch (sub) {
    case 'add-row':
      dialog = { type: 'add-row' };
      break;
    case 'edit-row':
      dialog = { type: 'edit-row', rowId: firstTodoId };
      break;
    case 'edit-schema':
      dialog = { type: 'edit-schema', screen: { kind: 'main' } };
      break;
    case 'edit-schema-rename':
      dialog = { type: 'edit-schema', screen: { kind: 'rename' } };
      break;
    case 'edit-schema-add-data':
      dialog = {
        type: 'edit-schema',
        screen: { kind: 'add-attr', attrKind: 'data' },
      };
      break;
    case 'edit-schema-add-link':
      dialog = {
        type: 'edit-schema',
        screen: { kind: 'add-attr', attrKind: 'link' },
      };
      break;
    case 'edit-schema-edit-attr':
      dialog = {
        type: 'edit-schema',
        screen: {
          kind: 'edit-attr',
          attrId: firstTodoAttrId,
          isForward: true,
        },
      };
      break;
    case 'new-namespace':
      dialog = { type: 'new-namespace' };
      break;
    case 'recently-deleted-ns':
      dialog = { type: 'recently-deleted-ns' };
      break;
    case 'files':
    case 'todos':
      break;
  }
  return { namespace, ...(dialog && { dialog }) };
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

export function Current({ sub }: { sub: ExplorerSubState }) {
  const ephemeral = useEphemeralApp();
  const [explorerState, setExplorerState] = useExplorerState();
  const firstTodoId =
    ephemeral.status === 'ready' ? ephemeral.app.firstTodoId : null;
  const firstTodoAttrId =
    ephemeral.status === 'ready' ? ephemeral.app.firstTodoAttrId : null;

  useEffect(() => {
    if (!firstTodoId || firstTodoAttrId === null) return;
    setExplorerState(navFor(sub, firstTodoId, firstTodoAttrId));
  }, [sub, firstTodoId, firstTodoAttrId, setExplorerState]);

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
        <button
          type="button"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          onClick={ephemeral.reset}
        >
          Try again
        </button>
      </div>
    );
  }

  const app = asInstantApp(ephemeral.app.id, ephemeral.app.adminToken);

  return (
    <DashShell active="explorer" app={app}>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Explorer
          useShadowDOM={false}
          explorerState={explorerState}
          setExplorerState={setExplorerState}
          apiURI={config.apiURI}
          websocketURI={config.websocketURI}
          darkMode={false}
          appId={app.id}
          adminToken={app.admin_token}
        />
      </div>
    </DashShell>
  );
}
