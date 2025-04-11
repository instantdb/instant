import { useRouter } from 'next/router';
import config from '../config';
import {
  EntitiesDef,
  init,
  InstantReactAbstractDatabase,
  InstantSchemaDef,
  LinksDef,
} from '@instantdb/react';
import { useEffect, useState } from 'react';
import { RoomsDef, TransactionChunk } from '../../../packages/core/dist/module';
import { IContainEntitiesAndLinks } from '../../../packages/core/dist/module/schemaTypes';

async function provisionEphemeralApp({
  perms,
  schema,
  onCreateApp,
}: {
  perms?: any;
  schema?: InstantSchemaDef<any, any, any>;
  onCreateApp?: (
    db: InstantReactAbstractDatabase<InstantSchemaDef<any, any, any>>,
  ) => Promise<void>;
}) {
  const body: any = { title: 'Example app' };
  if (perms) {
    body.rules = { code: perms };
  }
  if (schema) {
    body.schema = schema;
  }
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const res = await r.json();

  if (res.app && onCreateApp) {
    const db = init({ ...config, appId: res.app.id, schema: schema });
    onCreateApp(db);
  }

  return res;
}

async function verifyEphemeralApp({ appId }: { appId: string }) {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral/${appId}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return r.json();
}

function AppPage<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
  Rooms extends RoomsDef,
>({
  urlAppId,
  schema,
  perms,
  onCreateApp,
  Component,
}: {
  urlAppId: string | undefined;
  schema?: InstantSchemaDef<Entities, Links, Rooms>;
  perms?: any;
  onCreateApp?: (
    db: InstantReactAbstractDatabase<InstantSchemaDef<Entities, Links, Rooms>>,
  ) => Promise<void>;
  txChunks?: TransactionChunk<
    IContainEntitiesAndLinks<Entities, Links>,
    keyof Entities
  >[];
  Component: React.ComponentType<{
    db: InstantReactAbstractDatabase<InstantSchemaDef<Entities, Links, Rooms>>;
    appId: string;
  }>;
}) {
  const router = useRouter();
  const [appId, setAppId] = useState();
  const [error, setError] = useState<string | null>(null);

  const provisionApp = async () => {
    try {
      const res = await provisionEphemeralApp({ schema, perms, onCreateApp });

      if (res.app) {
        router.replace({
          pathname: router.pathname,
          query: { ...router.query, app: res.app.id },
        });

        setAppId(res.app.id);
      } else {
        console.log(res);
        setError('Could not create app.');
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (urlAppId) {
      verifyEphemeralApp({ appId: urlAppId }).then((res): any => {
        if (res.app) {
          setAppId(res.app.id);
        } else {
          provisionApp();
        }
      });
    } else {
      provisionApp();
    }
  }, [urlAppId]);

  if (error) {
    return (
      <div>
        <p>There was an error</p>
        <p>{error}</p>
      </div>
    );
  }

  if (!appId) {
    return <div>Loading...</div>;
  }

  const db = init({ ...config, schema, appId });

  console.log(Component);

  return <Component key={appId} db={db} appId={appId} />;
}

function Page<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
  Rooms extends RoomsDef,
>({
  schema,
  perms,
  onCreateApp,
  Component,
}: {
  schema?: InstantSchemaDef<Entities, Links, Rooms>;
  perms?: any;
  onCreateApp?: (
    db: InstantReactAbstractDatabase<InstantSchemaDef<Entities, Links, Rooms>>,
  ) => Promise<void>;
  Component: React.ComponentType<{
    db: InstantReactAbstractDatabase<InstantSchemaDef<Entities, Links, Rooms>>;
    appId: string;
  }>;
}) {
  const router = useRouter();
  if (router.isReady) {
    return (
      <AppPage
        schema={schema}
        perms={perms}
        onCreateApp={onCreateApp}
        Component={Component}
        urlAppId={router.query.app as string}
      />
    );
  } else {
    return <div>Loading...</div>;
  }
}

export default Page;

export function ResetButton({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  if (!router.isReady) {
    return null;
  }
  return (
    <button
      className={className}
      onClick={() => {
        router.push({
          ...router,
          query: { ...router.query, app: undefined },
        });
      }}
    >
      {label || 'Start over'}
    </button>
  );
}
