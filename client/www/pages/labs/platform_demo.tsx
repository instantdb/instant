import { Button, Fence, SectionHeading, TextInput } from '@/components/ui';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import useLocalStorage from '@/lib/hooks/useLocalStorage';
import { useState } from 'react';
import config from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';
import { i } from '@instantdb/core';

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

function PlatformTokenStage({ token }: { token: string }) {
  const [app, setApp] = useLocalStorage<any>('__platform_demo_app', null);
  return (
    <div>
      <h2>1. Create Apps</h2>
      <p>Now you can create an app!</p>
      <div className="not-prose">
        <div className="space-y-2">
          <div className="border">
            <Fence
              code={createAppCurl(token)}
              language="bash"
              className="overflow-auto h-full w-full p-8 m-0 text-sm"
              style={{ margin: 0 }}
            />
          </div>
          <Button
            onClick={async () => {
              const res = await jsonFetchCatchingErr(
                `${config.apiURI}/superadmin/apps`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ title: 'my cool app' }),
                },
              );
              setApp(res.app);
            }}
          >
            Try it!
          </Button>
          {app && (
            <div className="space-y-2">
              <p>Wohoo! Here's your app:</p>
              <div className="border">
                <Fence
                  code={JSON.stringify(app, null, 2)}
                  language="json"
                  className="overflow-auto h-full w-full p-8 m-0 text-sm"
                  style={{ margin: 0 }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      {app ? <AppStage app={app} token={token} setApp={setApp} /> : null}
    </div>
  );
}
export default function Page() {
  const isHydrated = useIsHydrated();
  const [platformToken, setPlatformToken] = useLocalStorage<string>(
    '__platformToken',
    '',
  );
  if (!isHydrated) return;
  return (
    <div className="max-w-xl mx-auto p-4">
      <div className="space-y-4 prose">
        <SectionHeading className="font-bold">
          Here's a demo of the Platform Beta!
        </SectionHeading>
        <p>
          First,{' '}
          <a href="/dash?s=personal-access-tokens" target="_blank">
            <span className="text-blue-500 font-bold cursor-pointer">
              go to this page and get a personal access token
            </span>
          </a>
        </p>
        <p>Once you have it, paste it into this input:</p>
        <TextInput
          value={platformToken}
          onChange={(v) => setPlatformToken(v.trim())}
          placeholder="the-token-you-copied"
        />
        {platformToken ? <PlatformTokenStage token={platformToken} /> : null}
      </div>
    </div>
  );
}
