import { useEffect, useState } from 'react';
import { init } from '@instantdb/react';
import config from '@/lib/config';
import { InstantApp } from '@/lib/types';
import { QueryInspector } from '@/components/dash/explorer/QueryInspector';
import { useSchemaQuery } from '@/lib/hooks/explorer';
import { DashShell } from '../_shared';
import { useEphemeralApp, EphemeralApp } from '../_ephemeral';

type InstantReactClient = ReturnType<typeof init>;

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

function QueryInspectorBody({
  ephApp,
  db,
}: {
  ephApp: EphemeralApp;
  db: InstantReactClient;
}) {
  const { namespaces, attrs } = useSchemaQuery(db);
  const app = asInstantApp(ephApp.id, ephApp.adminToken);

  return (
    <DashShell active="repl" app={app}>
      <QueryInspector
        className="w-full flex-1"
        appId={ephApp.id}
        db={db}
        namespaces={namespaces}
        attrs={attrs}
      />
    </DashShell>
  );
}

export function Current() {
  const ephemeral = useEphemeralApp();
  const [db, setDb] = useState<InstantReactClient | null>(null);

  useEffect(() => {
    if (ephemeral.status !== 'ready') return;
    if (typeof window === 'undefined') return;

    const next = init({
      appId: ephemeral.app.id,
      apiURI: config.apiURI,
      websocketURI: config.websocketURI,
      // @ts-expect-error - admin token connection, same as the real dashboard
      __adminToken: ephemeral.app.adminToken,
      disableValidation: true,
    });
    setDb(next);
    return () => {
      next.core.shutdown();
      setDb(null);
    };
  }, [
    ephemeral.status === 'ready' ? ephemeral.app.id : null,
    ephemeral.status === 'ready' ? ephemeral.app.adminToken : null,
  ]);

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

  if (!db) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-sm text-gray-600 dark:text-neutral-400">
        Connecting…
      </div>
    );
  }

  return <QueryInspectorBody ephApp={ephemeral.app} db={db} />;
}
