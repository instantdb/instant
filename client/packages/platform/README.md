<p align="center">
  <a href="https://instantdb.com">
    <img alt="Shows the Instant logo" src="https://instantdb.com/img/icon/android-chrome-512x512.png" width="10%">
  </a>
  <h1 align="center">@instantdb/platform</h1>
</p>

<p align="center">
  <a
    href="https://discord.com/invite/VU53p7uQcE" >
    <img height=20 src="https://img.shields.io/discord/1031957483243188235" />
  </a>
  <img src="https://img.shields.io/github/stars/instantdb/instant" alt="stars">
</p>

<p align="center">
   <a href="https://www.instantdb.com/docs/backend">Get Started</a> ·
   <a href="https://instantdb.com/examples">Examples</a> ·
   <a href="https://instantdb.com/tutorial">Try the Demo</a> ·
   <a href="https://www.instantdb.com/docs/backend">Docs</a> ·
   <a href="https://discord.com/invite/VU53p7uQcE">Discord</a>
<p>

Welcome to [Instant's](http://instantdb.com) platform SDK.

The Platform SDK allows you to manage apps on behalf of an Instant user.

# Usage

## OAuth flow

You'll need an OAuth access token to make request on the Instant user's behalf. The platform SDK includes helpers for performing the OAuth flow in the `OAuthHandler` class.

Go to the [OAuth Apps page of the dashboard](https://www.instantdb.com/dash?s=main&t=oauth-apps) to create a new OAuth client id.

First you'll need to create a page that you can redirect to complete the OAuth flow. It should live on the same domain as the page where you're originating the OAuth flow:

```tsx
// oauth/instant/redirect.tsx
import { OAuthHandler } from '@instantdb/platform';
import { useEffect } from 'react';

const oauthHandler = new OAuthHandler({
  // https://www.instantdb.com/dash?s=main&t=oauth-apps
  clientId: 'YOUR_CLIENT_ID',
  // Be sure the redirectUri matches one of the authorized redirect uris
  // in your OAuth App client config on the Instant dashboard.
  redirectUri: 'https://example.com/oauth/instant/redirect',
});

export default function Page() {
  useEffect(() => {
    // This will send the oauth code to the originating window,
    // then close the window.
    return oauthHandler.handleClientRedirect();
  });

  return <div>Loading...</div>;
}
```

On the page where you want the user to connect:

```tsx
// ConnectPage.tsx
import { OAuthHandler } from '@instantdb/platform';

// Available scopes are: apps-read, apps-write,
//                       data-read, data-write,
//                       storage-read, storage-write
const scopes = ['apps-write'];

const handler = new OAuthHandler({
  // https://www.instantdb.com/dash?s=main&t=oauth-apps
  clientId: 'YOUR_CLIENT_ID',
  // Be sure the redirectUri matches one of the authorized redirect uris
  // in your OAuth App client config on the Instant dashboard.
  redirectUri: 'https://example.com/oauth/instant/redirect',
});

export default function Page() {
  const handleConnect = async () => {
    try {
      // This will open a new window where the user will complete the OAuth flow
      const token = await oauthHandler.startClientOnlyFlow(scopes);
      // doSomethingWith(token)
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <button onClick={handleConnect}>Connect to your Instant Account</button>
  );
}
```

The client-only flow described here uses PKCE and does not support refresh tokens. For a server-based flow that supports refresh tokens, see the [Platform OAuth docs](https://www.instantdb.com/docs/auth/platform-oauth).

## Making API requests

Once you have your token, you can perform actions on the user's behalf with the `PlatformApi` class.

Setup:

```js
import { PlatformApi } from '@instantdb/platform';

const api = new PlatformApi({ auth: { token: 'OAUTH_ACCESS_TOKEN' } });
```

### getApps

Requires the `apps-read` or `apps-write` scope.

Get all of the user's apps, optionally fetching the schema and permissions:

```js
const { apps } = await api.getApps({ includeSchema: true, includePerms: true });
```

### getApp

Requires the `apps-read` or `apps-write` scope.

Get an app by its id, optionally fetching the schema and permissions:

```js
const { app } = await api.getApp(YOUR_APP_ID, {
  includeSchema: true,
  includePerms: true,
});
```

### getSchema

Requires the `apps-read` or `apps-write` scope.

Get the schema for an app by its id:

```ts
const { schema } = await api.getSchema(YOUR_APP_ID);
```

The Platform SDK includes a helper for generating the `instant.schema.ts` file from the schema returned by the API.

```ts
import { generateSchemaTypescriptFile } from '@instantdb/platform';

// Generate the instant.schema.ts file with:
const schemaTs = generateSchemaTypescriptFile(null, schema, '@instantdb/react');
```

### getPerms

Requires the `apps-read` or `apps-write` scope.

Get the permissions for an app by its id:

```ts
const { perms } = await api.getPerms(YOUR_APP_ID);
```

The Platform SDK includes a helper for generating the `instant.perms.ts` file from the perms returned by the API.

```ts
import { generatePermsTypescriptFile } from '@instantdb/platform';

// Generate the instant.schema.ts file with:
const permsTs = generatePermsTypescriptFile(perms, '@instantdb/react');
```

### createApp

Requires the `apps-write` scope.

Create a new app in the authenticated user's account:

```ts
const { app } = await api.createApp({ title: 'Great new app' });
```

`createApp` takes optional `schema` and `perms` arguments.

Create an app with permissions:

```ts
import type { InstantRules } from '@instantdb/platform';

const perms: InstantRules = {
  $default: {
    allow: {
      $default: false,
    },
  },
  todos: {
    allow: {
      view: 'true',
      create: 'isOwner',
      update: 'isOwner',
      delete: 'isOwner',
    },
    bind: ['isOwner', 'auth.id != null && auth.id == data.creatorId'],
  },
};

const { app } = await api.createApp({
  title: 'My app with permissions',
  perms: perms,
});
```

Create an app with a schema:

```ts
import { i } from '@instantdb/platform';

const schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string(),
      done: i.boolean(),
    }),
  },
});

const { app } = await api.createApp({
  title: 'Todo app',
  schema: schema,
});
```

### updateApp

Requires the `apps-write` scope.

Update an app's title by its id:

```ts
const { app } = await api.updateApp(YOUR_APP_ID, { title: 'New app title' });
```

### deleteApp

Requires the `apps-write` scope.

Delete an app by its id:

```ts
const { app } = await api.deleteApp(YOUR_APP_ID);
```

### pushPerms

Requires the `apps-write` scope.

Update the permissions for an app by its id. This will completely replace the current set of permissions.

```ts
import type { InstantRules } from '@instantdb/platform';

const perms: InstantRules = {
  $default: {
    allow: {
      $default: false,
    },
  },
  todos: {
    allow: {
      view: 'true',
      create: 'isOwner',
      update: 'isOwner',
      delete: 'isOwner',
    },
    bind: ['isOwner', 'auth.id != null && auth.id == data.creatorId'],
  },
};

const { app } = await api.pushPerms(YOUR_APP_ID, {
  perms: perms,
});
```

### planSchemaPush

Requires the `apps-read` or `apps-write` scope.

Performs a dry-run of `schemaPush`, returning the steps that would be taken.

```ts
import { i } from '@instantdb/platform';

const schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string().indexed(),
      done: i.boolean(),
      completedAt: i.date().optional(),
    }),
  },
});

const { steps } = await api.planSchemaPush(YOUR_APP_ID, { schema: schema });

// steps
// [
//   { type: 'index', friendlyDescription: 'Add index to todos.title.' },
//   {
//     type: 'add-attr',
//     friendlyDescription: 'Add attribute todos.completedAt.',
//     attr: {...},
//   },
// ];
```

### schemaPush

Requires the `apps-write` scope.

Push a new schema to an app.

Some schema updates, like adding an index to an attribute with existing data, kick off a process that completes in the background. The `schemaPush` method will wait for all of the background processes to finish before it returns.

You can subscribe to progress updates to display feedback to the user.

```ts
import { i } from '@instantdb/platform';

const schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string().indexed(),
      done: i.boolean(),
      completedAt: i.date().optional(),
    }),
  },
});

const pushPromise = api.schemaPush(YOUR_APP_ID, { schema: schema });

pushPromise.subscribe({
  next(status) {
    console.log(status.friendlyDescription);
  },
});

const { steps } = await pushPromise;
```

Note that the promise will return the steps without throwing even if some of the background steps failed. For example, if an attribute was marked `unique`, but there were multiple entities with the same value. In the case of failure, the step will have a `backgroundJob` field where `error` is set to a string.

Here is an example of a failed step to make the title attribute unique because mulitple entities had the same `Write docs` value.

```ts
// steps
[
  {
    type: 'unique',
    friendlyDescription: 'Ensure that todos.title is unique.',
    attrId: '07145112-59b6-4617-9abc-544a3c3e146c',
    forwardIdentity: ['24c6c019-97ef-4915-aef5-7f4f09b372e1', 'todos', 'title'],
    backgroundJob: {
      id: '1a5941ad-542b-4d0a-bce8-81ced3eaed1a',
      createdAt: '2025-05-30T23:26:54.000Z',
      updatedAt: '2025-05-30T23:26:54.000Z',
      status: 'errored',
      workEstimate: 2,
      workCompleted: null,
      error: 'triple-not-unique-error',
      invalidTriplesSample: [
        {
          entityId: 'b59b3be0-9d76-419f-8f95-e28830d12a40',
          value: 'Write docs',
          jsonType: 'string',
        },
        {
          entityId: 'eb57dbc8-5e09-4978-b255-1b81ff46b63e',
          value: 'Write docs',
          jsonType: 'string',
        },
      ],
      type: 'unique',
      invalidUniqueValue: 'Write docs',
    },
  },
];
```

Some failed steps will include an `invalidTriplesSample` in the background job, which show some of the triples that caused the error.

## Managing schemas

The platform package includes helpers for generating the `instant.schema.ts` and `instant.perms.ts` config files from the schema and perms data returned from the API.

```ts
import {
  generateSchemaTypescriptFile,
  generatePermsTypescriptFile,
} from '@instantdb/platform';

console.log(
  generateSchemaTypescriptFile(null, shemaFromApi, '@instantdb/core'),
);

console.log(generatePermsTypescriptFile(permsFromApi, '@instantdb/core'));
```

Use `schemaTypescriptFileToInstantSchema` to recover an `InstantSchemaDef` from the typescript file:

```ts
import {
  i,
  generateSchemaTypescriptFile,
  schemaTypescriptFileToInstantSchema,
} from '@instantdb/platform';

// Example schema
const schema = i.schema({
  entities: {
    books: i.entity({
      title: i.string().unique(),
    }),
  },
});

// Example of the typescript file that was generated for a schema
const code = generateTypescriptFile(null, schema, '@instantdb/core');

const recoveredSchema = schemaTypescriptFileToInstantSchema(code);

schema == recoveredSchema;
```

This is useful when parsing a schema that the user manually edited or pulled with `npx instant-cli pull`.

# Questions?

If you have any questions, feel free to drop us a line on our [Discord](https://discord.com/invite/VU53p7uQcE)
