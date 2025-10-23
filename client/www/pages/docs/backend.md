---
title: Instant on the Backend
description: How to use Instant on the server with the Admin SDK.
---

You can use Instant on the server as well! This can be especially useful for
running scripts, custom auth flows, or sensitive application logic.

## Admin SDK

We currently offer a javascript library `@instantdb/admin` for using Instant in
a non-browser context. This library is similar to our client SDK with a few
tweaks.

### init

```javascript
import { init, id } from '@instantdb/admin';

// Instant app
const APP_ID = '__APP_ID__';
const db = init({
  appId: APP_ID,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN,
});
```

Similar to `@instantdb/react`, you must `init` before doing any queries or
writes. Running `init` authenticates you against our admin API. In addition to
providing your `appId`, you can provide your `adminToken`.

{% callout type="warning" %}

Whereas exposing your `appId` in source control is fine, it's not safe
to expose your `adminToken`. Permission checks will not run for queries and
writes from our admin API. Be sure to regenerate your token from your dashboard
if it accidentally leaks.

{% /callout %}

## Reading and Writing Data

`query` and `transact` let you read and write data as an admin.

### query

```javascript
const data = await db.query({ goals: {}, todos: {} });
const { goals, todos } = data;
```

In react we use `db.useQuery` to enable "live queries", queries that will
automatically update when data changes.

In the admin SDK we instead use an async `db.query` function that simply fires a
query once and returns a result.

### transact

```javascript
const res = await db.transact([db.tx.todos[id()].update({ title: 'Get fit' })]);
console.log('New todo entry made for with tx-id', res['tx-id']);
```

`db.transact` is an async function that behaves nearly identical to `db.transact`
from `@instantdb/react`. It returns a `tx-id` on success.

## Subscriptions on the backend

You can use `db.subscribeQuery` to subscribe to queries on the backend. This can be useful if you have backend processes that react to database changes.

For example, let's say we wanted to subscribe to a `tasks` table.

### With callbacks

You could pass in a callback to `db.subscribeQuery` that gets called with newly updated query results:

```typescript
const sub = db.subscribeQuery({ tasks: { $: { limit: 10 } } }, (payload) => {
  if (payload.type === 'error') {
    console.log('error', error);
    sub.close();
  } else {
    console.log('got data!', payload.data);
  }
});

// When you want to close the subscription:
sub.close();
```

### With async iterator

Or if you prefer, you can skip providing a callback and use async iterators:

```typescript
const sub = db.subscribeQuery({ tasks: { $: { limit: 10 } } });

for await (const payload of sub) {
  if (payload.type === 'error') {
    console.log('error', error);
    sub.close();
  } else {
    console.log('data', payload.data);
  }
}

// When you want to close the subscription:
sub.close();
```

{% callout type="note" %}
Subscriptions keep a live connection open on your backend. Be sure to close them when they’re no longer needed to avoid tying up resources unnecessarily.
{% /callout %}

## Schema

`init` also accepts a schema argument:

```typescript
import { init, id } from '@instantdb/admin';
import schema from '../instant.schema.ts';

// Instant app
const APP_ID = '__APP_ID__';
const db = init({
  appId: APP_ID,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN,
  schema,
});
```

If you add a schema, `db.query` and `db.transact` will come with autocompletion and typesafety out of the box. The backend will also use your schema to generate missing attributes.

To learn more about writing schemas, head on over to the [Modeling your data](/docs/modeling-data) section.

## Impersonating users

When you use the admin SDK, you can make _any_ query or transaction. As an admin, you bypass permissions.
But, sometimes you want to make queries on behalf of your users, and would like to respect permissions.

You can do this with the `db.asUser` function.

```javascript
// Scope by their email
const scopedDb = db.asUser({ email: 'alyssa_p_hacker@instantdb.com' });
// Or with their auth token
const token = db.auth.createToken({ email: 'alyssa_p_hacker@instantdb.com' });
const scopedDb = db.asUser({ token });
// Or use the db as a guest!
const scopedDb = db.asUser({ guest: true });
// Queries and transactions will run with those permissions
await scopedDb.query({ logs: {} });
```

### Running the admin SDK in client environments

Impersonation can also let you run the Admin SDK _without_ exposing an admin token.

```javascript
import { init } from '@instantdb/admin';

// If you only impersonate with a user token or as a guest,
// you can _skip_ admin credentials
const db = init({
  appId: process.env.INSTANT_APP_ID!
});

// Pass in a user token to run as a particular user
const userDB = db.asUser({
  token: "...",
});

// Or run as a guest
const guestDB = db.asUser({
  guest: true,
});

// Queries and transactions work will work with respective permissions
await userDB.query({ todos: {} });
await guestDB.query({ publicData: {} });
```

This approach is perfect for places where you need something like the Admin SDK, but don't want to expose admin credentials.

