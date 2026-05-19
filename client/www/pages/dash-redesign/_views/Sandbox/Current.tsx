import { useEffect, useMemo, useState } from 'react';
import { init } from '@instantdb/react';

import config from '@/lib/config';
import { InstantApp } from '@/lib/types';
import { useSchemaQuery } from '@/lib/hooks/explorer';
import { useReadyRouter } from '@/components/clientOnlyPage';
import { Sandbox } from '@/components/dash/Sandbox';

import { DashShell } from '../_shared';
import { useEphemeralApp } from '../_ephemeral';

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

function SandboxOnSandbox({
  ephemeralId,
  ephemeralAdminToken,
}: {
  ephemeralId: string;
  ephemeralAdminToken: string;
}) {
  const app = useMemo(
    () => asInstantApp(ephemeralId, ephemeralAdminToken),
    [ephemeralId, ephemeralAdminToken],
  );

  // Strip any ?webhook= left over from the Webhooks view so it doesn't
  // interfere with Sandbox's own URL state.
  const router = useReadyRouter();
  useEffect(() => {
    if ('webhook' in router.query) {
      const next = { ...router.query };
      delete next.webhook;
      router.replace({ pathname: router.pathname, query: next }, undefined, {
        shallow: true,
      });
    }
  }, []);

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

  if (!db) {
    return (
      <DashShell active="sandbox" app={app}>
        <div className="p-4 text-sm text-gray-500">Connecting…</div>
      </DashShell>
    );
  }

  return <SandboxWithSchema app={app} db={db} />;
}

function SandboxWithSchema({
  app,
  db,
}: {
  app: InstantApp;
  db: ReturnType<typeof init>;
}) {
  const { attrs, namespaces } = useSchemaQuery(db);

  return (
    <DashShell active="sandbox" app={app}>
      <div className="flex min-h-0 flex-1 flex-col">
        <Sandbox app={app} db={db} attrs={attrs} namespaces={namespaces} />
      </div>
    </DashShell>
  );
}

export function Current() {
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
    <SandboxOnSandbox
      ephemeralId={ephemeral.app.id}
      ephemeralAdminToken={ephemeral.app.adminToken}
    />
  );
}
