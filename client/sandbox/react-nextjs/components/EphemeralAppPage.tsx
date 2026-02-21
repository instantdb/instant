import { useRouter } from 'next/router';
import config from '../config';
import {
  EntitiesDef,
  init,
  InstantReactAbstractDatabase,
  InstantSchemaDef,
  InstantConfig,
  LinksDef,
} from '@instantdb/react';
import { useCallback, useEffect, useState } from 'react';
import { RoomsDef, TransactionChunk } from '../../../packages/core/dist/esm';
import { IContainEntitiesAndLinks } from '../../../packages/core/dist/esm/schemaTypes';
import { Explorer, Toaster } from '@instantdb/components';

function getStoredAdminToken(appId: string): string | null {
  try {
    return localStorage.getItem(`ephemeral-admin-token-${appId}`);
  } catch {
    return null;
  }
}

function storeAdminToken(appId: string, token: string) {
  try {
    localStorage.setItem(`ephemeral-admin-token-${appId}`, token);
  } catch {}
}

type Cfg<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
  Rooms extends RoomsDef,
  UseDates extends boolean,
> = InstantConfig<InstantSchemaDef<Entities, Links, Rooms>, UseDates>;

type DB<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
  Rooms extends RoomsDef,
  UseDates extends boolean,
  Config extends Cfg<Entities, Links, Rooms, UseDates>,
> = InstantReactAbstractDatabase<
  InstantSchemaDef<Entities, Links, Rooms>,
  UseDates,
  Config
>;

type OnCreateApp<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
  Rooms extends RoomsDef,
  UseDates extends boolean,
  Config extends Cfg<Entities, Links, Rooms, UseDates>,
> = (db: DB<Entities, Links, Rooms, UseDates, Config>) => Promise<void>;

export async function provisionEphemeralApp<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
  Rooms extends RoomsDef,
  UseDates extends boolean,
  Config extends Cfg<Entities, Links, Rooms, UseDates>,
>({
  perms,
  schema,
  onCreateApp,
  useDateObjects,
}: {
  perms?: any;
  schema?: InstantSchemaDef<Entities, Links, Rooms>;
  onCreateApp?: OnCreateApp<Entities, Links, Rooms, UseDates, Config>;
  useDateObjects?: UseDates;
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
    const db = init({
      ...config,
      appId: res.app.id,
      schema: schema,
      useDateObjects,
      devtool: false,
    });
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

  const data = await r.json();

  if (!r.ok) {
    throw data;
  }
  return data;
}

function AppPage<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
  Rooms extends RoomsDef,
  UseDates extends boolean,
  Config extends Cfg<Entities, Links, Rooms, UseDates>,
>({
  urlAppId,
  schema,
  perms,
  onCreateApp,
  Component,
  extraConfig,
  useDateObjects,
}: {
  urlAppId: string | undefined;
  schema?: InstantSchemaDef<Entities, Links, Rooms>;
  perms?: any;
  onCreateApp?: (
    db: DB<Entities, Links, Rooms, UseDates, Config>,
  ) => Promise<void>;
  txChunks?: TransactionChunk<
    IContainEntitiesAndLinks<Entities, Links>,
    keyof Entities
  >[];
  Component: React.ComponentType<{
    db: DB<Entities, Links, Rooms, UseDates, Config>;
    appId: string;
  }>;
  extraConfig?: Partial<Omit<Config, 'appId' | 'schema' | 'useDateObjects'>>;
  useDateObjects: UseDates;
}) {
  const router = useRouter();
  const [appId, setAppId] = useState<string | undefined>();
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provisionApp = async () => {
    try {
      const res = await provisionEphemeralApp<
        Entities,
        Links,
        Rooms,
        UseDates,
        Config
      >({
        schema,
        perms,
        onCreateApp,
        useDateObjects,
      });

      if (res.app) {
        router.replace({
          pathname: router.pathname,
          query: { ...router.query, app: res.app.id },
        });

        setAppId(res.app.id);
        const token = res.app['admin-token'];
        if (token) {
          storeAdminToken(res.app.id, token);
          setAdminToken(token);
        }
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
      const stored = getStoredAdminToken(urlAppId);
      if (stored) {
        setAdminToken(stored);
      }
      verifyEphemeralApp({ appId: urlAppId })
        .then((res): any => {
          setAppId(res.app.id);
          const token = res.app['admin-token'];
          if (token) {
            storeAdminToken(res.app.id, token);
            setAdminToken(token);
          }
        })
        .catch((err) => {
          if (
            err.type === 'record-not-found' ||
            err.type === 'param-malformed'
          ) {
            // App ID is not valid, provision a new one
            console.error('Error verifying ephemeral app:', err);
            console.log('Provisioning new ephemeral app');
            provisionApp();
            return;
          }
          if (!err.type) {
            // Some other error, maybe we're offline - let's just trust the
            // app ID so we can test offline
            setAppId(urlAppId as any);
            return;
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

  const finalConfig = {
    ...config,
    ...extraConfig,
    schema,
    appId,
    useDateObjects,
    devtool: false,
  };
  const db = init(finalConfig);

  return (
    <div>
      <Component key={appId} db={db} appId={appId} />
      {adminToken && (
        <>
          <button
            onClick={() => setExplorerOpen((o) => !o)}
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              zIndex: 9010,
              padding: 0,
              margin: 0,
              border: 'none',
              cursor: 'pointer',
              background: 'none',
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 512 512"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="512" height="512" fill="black" />
              <rect
                x="97.0973"
                y="91.3297"
                width="140"
                height="330"
                fill="white"
              />
            </svg>
          </button>
          {explorerOpen && (
            <div
              style={{
                position: 'fixed',
                top: '72px',
                left: '24px',
                right: '60px',
                bottom: '24px',
                zIndex: 999990,
                borderRadius: '4px',
                border: '1px #ccc solid',
                boxShadow: '0px 0px 8px #00000044',
                backgroundColor: '#fff',
                overflow: 'hidden',
              }}
            >
              <Explorer
                appId={appId}
                adminToken={adminToken}
                apiURI={config.apiURI}
                websocketURI={config.websocketURI}
                //useShadowDOM={true}
              />
              <Toaster position="top-right" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Page<
  Entities extends EntitiesDef,
  Links extends LinksDef<Entities>,
  Rooms extends RoomsDef,
  UseDates extends boolean = false,
  Config extends Cfg<Entities, Links, Rooms, UseDates> = Cfg<
    Entities,
    Links,
    Rooms,
    UseDates
  >,
>({
  schema,
  perms,
  onCreateApp,
  Component,
  extraConfig,
  useDateObjects,
}: {
  schema?: InstantSchemaDef<Entities, Links, Rooms>;
  perms?: any;
  onCreateApp?: OnCreateApp<Entities, Links, Rooms, UseDates, Config>;
  Component: React.ComponentType<{
    db: DB<Entities, Links, Rooms, UseDates, Config>;
    appId: string;
  }>;
  extraConfig?: Partial<Omit<Config, 'appId' | 'schema' | 'useDateObjects'>>;
  useDateObjects?: UseDates;
}) {
  const router = useRouter();
  if (router.isReady) {
    return (
      <AppPage<Entities, Links, Rooms, UseDates, Config>
        schema={schema}
        perms={perms}
        onCreateApp={onCreateApp}
        Component={Component}
        extraConfig={extraConfig}
        urlAppId={router.query.app as string}
        useDateObjects={useDateObjects ?? (false as UseDates)}
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