For example, what if you want to run a background daemon on a user's machine? You can't use the client SDK, because you don't need optimistic updates. You wouldn't want to provide the admin token, because this code runs on a user's machine. That's when impersonation really comes in handy.

{% callout type="note" %}
Without an `adminToken`, you must use `.asUser({ token })` or `asUser({ guest: true })` for all operations. Direct queries and transactions on the base `db` instance will fail, and you won't be able to impersonate with `asUser({ email })`. In protected environments we definitely recommend including the `adminToken`.
{% /callout %}

## Retrieve a user

As an admin, you can retrieve an app user record by `email`, `id`, or `refresh_token`. You can do this with the `db.auth.getUser` function.

```javascript
const user = await db.auth.getUser({ email: 'alyssa_p_hacker@instantdb.com' });
const user = await db.auth.getUser({
  id: userId,
});
const user = await db.auth.getUser({
  refresh_token: userRefreshToken,
});
```

## Delete a user

You can also delete an app user record by `email`, `id`, or `refresh_token`. You can do this with the `db.auth.deleteUser` function.

```javascript
const deletedUser = await db.auth.deleteUser({
  email: 'alyssa_p_hacker@instantdb.com',
});
const deletedUser = await db.auth.deleteUser({
  id: userId,
});
const deletedUser = await db.auth.deleteUser({
  refresh_token: userRefreshToken,
});
```

Note, this _only_ deletes the user record and any associated data with cascade on delete. If there's additional data you need to clean up you'll need to do it manually:

```javascript
const { goals, todos } = await db.query({
  goals: { $: { where: { creator: userId } } },
  todos: { $: { where: { creator: userId } } },
});

await db.transact([
  ...goals.map((item) => db.tx.goals[item.id].delete()),
  ...todos.map((item) => tx.todos[item.id].delete()),
]);
// Now we can delete the user
await db.auth.deleteUser({ id: userId });
```

## Presence in the Backend

If you use [rooms & presence](/docs/presence-and-topics), you may want to query for the data currently in a room with the admin API. This can be especially useful if you are sending a notification for example, and want to skip it if the user is already online.

To do get room data from the admin API, use `db.rooms.getPresence`:

```js
const data = await db.rooms.getPresence('chat', 'room-123');
console.log(Object.values(data));
// [{
//     'peer-id': '...',
//     user: { id: '...', email: 'foo@bar.com', ... },
//     data: { typing: true, ... },
//   },
// }];
```

## Sign Out

The `db.auth.signOut` method allows you to log out users. You can log a user out from every session by passing in their `email`, or `id`. Or you can log a user out from a particular session by passing in a `refresh_token`:

```javascript
// All sessions for this email sign out
await db.auth.signOut({ email: 'alyssa_p_hacker@instantdb.com' });
// All sessions for this user id sign out
const user = await db.auth.signOut({
  id: userId,
});
// Just sign out the session for this refresh token
await db.auth.signOut({
  refresh_token: userRefreshToken,
});
```

## Custom Auth

You can use the Admin SDK to create your own authentication flows. To implement custom auth flows, you would make one change in your backend, and one change in your frontend. Here's how it would look:

### 1. Backend: db.auth.createToken

Create a new `sign-in` endpoint in your backend.

This endpoint will use `db.auth.createToken` to generate an authentication token for the user.

```javascript
app.post('/sign-in', async (req, res) => {
  // your custom logic for signing users in
  // ...
  // on success, create and return a token
  const token = await db.auth.createToken({ email });
  return res.status(200).send({ token });
});
```

`db.auth.createToken` accepts either an email or a UUID. For the UUID variant:

```javascript
const token = await db.auth.createToken({ id });
```

If a user with the provider id or email does not exist, `db.auth.createToken` will create the user for you.

### 2. Frontend: db.auth.signInWithToken

Once your frontend calls your `sign-in` endpoint, it can then use the generated token and sign a user in with `db.auth.signInWithToken`.

Here's a full example:

```javascript
import React, { useState } from 'react';
import { init } from '@instantdb/react';

// Instant app
const APP_ID = "__APP_ID__";
const db = init({ appId: APP_ID });

async function customSignIn(
  email: string,
  password: string
): Promise<{ token: string }> {
  const response = await fetch('your-website.com/api/sign-in', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  return data;
}

function App() {
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Uh oh! {error.message}</div>;
  }
  if (user) {
    return <div>Hello {user.email}!</div>;
  }
  return <Login />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value);
  };

  const handlePasswordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value);
  };

  const handleSignIn = async () => {
    const data = await customSignIn(email, password); // initiate your custom sign in flow
    db.auth.signInWithToken(data.token); // sign in with the token on success
  };

  return (
    <div>
      <input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={handleEmailChange}
      />
      <input
        type="password"
        placeholder="Enter your password"
        value={password}
        onChange={handlePasswordChange}
      />
      <button onClick={handleSignIn}>Sign In</button>
    </div>
  );
}
```

