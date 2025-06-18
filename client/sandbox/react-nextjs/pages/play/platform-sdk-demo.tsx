import {
  OAuthHandler,
  OAuthScope,
  PlatformApi,
  i,
  generateSchemaTypescriptFile,
} from '@instantdb/platform';
import { useState } from 'react';
import config from '../../config';

// @ts-ignore: _dev for testing in console
globalThis._dev = {
  i,
  PlatformApi,
  OAuthHandler,
  generateSchemaTypescriptFile,
};

const OAUTH_CLIENT_ID = process.env.NEXT_PUBLIC_PLATFORM_OAUTH_CLIENT_ID;

export const OAUTH_HANDLER = OAUTH_CLIENT_ID
  ? new OAuthHandler({
      clientId: OAUTH_CLIENT_ID,
      redirectUri: 'http://localhost:4000/platform/oauth-landing',
      apiURI: config.apiURI,
    })
  : null;

export function ClientIdReadme() {
  return (
    <div>
      <p className="p-4">
        Add your OAuth client id to the .env file as{' '}
        <code>NEXT_PUBLIC_PLATFORM_OAUTH_CLIENT_ID</code>
      </p>
      <p className="p-4">
        Be sure to include{' '}
        <code>http://localhost:4000/platform/oauth-landing</code> as an
        authorized redirect url.
      </p>
    </div>
  );
}

const SCOPES: OAuthScope[] = [
  'apps-read',
  'apps-write',
  'data-read',
  'data-write',
  'storage-read',
  'storage-write',
];

function OAuthFlow({
  oauthHandler,
  onAccessToken,
}: {
  oauthHandler: OAuthHandler;
  onAccessToken: (token: string) => void;
}) {
  const [scopes, setScopes] = useState<OAuthScope[]>([]);

  const handleConnect = async () => {
    try {
      if (!scopes.length) {
        throw new Error('Select at least one scope.');
      }
      const token = await oauthHandler.startClientOnlyFlow(scopes);
      onAccessToken(token.token);
    } catch (e) {
      alert((e as Error).message);
      console.error(e);
    }
  };

  return (
    <div>
      <h3>Scopes</h3>
      {SCOPES.map((scope: OAuthScope) => {
        return (
          <div key={scope} className="m-2">
            <input
              id={scope}
              type="checkbox"
              checked={scopes.includes(scope)}
              onChange={() =>
                setScopes((scopes) =>
                  scopes.includes(scope)
                    ? scopes.filter((s) => s !== scope)
                    : [...scopes, scope],
                )
              }
            />
            <label className="m-2" htmlFor={scope}>
              {scope}
            </label>
          </div>
        );
      })}
      <button className="bg-black text-white m-2 p-2" onClick={handleConnect}>
        Connect to your Instant Account
      </button>
    </div>
  );
}

function ApiDemo({ accessToken }: { accessToken: string }) {
  const api = new PlatformApi({
    auth: { token: accessToken },
    apiURI: config.apiURI,
  });

  // @ts-ignore: dev helper for testing in console
  globalThis._dev.api = api;
  const [result, setResult] = useState<any>(null);

  const getApps = async (opts: any) => {
    try {
      setResult(await api.getApps(opts));
    } catch (e) {
      setResult(e);
    }
  };

  const createApp = async () => {
    try {
      const result = await api.createApp({
        title: 'Test App from Platform SDK Demo',
        schema: i.schema({
          entities: {
            todos: i.entity({
              title: i.string(),
              done: i.boolean().optional(),
            }),
          },
        }),
      });
      setResult(result);
    } catch (e) {
      setResult(e);
    }
  };

  return (
    <div>
      <div>
        <button className="bg-black text-white m-2 p-2" onClick={getApps}>
          Get Apps
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => getApps({ includeSchema: true })}
        >
          Get Apps with schema
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => getApps({ includePerms: true })}
        >
          Get Apps with perms
        </button>
        <button className="bg-blue-600 text-white m-2 p-2" onClick={createApp}>
          Create App
        </button>
      </div>
      {result ? (
        <div>
          <div>Result:</div>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  );
}

function Demo({ oauthHandler }: { oauthHandler: OAuthHandler }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  if (!accessToken) {
    return (
      <OAuthFlow onAccessToken={setAccessToken} oauthHandler={oauthHandler} />
    );
  }
  return <ApiDemo accessToken={accessToken} />;
}

export default function Page() {
  const oauthHandler = OAUTH_HANDLER;
  return (
    <div className="max-w-lg flex flex-col mt-20 mx-auto">
      {!oauthHandler ? (
        <ClientIdReadme />
      ) : (
        <Demo oauthHandler={oauthHandler} />
      )}
    </div>
  );
}
