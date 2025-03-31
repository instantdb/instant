import {
  Button,
  Content,
  Copyable,
  Fence,
  Label,
  SectionHeading,
  SubsectionHeading,
  TextInput,
} from '@/components/ui';
import { useEffect, useState } from 'react';
import config from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';
import { i } from '@instantdb/core';
import { asClientOnlyPage, useReadyRouter } from '@/components/clientOnlyPage';
import { useAuthToken, useTokenFetch } from '@/lib/auth';
import Auth from '@/components/dash/Auth';
import { InstantApp, OAuthAppClient } from '@/lib/types';
import { createApp } from '@/components/dash/Onboarding';
import { v4 } from 'uuid';
import {
  createClient,
  createOAuthApp,
  deleteOAuthApp,
} from '@/components/dash/OAuthApps';

async function jsonFetchCatchingErr(
  input: RequestInfo,
  init: RequestInit | undefined,
) {
  try {
    return await jsonFetch(input, init);
  } catch (e) {
    return e;
  }
}

const deleteAppCurl = (token: string, appId: string): string => {
  return `
export PLATFORM_TOKEN="${token}"

export APP_ID="${appId}"

curl -X DELETE "${config.apiURI}/superadmin/apps/$APP_ID/" \\
  -H "Authorization: Bearer $PLATFORM_TOKEN" \\
  -H "Content-Type: application/json"
`.trim();
};

const createAppCurl = (token: string): string => {
  return `
export PLATFORM_TOKEN="${token}"

curl -X POST "${config.apiURI}/superadmin/apps" \\
  -H "Authorization: Bearer $PLATFORM_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "my cool app"}'  
`.trim();
};

const exampleInit = (appId: string): string => {
  return `

import { init } from '@instantdb/react'; 

const db = init({
  appId: "${appId}" // 🎉
}); 
  `.trim();
};

const exampleSchemaGen = () => {
  return `
import { i } from '@instantdb/react';

const schema = i.schema({
  entities: {
    posts: i.entity({
      title: i.string(),
      body: i.string(),
    }),
    comments: i.entity({
      body: i.string(),
    }),
  },
  links: {
    commentPosts: {
      forward: {
        on: 'comments',
        has: 'one',
        label: 'post',
      },
      reverse: {
        on: 'posts',
        has: 'many',
        label: 'comments',
      },
    },
  },
  rooms: {}, 
});

JSON.stringify(schema, null, 2) // this is the schema you can push!
`.trim();
};
const exSchema = (appId: string) => {
  const schema = i.schema({
    entities: {
      posts: i.entity({
        title: i.string(),
        body: i.string(),
      }),
      comments: i.entity({
        body: i.string(),
      }),
    },
    links: {
      commentPosts: {
        forward: {
          on: 'comments',
          has: 'one',
          label: 'post',
        },
        reverse: {
          on: 'posts',
          has: 'many',
          label: 'comments',
        },
      },
    },
    rooms: {},
  });
  return schema;
};

const exampleSchemaPushCurl = (token: string, appId: string): string => {
  return `
export PLATFORM_TOKEN="${token}"

export APP_ID="${appId}"

curl -v -X POST "${config.apiURI}/superadmin/apps/$APP_ID/schema/push/apply" \\
  -H "Authorization: Bearer $PLATFORM_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ schema: exSchema(appId) }, null, 2)}'  
`.trim();
};

const examplePermsCurl = (token: string, appId: string): string => {
  return `
export PLATFORM_TOKEN="${token}"

export APP_ID="${appId}"

curl -v -X POST "${config.apiURI}/superadmin/apps/$APP_ID/perms" \\
  -H "Authorization: Bearer $PLATFORM_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    { code: { posts: { allow: { create: 'false' } } } },
    null,
    2,
  )}'  
`.trim();
};

