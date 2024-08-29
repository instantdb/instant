---
title: Magic Code Auth
---

Instant supports a "magic-code" flow for auth. Users provide their email, we send
them a login code on your behalf, and they authenticate with your app. Here's
how you can do it with react.

## Full Magic Code Example

{% callout type="info" %}
The example below shows how to use magic codes in a React app. If you're looking
for an example with vanilla JS, check out this [sandbox](https://github.com/instantdb/instant/blob/main/client/sandbox/vanilla-js-vite/src/main.ts).
{% /callout %}

```javascript {% showCopy=true %}
'use client';

import React, { useState } from 'react';
import { init } from '@instantdb/react';

const APP_ID = '__APP_ID__';

const db = init({ appId: APP_ID });

function App() {
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Uh oh! {error.message}</div>;
  }
  if (user) {
    return <h1>Hello {user.email}!</h1>;
  }
  return <Login />;
}

function Login() {
  const [sentEmail, setSentEmail] = useState('');
  return (
    <div style={authStyles.container}>
      {!sentEmail ? (
        <Email setSentEmail={setSentEmail} />
      ) : (
        <MagicCode sentEmail={sentEmail} />
      )}
    </div>
  );
}

function Email({ setSentEmail }) {
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email) return;
    setSentEmail(email);
    db.auth.sendMagicCode({ email }).catch((err) => {
      alert('Uh oh :' + err.body?.message);
      setSentEmail('');
    });
  };

  return (
    <form onSubmit={handleSubmit} style={authStyles.form}>
      <h2 style={{ color: '#333', marginBottom: '20px' }}>Let's log you in!</h2>
      <div>
        <input
          style={authStyles.input}
          placeholder="Enter your email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <button type="submit" style={authStyles.button}>
          Send Code
        </button>
      </div>
    </form>
  );
}

function MagicCode({ sentEmail }) {
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    db.auth.signInWithMagicCode({ email: sentEmail, code }).catch((err) => {
      alert('Uh oh :' + err.body?.message);
      setCode('');
    });
  };

  return (
    <form onSubmit={handleSubmit} style={authStyles.form}>
      <h2 style={{ color: '#333', marginBottom: '20px' }}>
        Okay, we sent you an email! What was the code?
      </h2>
      <div>
        <input
          style={authStyles.input}
          type="text"
          placeholder="123456..."
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <button type="submit" style={authStyles.button}>
        Verify
      </button>
    </form>
  );
}

const authStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    fontFamily: 'Arial, sans-serif',
  },
  input: {
    padding: '10px',
    marginBottom: '15px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    width: '300px',
  },
  button: {
    padding: '10px 20px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
  },
};

export default App;
```

This creates a `Login` component to handle our auth flow. Of note is `auth.sendMagicCode`
and `auth.signInWithMagicCode`.

On successful validation, Instant's backend will return a user object with a refresh token.
The client SDK will then restart the websocket connection with Instant's sync layer and provide the refresh token.

When doing `useQuery` or `transact`, the refresh token will be used to hydrate `auth`
on the backend during permission checks.

On the client, `useAuth` will set `isLoading` to `false` and populate `user` -- huzzah!

{% partial file="auth/useAuth.md" /%}

## Send a Magic Code

```javascript
db.auth.sendMagicCode({ email }).catch((err) => {
  alert('Uh oh :' + err.body?.message);
  setState({ ...state, sentEmail: '' });
});
```

Use `auth.sendMagicCode` to generate a magic code on instant's backend and email it to the user.

## Sign in with Magic Code

```javascript
db.auth.signInWithMagicCode({ email: sentEmail, code }).catch((err) => {
  alert('Uh oh :' + err.body?.message);
  setState({ ...state, code: '' });
});
```

You can then use `auth.signInWithMagicCode` to authenticate the user with the magic code they provided.