## Custom magic codes

We support a [magic code flow](/docs/auth) out of the box. However, if you'd like to use your own email provider to send the code, you can do this with `db.auth.generateMagicCode` function:

```typescript
app.post('/custom-send-magic-code', async (req, res) => {
  const { code } = await db.auth.generateMagicCode(req.body.email);
  // Now you can use your email provider to send magic codes
  await sendMyCustomMagicCodeEmail(req.body.email, code);
  return res.status(200).send({ ok: true });
});
```

You can also use Instant's default email provider to send a magic code with `db.auth.sendMagicCode`:

```typescript
// You can trigger a magic code email in your backend with `sendMagicCode`
const { code } = await db.auth.sendMagicCode(req.body.email);
```

Similarly, you can verify a magic code with `db.auth.verifyMagicCode`:

```typescript
const user = await db.auth.verifyMagicCode(req.body.email, req.body.code);
const token = user.refresh_token;
```

## Authenticated Endpoints

You can also use the admin SDK to authenticate users in your custom endpoints. This would have two steps:

### 1. Frontend: user.refresh_token

In your frontend, the `user` object has a `refresh_token` property. You can pass this token to your endpoint:

```javascript
// client
import { init } from '@instantdb/react';

const db = init(/* ... */)

function App() {
  const { user } = db.useAuth();
  // call your api with `user.refresh_token`
  function onClick() {
    myAPI.customEndpoint(user.refresh_token, ...);
  }
}
```

### 2. Backend: auth.verifyToken

You can then use `auth.verifyToken` to verify the `refresh_token` that was passed in.

```javascript
app.post('/custom_endpoint', async (req, res) => {
  // verify the token this user passed in
  const user = await db.auth.verifyToken(req.headers['token']);
  if (!user) {
    return res.status(401).send('Uh oh, you are not authenticated');
  }
  // ...
});
```

### Syncing Auth

Sometimes you want to get the logged in user in the backend. Instant can automatically sync the logged in user for you. Here's how to do it.

Instant provides a `createInstantRouteHandler` function that generates a web standard endpoint that can be used to sync the refresh token to a cookie that your server can read.

To use it in NextJS:

```typescript
// src/app/api/instant/[...all]/route.ts
import { createInstantRouteHandler } from '@instantdb/react';

export const { GET, POST } = createInstantRouteHandler({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
});
```

The GET and POST functions accept a [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) and return a [Response](https://developer.mozilla.org/en-US/docs/Web/API/Request) so they should be able to be used in any framework.

Then, provide your mounted api url to the `init` function.

```typescript
export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  cookieEndpoint: '/api/instant', // the endpoint that you registered the route handler at.
  schema,
  useDateObjects: true,
});
```

## Server Side Rendering (Next.js)

The `@instantdb/react` package exports an `InstantSuspenseProvider` that you can use to enable server rendering on client pages via Suspense.

SSR is best used with the [cookie sync endpoint](/docs/backend#syncing-auth). If cookies are not synced, there will a brief flash of the query result from an unauthenticated user on the first render.

{% callout %}
To use the suspense query hook and SSR, make sure to update your import for the database object:

`import { init } from '@instantdb/react/nextjs'`
{% /callout %}

### Client Component Provider

```typescript
"use client";

// pass refreshToken from a server route
function App(props: { refreshToken?: string }) {
  return (
    <>
      <db.SignedIn>
        <InstantSuspenseProvider db={db} token={props.refreshToken}>
          <Main />
        </InstantSuspenseProvider>
      </db.SignedIn>
      <db.SignedOut>
        <Login />
      </db.SignedOut>
    </>
  );
}
```

### Server Component Provider

Since you can't pass an object from a server component to a client component, you must provide a config instead, using the same arguments you passed to `init`, stringifying the schema object.

```typescript
// /src/app/layout.tsx
import { InstantSuspenseProvider } from '@instantdb/react/nextjs';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const instantRefreshToken = cookieStore.get("instant_refresh_token");

  return (
    <html lang="en">
      <body className="antialiased">
        <InstantSuspenseProvider
          token={instantRefreshToken?.value}
          config={{
            appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
            schema: JSON.stringify(schema),
            useDateObjects: true,
          }}
        >
          {children}
        </InstantSuspenseProvider>
      </body>
    </html>
  );
}
```

### Using the suspense hook

The suspense hook is a drop in replacement for db.useQuery and can be used anywhere in a client component under a `InstantSuspenseProvider`.

```typescript
const { data: todos, pageInfo } = db.useSuspenseQuery({
  todos: {}
})

return <div>{todos.length}</div> // data is always defined
```