function AppStage({
  token,
  app,
  setApp,
}: {
  token: string;
  app: { id: string };
  setApp: any;
}) {
  const [schemaPushResult, setSchemaPushResult] = useState<any>();
  const [permsResult, setPermsResult] = useState<any>();
  return (
    <div>
      <div>
        <h2>2. Use it!</h2>
        <p>
          This works just like a normal app. You can use it inside instant sdks:
        </p>
        <div className="border">
          <Fence code={exampleInit(app.id)} language="javascript" />
        </div>
      </div>
      <div>
        <h2>3. Push schema</h2>
        <p>
          To define a schema, use <code>i.schema</code> like so:
        </p>
        <div className="border h-96 overflow-scroll">
          <Fence code={exampleSchemaGen()} language="tsx" />
        </div>
        <p>Once you have it, here's the CURL to push:</p>
        <div className="border h-96 overflow-scroll">
          <Fence code={exampleSchemaPushCurl(token, app.id)} language="bash" />
        </div>
        <Button
          onClick={async () => {
            const res = await jsonFetchCatchingErr(
              `${config.apiURI}/superadmin/apps/${app.id}/schema/push/apply`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ schema: exSchema(app.id) }),
              },
            );
            setSchemaPushResult(res);
          }}
        >
          Try it!
        </Button>
        {schemaPushResult ? (
          <div className="border h-96 overflow-scroll">
            <Fence
              code={JSON.stringify(schemaPushResult, null, 2)}
              language="json"
            />
          </div>
        ) : null}
      </div>
      <div>
        <h2>4. Push Perms</h2>
        <p>You can update permissions too:</p>
        <div className="border">
          <Fence code={examplePermsCurl(token, app.id)} language="bash" />
        </div>
        <Button
          onClick={async () => {
            const res = await jsonFetchCatchingErr(
              `${config.apiURI}/superadmin/apps/${app.id}/perms`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  code: { posts: { allow: { create: 'false' } } },
                }),
              },
            );
            setPermsResult(res);
          }}
        >
          Try it!
        </Button>
        {permsResult ? (
          <div className="border">
            <Fence
              code={JSON.stringify(permsResult, null, 2)}
              language="json"
            />
          </div>
        ) : null}
      </div>
      <div>
        <h2>5. Delete App</h2>
        <p>Finally, you can delete the app:</p>
        <div className="border">
          <Fence code={deleteAppCurl(token, app.id)} language="bash" />
        </div>
        <Button
          onClick={async () => {
            const res = await jsonFetchCatchingErr(
              `${config.apiURI}/superadmin/apps/${app.id}`,
              {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              },
            );
            setApp(null);
          }}
        >
          Try it!
        </Button>
      </div>
      <div>
        <h2>6. (Coming soon) Connect to Instant</h2>
        <p>
          With the API endpoints above, you can implement guest mode! Coming
          soon, we'll create an API so you can authenticate Instant users, and
          create databases on their behalf.
        </p>
        <p>Stay tuned!</p>
      </div>
    </div>
  );
}

function CreateAppStep({
  app,
  reset,
  onCreateApp,
}: {
  app: InstantApp | null;
  reset: () => Promise<void>;
  onCreateApp: (app: InstantApp) => void;
}) {
  const token = useAuthToken()!;

  return !app ? (
    <div className="flex flex-col gap-4">
      <Button
        onClick={async () => {
          const resp = await createApp(token, {
            id: v4(),
            title: 'Platfom OAuth App Demo',
            admin_token: v4(),
          });
          onCreateApp(resp.app as InstantApp);
        }}
      >
        Create app
      </Button>
    </div>
  ) : (
    <div>
      App created!{' '}
      <Button
        onClick={reset}
        variant="subtle"
        type="link"
        size="normal"
        className="m-0 p-0"
      >
        Click here at any time to delete it
      </Button>{' '}
      and start over.
    </div>
  );
}

function CreateOAuthClientStep({
  app,
  clientAndSecret,

  onCreateClient,
}: {
  app: InstantApp;
  clientAndSecret:
    | { client: OAuthAppClient; secretValue: string }
    | null
    | undefined;
  onCreateClient: (params: {
    client: OAuthAppClient;
    secretValue: string;
  }) => void;
}) {
  const token = useAuthToken()!;
  return (
    <div className="flex flex-col gap-4">
      <Content>
        Next we'll create the OAuth app and client that we'll use to generate
        OAuth tokens. After the demo, you can create these for real on the{' '}
        <a target="_blank" href="/dash?s=main&t=oauth-apps">
          `OAuth Apps` page of the dashboard
        </a>
        .
      </Content>
      {!clientAndSecret ? (
        <div className="flex flex-col gap-4">
          <Button
            onClick={async () => {
              const appRes = await createOAuthApp({
                token,
                appId: app.id,
                appName: 'OAuth App Demo',
              });

              const clientRes = await createClient({
                token,
                appId: app.id,
                oauthAppId: appRes.app.id,
                clientName: 'demo-client',
                authorizedRedirectUrls: [window.location.href],
              });

              onCreateClient({
                client: clientRes.client,
                secretValue: clientRes.secretValue,
              });
            }}
          >
            Create OAuth App and Client
          </Button>
        </div>
      ) : (
        <>
          <Content>OAuth app and client created!</Content>
          <Content>Your client id is</Content>
          <Copyable value={clientAndSecret.client.clientId} />
          <Content>Your client secret is</Content>
          <Copyable value={clientAndSecret.secretValue} />
          <Content>You'll need those to complete the OAuth flow.</Content>
        </>
      )}
    </div>
  );
}

