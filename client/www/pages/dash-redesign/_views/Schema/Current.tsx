import { useEffect, useState } from 'react';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { Monaco } from '@monaco-editor/react';
import { init } from '@instantdb/react';
import {
  apiSchemaToInstantSchemaDef,
  generateSchemaTypescriptFile,
} from '@instantdb/platform';

import {
  CodeEditor,
  Fence,
  Label,
  SectionHeading,
  Select,
} from '@/components/ui';
import { DBAttr, InstantApp } from '@/lib/types';
import config from '@/lib/config';
import { attrsToSchema } from '@/lib/schema';
import { addInstantLibs } from '@/lib/monaco';
import { useSchemaQuery } from '@/lib/hooks/explorer';
import { useDarkMode } from '@/components/dash/DarkModeToggle';
import { DashShell, useFetchedDash } from '../_shared';

type InstantReactClient = ReturnType<typeof init>;

type Pkg =
  | '@instantdb/core'
  | '@instantdb/react'
  | '@instantdb/react-native'
  | '@instantdb/admin';

function attrsToTsFile(attrs: Record<string, DBAttr>, pkg: Pkg) {
  const schema = apiSchemaToInstantSchemaDef(
    attrsToSchema(Object.values(attrs)),
  );
  return generateSchemaTypescriptFile(schema, schema, pkg);
}

function SchemaContent({ attrs }: { attrs: Record<string, DBAttr> | null }) {
  const [pkg, setPkg] = useState<Pkg>('@instantdb/core');
  const { darkMode } = useDarkMode();

  const onMount = (_editor: any, monaco: Monaco) => {
    addInstantLibs(monaco);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 flex-col gap-4 border-r border-gray-200 bg-white p-5 text-sm lg:basis-96 dark:border-r-neutral-800 dark:bg-neutral-950">
        <SectionHeading>Schema</SectionHeading>
        <p>This is the schema for your app in code form.</p>
        <p>
          We recommend you use the{' '}
          <code className="tracking-tight">instant-cli</code> to push and pull
          changes to your schema:
        </p>
        <div className="overflow-auto rounded-md border border-gray-200 bg-[#fbfaf8] text-sm dark:border-neutral-800 dark:bg-neutral-900">
          <Fence
            darkMode={darkMode}
            copyable
            className="border-none!"
            code={`npx instant-cli@latest pull`}
            language="bash"
            style={{ paddingRight: 96 }}
          />
        </div>
        <p>
          <a
            className="flex items-baseline gap-1 underline"
            target="_blank"
            href="https://www.instantdb.com/docs/modeling-data#schema-as-code"
          >
            Learn more in the docs
            <ArrowTopRightOnSquareIcon className="h-3 w-3" />
          </a>
        </p>
      </div>
      <div className="flex w-full flex-1 flex-col justify-start">
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-2 dark:border-b-neutral-800 dark:bg-neutral-950">
          <div className="font-mono text-sm">instant.schema.ts</div>
          <div className="flex items-center gap-2">
            <Label>Package</Label>
            <Select
              value={pkg}
              options={[
                { label: '@instantdb/core', value: '@instantdb/core' },
                { label: '@instantdb/react', value: '@instantdb/react' },
                {
                  label: '@instantdb/react-native',
                  value: '@instantdb/react-native',
                },
                { label: '@instantdb/admin', value: '@instantdb/admin' },
              ]}
              onChange={(o) => {
                if (o) setPkg(o.value as Pkg);
              }}
            />
          </div>
        </div>
        <div className="grow">
          <CodeEditor
            darkMode={darkMode}
            readOnly={true}
            onChange={() => null}
            language="typescript"
            value={
              attrs ? attrsToTsFile(attrs, pkg) : '/* Loading schema... */'
            }
            onMount={onMount}
          />
        </div>
      </div>
    </div>
  );
}

function SchemaWithConnection({
  app,
  db,
}: {
  app: InstantApp;
  db: InstantReactClient;
}) {
  const { attrs } = useSchemaQuery(db);
  return (
    <DashShell active="schema" app={app}>
      <SchemaContent attrs={attrs} />
    </DashShell>
  );
}

export function Current() {
  const dashResponse = useFetchedDash();
  const app = dashResponse.data.apps[0];
  const [db, setDb] = useState<InstantReactClient | null>(null);

  useEffect(() => {
    if (!app) return;
    if (typeof window === 'undefined') return;

    const next = init({
      appId: app.id,
      apiURI: config.apiURI,
      websocketURI: config.websocketURI,
      // @ts-expect-error - dashboard uses admin token under the hood
      __adminToken: app.admin_token,
      disableValidation: true,
    });
    setDb(next);
    return () => {
      next.core.shutdown();
      setDb(null);
    };
  }, [app?.id, app?.admin_token]);

  if (!app) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-4 text-center">
        <div className="max-w-sm">
          <p className="mb-4 text-sm text-gray-700 dark:text-neutral-300">
            You don't have any apps yet. Create one on the real dashboard, then
            come back.
          </p>
          <a
            href="/dash"
            className="text-sm text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
          >
            Go to /dash
          </a>
        </div>
      </div>
    );
  }

  if (!db) {
    return (
      <DashShell active="schema" app={app}>
        <div className="p-4 text-sm text-gray-500">Connecting…</div>
      </DashShell>
    );
  }

  return <SchemaWithConnection app={app} db={db} />;
}
