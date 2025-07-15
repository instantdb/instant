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
providing your `appId`, you must also provide your `adminToken`.

{% callout type="warning" %}

Whereas exposing your `appId` in source control is fine, it's not safe
to expose your admin token. Permission checks will not run for queries and
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
const token = db.auth.createToken('alyssa_p_hacker@instantdb.com');
const scopedDb = db.asUser({ token });
// Or use the db as a guest!
const scopedDb = db.asUser({ guest: true });
// Queries and transactions will run with those permissions
await scopedDb.query({ logs: {} });
```

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

The `db.auth.signOut` method allows you to log out a users. You can log a user out from every session by passing in their `email`, or `id`. Or you can log a user out from a particular session by passing in a `refresh_token`:

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

This endpoint will use `db.auth.createToken` to generate an authentication token for the user:

```javascript
app.post('/sign-in', async (req, res) => {
  // your custom logic for signing users in
  // ...
  // on success, create and return a token
  const token = await db.auth.createToken(email);
  return res.status(200).send({ token });
});
```

If a user with this email does not exist, `auth.createToken` will create a user for you.

{% callout type="note" %}

Right now we require that every user _must_ have an email. If you need to relax this constraint let us know.

{% /callout %}

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
// You can tigger a magic code email in your backend with `sendMagicCode`
const { code } = await db.auth.sendMagicCode(req.body.email);
```

Similarily, you can verify a magic code with `db.auth.verifyMagicCode`:

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