function exchangeCodeCurl({
  clientId,
  secretValue,
  codeParam,
  redirectUri,
}: {
  clientId: string;
  secretValue: string;
  codeParam: string;
  redirectUri: string;
}) {
  return `export CLIENT_ID="${clientId}"
export CLIENT_SECRET="${secretValue}"
export REDIRECT_URI="${redirectUri}"
export CODE="${codeParam}"

curl -v -X POST "${config.apiURI}/platform/oauth/token" \\
  -H "Content-Type: application/json" \\
  -d "{
        \\"client_id\\": \\"$CLIENT_ID\\",
        \\"client_secret\\": \\"$CLIENT_SECRET\\",
        \\"redirect_uri\\": \\"$REDIRECT_URI\\",
        \\"grant_type\\": \\"authorization_code\\",
        \\"code\\": \\"$CODE\\"
      }"`;
}

function fetchAppsCurl({ token }: { token: string }) {
  return `export ACCESS_TOKEN="${token}"

curl -v "${config.apiURI}/superadmin/apps" \\
  -H "Authorization: Bearer $ACCESS_TOKEN"  
 `;
}

function refreshTokenCurl({
  refreshToken,
  clientId,
  clientSecret,
}: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}) {
  return `export CLIENT_ID="${clientId}"
export CLIENT_SECRET="${clientSecret}"
export REFRESH_TOKEN="${refreshToken}"

curl -v -X POST "${config.apiURI}/platform/oauth/token" \\
  -H "Content-Type: application/json" \\
  -d "{
        \\"client_id\\": \\"$CLIENT_ID\\",
        \\"client_secret\\": \\"$CLIENT_SECRET\\",
        \\"grant_type\\": \\"refresh_token\\",
        \\"refresh_token\\": \\"$REFRESH_TOKEN\\"
      }"`;
}

