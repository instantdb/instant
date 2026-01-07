---
title: Platform API
description: Spin up Instant apps on demand and manage schema with the Platform API.
---

You can use Instant to programmatically create apps, push schemas and manage permissions. This is particularly powerful in two scenarios:

- **App Builders**: If you're an app builder, you can give your customers a backend. It takes only an hour to set up the platform, and every app your users create gets a full backend as a result. And LLMs are great at using Instant: they can make more progress with less tokens and less mistakes.
- **Software teams**: If you're a software team you can improve your development workflows: create apps for different pull requests, or spin up temporary apps for tests.

In this document, we'll show you:

1. The tools you can use to manage apps
2. How to create temporary apps
2. How to create long-lived apps
3. How to manage schemas and permissions programatically

Let's get into it!

## CLI & SDK

To manage apps you have two main tools at your disposal.

You can either use the Instant CLI:

```bash
npx instant-cli
```

Or if you are running a backend server, the Platform SDK

```bash
npm install @instantdb/platform
```

Let's see how we can use them.

## Temporary Apps

First things first, let's create a temporary app.

A temporary app is an Instant app that deletes itself in 2 weeks. You can use them to run quick experiments or spin apps up for tests. You don't need authenticate to create temporary apps, so they're a great way for us to get a sense of how to use our tools.

**Here's how to make a temporary app with CLI:**

```bash
npx instant-cli init-without-files --title my-new-app --temp
```

And voila, you have a temporary app:

```bash
Successfully created new app!

{
  "app": {
    "appId": "...",
    "adminToken": "..."
  },
  "error": null
}
```

**And here's how to make a temporary app with the Platform SDK:**

```typescript
import { PlatformApi } from '@instantdb/platform';

const api = new PlatformApi({ });

const app = await api.createTemporaryApp({
  title: 'my-new-app'
})

console.log('app ->', app);
```

With that, you have a temporary app:

```bash
app -> {
  app: {
    id: '....',
    adminToken: '...'
    title: 'my-new-app',
    createdAt: '...'
    orgId: null,
  },
  ...
}
```

You can use this app `id` and `adminToken` in Instant SDKs.

Temporary apps are great, but they only last 2 weeks. What if you want to make apps that last forever?

## Long-lived apps

To create long-lived apps, you'll need to authenticate first.

### Authentication for creating apps

You have two options for authenticate and create long-lived apps:

**Option 1: Personal Access Tokens**

The quickest way to get started is to create a Personal Access Token.

You can create Personal Access Tokens by going to to user settings in `Dashboard -> Settings -> New Accesss Token`. Here's a direct [link](https://www.instantdb.com/dash/user-settings).

Once you click "New Access Token", you'll get a token that this:

```bash
per_xxx11x1xxx1xx1x11x1x1111xxx1xx11x11xxxx1x1x1x1111xxx11111xxx111x
```

When you use this token to create apps, they will get associated to the account where you created the token.

**Option 2: Let users Sign in with Instant**

Alternatively, you can create a "Sign in with Instant" button in your app. This button would let end-users provide their own Instant accounts, and give you permissions to manage apps on their behalf.

To do this, you can use the Platform SDK and set up Oauth. To see how to set this up, follow the tutorial in the [Platform Oauth Guide](https://github.com/instantdb/instant/tree/main/client/packages/platform#oauth-flow).

When you're done and a user clicks "Sign in with Instant" in your app, you'll get a token that looks like this:

```bash
pat_xxx11x1xxx1xx1x11x1x1111xxx1xx11x11xxxx1x1x1x1111xxx11111xxx111x
```

When you use this token to create apps, they will get associated to that user's account.

### Using tokens to create long-lived apps

Now that we have auth tokens, let's use them to create an app.

**To create a long-lived app with the CLI:**

```bash
# TODO personal-access-token did not work!
npx instant-cli init-without-files --title my-long-lived-app --token YOUR_TOKEN
```

Pretty nice!

**And similarily, for the platform API:**

```javascript
import { PlatformApi } from '@instantdb/platform';

const api = new PlatformApi({
  auth: { token: 'YOUR_TOKEN' } })
});

const app = await api.createApp({
  title: 'my-new-app'
})
```

With that, you'll have long-lived apps!

## Managing schemas and permissions

Now that you have an app, you can change schemas and permissions too.

**To change schemas and perms with the CLI:**

If you are using the CLI, you'll have your `instant.schema.ts` and `instant.perms.ts` files in your directory. Run the [standard](/docs/cli) CLI push and pull commands with your token:

```ts
// src/instant.schema.ts
import { i } from '@instantdb/react';

const schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string().indexed(),
      done: i.boolean(),
      completedAt: i.date().optional(),
    }),
  },
});
```

```bash
npx instant-cli push schema --token YOUR_TOKEN
```

**To change schemas and perms with the CLI:**

For the platform SDK, you can use the corresponding `pushSchema` and `pullSchema` commands. Here's a snippet for push schema:

```typescript
import { PlatformApi, i } from '@instantdb/platform';

const schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string().indexed(),
      done: i.boolean(),
      completedAt: i.date().optional(),
    }),
  },
});

const { steps } = await api.schemaPush(YOUR_APP_ID, { schema: schema });
```

To see more details, check out the [Platform SDK reference](https://github.com/instantdb/instant/tree/main/client/packages/platform#making-api-requests).

### Note: scoping tokens _per app_

You can always use the access tokens you made to change schemas and perms, but you may not want to expose them, particularily if you are using the CLI.

For example, you wouldn't want the sandbox for one app to be able to push the schema to another app.

To fix this, **you can use the admin token** as auth inside the CLI:

```bash
npx instant-cli push schema --token YOUR_ADMIN_TOKEN
```

This way, push and pull commands will _only_ work for that app.

### Questions?
