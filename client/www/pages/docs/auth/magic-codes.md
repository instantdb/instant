---
title: Magic Code Auth
description: How to add magic code auth to your Instant app.
---

Instant supports a "magic-code" flow for auth. Users provide their email, we send
them a login code on your behalf, and they authenticate with your app. Here's
how you can do it with react.

## Full Magic Code Example

{% callout %}
The example below shows how to use magic codes in a React app. If you're looking
for an example with vanilla JS, check out this [sandbox](https://github.com/instantdb/instant/blob/main/client/sandbox/vanilla-js-vite/src/main.ts).
{% /callout %}

Open up your `app/page.tsx` file, and replace the entirety of it with the following code:

```javascript {% showCopy=true %}
"use client";

import React, { useState } from "react";
import { init, User } from "@instantdb/react";

// Instant app
const APP_ID = "__APP_ID__";
const db = init({ appId: APP_ID });

function App() {
  const { isLoading, user, error } = db.useAuth();

  if (isLoading) {
    return;
  }

  if (error) {
    return <div className="p-4 text-red-500">Uh oh! {error.message}</div>;
  }

  if (user) {
    // The user is logged in! Let's load the `Main`
    return <Main user={user} />;
  }
  // The use isn't logged in yet. Let's show them the `Login` component
  return <Login />;
}

function Main({ user }: { user: User }) {
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Hello {user.email}!</h1>
      <button
        onClick={() => db.auth.signOut()}
        className="px-3 py-1 bg-blue-600 text-white font-bold hover:bg-blue-700"
      >
        Sign out
      </button>
    </div>
  );
}

function Login() {
  const [sentEmail, setSentEmail] = useState("");

  return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="max-w-sm">
        {!sentEmail ? (
          <EmailStep onSendEmail={setSentEmail} />
        ) : (
          <CodeStep sentEmail={sentEmail} />
        )}
      </div>
    </div>
  );
}

function EmailStep({ onSendEmail }: { onSendEmail: (email: string) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const inputEl = inputRef.current!;
    const email = inputEl.value;
    onSendEmail(email);
    db.auth.sendMagicCode({ email }).catch((err) => {
      alert("Uh oh :" + err.body?.message);
      onSendEmail("");
    });
  };
  return (
    <form
      key="email"
      onSubmit={handleSubmit}
      className="flex flex-col space-y-4"
    >
      <h2 className="text-xl font-bold">Let's log you in</h2>
      <p className="text-gray-700">
        Enter your email, and we'll send you a verification code. We'll create
        an account for you too if you don't already have one.
      </p>
      <input
        ref={inputRef}
        type="email"
        className="border border-gray-300 px-3 py-1  w-full"
        placeholder="Enter your email"
        required
        autoFocus
      />
      <button
        type="submit"
        className="px-3 py-1 bg-blue-600 text-white font-bold hover:bg-blue-700 w-full"
      >
        Send Code
      </button>
    </form>
  );
}

function CodeStep({ sentEmail }: { sentEmail: string }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const inputEl = inputRef.current!;
    const code = inputEl.value;
    db.auth.signInWithMagicCode({ email: sentEmail, code }).catch((err) => {
      inputEl.value = "";
      alert("Uh oh :" + err.body?.message);
    });
  };

  return (
    <form
      key="code"
      onSubmit={handleSubmit}
      className="flex flex-col space-y-4"
    >
      <h2 className="text-xl font-bold">Enter your code</h2>
      <p className="text-gray-700">
        We sent an email to <strong>{sentEmail}</strong>. Check your email, and
        paste the code you see.
      </p>
      <input
        ref={inputRef}
        type="text"
        className="border border-gray-300 px-3 py-1  w-full"
        placeholder="123456..."
        required
        autoFocus
      />
      <button
        type="submit"
        className="px-3 py-1 bg-blue-600 text-white font-bold hover:bg-blue-700 w-full"
      >
        Verify Code
      </button>
    </form>
  );
}

export default App;
```

Go to `localhost:3000`, aand huzzah 🎉 You've got auth.

---

**Let's dig deeper.**

We created a `Login` component to handle our auth flow. Of note is `auth.sendMagicCode`
and `auth.signInWithMagicCode`.

On successful validation, Instant's backend will return a user object with a refresh token.
The client SDK will then restart the websocket connection with Instant's sync layer and provide the refresh token.

When doing `useQuery` or `transact`, the refresh token will be used to hydrate `auth`
on the backend during permission checks.

On the client, `useAuth` will set `isLoading` to `false` and populate `user` -- huzzah!

## useAuth

```javascript
function App() {
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return;
  }
  if (error) {
    return <div className="p-4 text-red-500">Uh oh! {error.message}</div>;
  }
  if (user) {
    return <Main />;
  }
  return <Login />;
}
```

Use `useAuth` to fetch the current user. Here we guard against loading
our `Main` component until a user is logged in

## Send a Magic Code

```javascript
db.auth.sendMagicCode({ email }).catch((err) => {
  alert('Uh oh :' + err.body?.message);
  onSendEmail('');
});
```

Use `auth.sendMagicCode` to generate a magic code on instant's backend and email it to the user.

## Sign in with Magic Code

```javascript
db.auth.signInWithMagicCode({ email: sentEmail, code }).catch((err) => {
  inputEl.value = '';
  alert('Uh oh :' + err.body?.message);
});
```

You can then use `auth.signInWithMagicCode` to authenticate the user with the magic code they provided.

## Sign out

```javascript
db.auth.signOut();
```

Use `auth.signOut` from the client to invalidate the user's refresh token and
sign them out.You can also use the admin SDK to sign out the user [from the
server](/docs/backend#sign-out).

## Get auth

```javascript
const user = await db.getAuth();
console.log('logged in as', user.email);
```

For scenarios where you want to know the current auth state without subscribing
to changes, you can use `getAuth`.