function CreateAuthorizationUrlStep({
  client,
  secretValue,
  reset,
}: {
  client: OAuthAppClient;
  secretValue: string;
  reset: () => Promise<void>;
}) {
  const [scope, setScope] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [leftPage, setLeftPage] = useState(false);
  const [codeParam, setCodeParam] = useState('');
  const [stateParam, setStateParam] = useState('');
  const [tokenRes, setTokenRes] = useState<any>(null);
  const [appsRes, setAppsRes] = useState<any>(null);
  const [refreshTokenStep, setRefreshTokenStep] = useState(false);
  const [refreshTokenRes, setRefreshTokenRes] = useState<any>(null);

  const urlParams = new URLSearchParams();
  if (scope) {
    urlParams.set('client_id', client.clientId);
    urlParams.set('response_type', 'code');
    urlParams.set('scope', scope);
  }
  if (state) {
    urlParams.set('state', state);
  }
  if (redirectUri) {
    urlParams.set('redirect_uri', redirectUri);
  }

  const baseUrl = `${config.apiURI}/platform/oauth/start`;
  const authorizationUrl = urlParams.size
    ? `${baseUrl}?${urlParams.toString()}`
    : null;

  useEffect(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  });

  useEffect(() => {
    if (redirectUri) {
      const handleVisibilityChange = () => {
        if (document.hidden) {
          setLeftPage(true);
        }
      };
      window.addEventListener('visibilitychange', handleVisibilityChange);
      return () =>
        window.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  }, [redirectUri]);
  return (
    <div className="flex flex-col gap-4">
      <SectionHeading>Authorization URL</SectionHeading>
      <Content>
        Now that we have a client, we can start the OAuth flow by constructing
        our Authorization URL.
      </Content>
      <Content>The base URL is</Content>
      <Copyable value={baseUrl}></Copyable>
      <Content>
        We need to provide the <code>client_id</code>,{' '}
        <code>response_type</code>, <code>scope</code>,{' '}
        <code>redirect_uri</code>, and <code>state</code> params.
      </Content>
      <Content>
        The <code>client_id</code> we already have and the{' '}
        <code>response_type</code> should always be the value <code>code</code>.{' '}
      </Content>
      <SubsectionHeading>Scope</SubsectionHeading>
      <Content>
        The <code>scope</code> param is a space-separated list of scopes.
      </Content>
      <Content>
        The <code>apps-read</code> scope allows us to list a user's apps and
        view the app's schema and permissions.
      </Content>
      <Content>
        The <code>apps-write</code> scope allows us to create and delete apps
        and update an app's schema and permissions.
      </Content>
      <div className="flex flex-row gap-4">
        {!scope || !scope.includes('apps-read') ? (
          <Button
            variant="secondary"
            onClick={() => setScope(scope ? `${scope} apps-read` : 'apps-read')}
          >
            Add apps-read scope
          </Button>
        ) : null}
        {!scope || !scope.includes('apps-write') ? (
          <Button
            variant="secondary"
            onClick={() =>
              setScope(scope ? `${scope} apps-write` : 'apps-write')
            }
          >
            Add apps-write scope
          </Button>
        ) : null}
      </div>
      {scope ? (
        <>
          <SubsectionHeading>State</SubsectionHeading>
          <Content>
            The <code>state</code> param should be a random string. We'll use it
            when we get the token.
          </Content>
          {!state ? (
            <Button onClick={() => setState(v4())}>
              Generate a new state param
            </Button>
          ) : (
            <Content>
              We added <code>state={state}</code> to the authorization URL.
            </Content>
          )}
        </>
      ) : null}
      {state ? (
        <>
          <SubsectionHeading>Redirect URI</SubsectionHeading>
          <Content>
            The <code>redirect_uri</code> will redirect back to your site after
            the user grants or denies access to their account.
          </Content>
          <Content>We'll just redirect back here for the demo.</Content>
          {!redirectUri ? (
            <Button onClick={() => setRedirectUri(window.location.href)}>
              Add <code>redirect_uri</code>
            </Button>
          ) : (
            <Content>
              We added <code>redirect_uri={redirectUri}</code> to the
              authorization URL.
            </Content>
          )}
        </>
      ) : null}
      {redirectUri ? (
        <>
          <Content>Now we're ready to start the OAuth flow.</Content>
          <Content>
            <a href={authorizationUrl!} target="_blank">
              Open the Authorization URL in a new window
            </a>{' '}
            to start, then come back here and fill in the params.
          </Content>
        </>
      ) : null}
      {authorizationUrl ? (
        <label>
          <Label>Authorization URL</Label>
          <Copyable multiline={true} value={authorizationUrl}></Copyable>
        </label>
      ) : null}
      {leftPage ? (
        <>
          <Content>
            {' '}
            If the authorization succeeded, you should have a <code>
              code
            </code>{' '}
            param and a <code>state</code> param. Enter them below:
          </Content>
          <label>
            <Label>Code</Label>
            <TextInput value={codeParam} onChange={setCodeParam} />
          </label>
          <label>
            <Label>State</Label>
            <TextInput
              value={stateParam}
              onChange={setStateParam}
              error={
                stateParam && state !== stateParam
                  ? 'The state param does not match the one we created! We should reject this request!'
                  : null
              }
            />
          </label>
        </>
      ) : null}
      {codeParam && stateParam && stateParam === state && redirectUri ? (
        <>
          <Content>
            The state param matches the one we set in the authorization URL, so
            now we can exchange the code for an auth token.
          </Content>
          <div className="border">
            <Fence
              code={exchangeCodeCurl({
                secretValue,
                codeParam,
                redirectUri,
                clientId: client.clientId,
              })}
              language="bash"
            />
          </div>
          {!tokenRes ? (
            <Button
              onClick={async () => {
                try {
                  const resp = await jsonFetch(
                    `${config.apiURI}/platform/oauth/token`,
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        code: codeParam,
                        state: stateParam,
                        redirect_uri: redirectUri,
                        client_id: client.clientId,
                        client_secret: secretValue,
                        grant_type: 'authorization_code',
                      }),
                    },
                  );
                  setTokenRes(resp);
                } catch (e) {
                  setTokenRes(e);
                }
              }}
            >
              Try it!
            </Button>
          ) : null}
        </>
      ) : null}
      {tokenRes ? (
        <div className="border overflow-scroll">
          <Fence code={JSON.stringify(tokenRes, null, 2)} language="json" />
        </div>
      ) : null}
      {tokenRes?.access_token ? (
        <>
          <Content>
            We can use the access token to fetch the user's apps:
          </Content>
          <div className="border">
            <Fence
              code={fetchAppsCurl({
                token: tokenRes.access_token,
              })}
              language="bash"
            />
          </div>
          {!appsRes ? (
            <Button
              onClick={async () => {
                try {
                  const resp = await jsonFetch(
                    `${config.apiURI}/superadmin/apps`,
                    {
                      method: 'GET',
                      headers: {
                        Authorization: `Bearer ${tokenRes.access_token}`,
                      },
                    },
                  );
                  setAppsRes(resp);
                } catch (e) {
                  setAppsRes(e);
                }
              }}
            >
              Try it!
            </Button>
          ) : null}
        </>
      ) : null}
      {appsRes ? (
        <>
          <div className="border h-96 overflow-scroll">
            <Fence code={JSON.stringify(appsRes, null, 2)} language="json" />
          </div>
          <Content>
            Our token expires in two weeks, so we'll need to refresh it.
          </Content>
          {!refreshTokenStep ? (
            <Button onClick={() => setRefreshTokenStep(true)}>
              Continue to refreshing tokens
            </Button>
          ) : null}
        </>
      ) : null}
      {refreshTokenStep ? (
        <>
          <div className="border">
            <Fence
              code={refreshTokenCurl({
                refreshToken: tokenRes.refresh_token,
                clientId: client.clientId,
                clientSecret: secretValue,
              })}
              language="bash"
            />
          </div>

          <Button
            variant={refreshTokenRes ? 'secondary' : 'primary'}
            onClick={async () => {
              try {
                const resp = await jsonFetch(
                  `${config.apiURI}/platform/oauth/token`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      state: stateParam,
                      refresh_token: tokenRes.refresh_token,
                      client_id: client.clientId,
                      client_secret: secretValue,
                      grant_type: 'refresh_token',
                    }),
                  },
                );
                setRefreshTokenRes(resp);
              } catch (e) {
                setRefreshTokenRes(e);
              }
            }}
          >
            {refreshTokenRes ? 'Try it again!' : 'Try it!'}
          </Button>
        </>
      ) : null}
      {refreshTokenRes ? (
        <>
          <div className="border overflow-scroll">
            <Fence
              code={JSON.stringify(refreshTokenRes, null, 2)}
              language="json"
            />
          </div>
          <Content>
            Now you've built an OAuth app on the Instant platform. There is{' '}
            <a href="/docs/auth/platform-oauth" target="_blank">
              more information in the docs
            </a>
            .
          </Content>
          <Button onClick={reset}>Delete the app to reset</Button>
        </>
      ) : null}
    </div>
  );
}

function Authed() {
  const token = useAuthToken()!;
  const [app, setApp] = useState<null | InstantApp>(null);
  const [client, setClient] = useState<null | {
    client: OAuthAppClient;
    secretValue: string;
  }>(null);

  const reset = async () => {
    if (app) {
      if (client) {
        await deleteOAuthApp({
          appId: app.id,
          token,
          oauthAppId: client.client.oauthAppId,
        });
      }
      await jsonFetch(`${config.apiURI}/dash/apps/${app.id}`, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
      });

      setApp(null);
      setClient(null);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4 pb-16">
      <div className="space-y-4">
        <SectionHeading className="font-bold">
          Here's a demo of OAuth apps on Instant!
        </SectionHeading>
        <Content>
          First we'll create a new Instant app where all of the data for the
          demo will live. You can delete the app at the end of the demo.
        </Content>
        <CreateAppStep app={app} reset={reset} onCreateApp={setApp} />
        {app ? (
          <CreateOAuthClientStep
            app={app}
            clientAndSecret={client}
            onCreateClient={setClient}
          />
        ) : null}
        {client?.client ? (
          <CreateAuthorizationUrlStep
            client={client.client}
            secretValue={client.secretValue}
            reset={reset}
          />
        ) : null}
      </div>
    </div>
  );
}

function AuthCallback({ code, state }: { code: string; state: string }) {
  return (
    <div className="max-w-xl mx-auto p-4 flex flex-col gap-4">
      <Content>Our OAuth app was granted access!</Content>{' '}
      <Content>
        Copy the <code>code</code> and <code>state</code> params from the URL
        and go back to the demo to exchange the code for a token!{' '}
      </Content>
      <Copyable label="code" value={code} />
      <Copyable label="state" value={state} />
    </div>
  );
}

function AuthRejected({ error }: { error: string }) {
  return (
    <div className="max-w-xl mx-auto p-4 flex flex-col gap-4">
      <Content>Our auth request failed!</Content>
      <Content>
        The url contains the <code>error</code> param with what went wrong.
      </Content>
      <Copyable label="error" value={error} />
    </div>
  );
}

function ClientPage() {
  const token = useAuthToken();
  const router = useReadyRouter();
  const code = router.query.code;
  const state = router.query.state;

  const error = router.query.error;

  if (code && state) {
    return <AuthCallback code={code as string} state={state as string} />;
  }
  if (error) {
    return <AuthRejected error={error as string} />;
  }
  if (!token) {
    return <Auth />;
  }

  return <Authed />;
}

const Page = asClientOnlyPage(ClientPage);

export default Page;
