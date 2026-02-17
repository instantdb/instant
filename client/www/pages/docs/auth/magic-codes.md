---
title: Magic Code Auth
description: How to add magic code auth to your Instant app.
---

{% nav-default value="react" %}

Instant supports a "magic-code" flow for auth. Users provide their email, we send
them a login code on your behalf, and they authenticate with your app.

Choose the platform you're building for to see a full example.

{% div className="not-prose" %}
{% div className="grid grid-cols-3 gap-4" %}
{% nav-button
  title="Web"
  description="For Next.js or other React frameworks"
  param="platform"
  value="react" /%}
{% nav-button
  title="Mobile"
  description="For Expo and React Native"
  param="platform"
  value="react-native" /%}
{% nav-button
  title="Vanilla JS"
  description="For non-react based frameworks"
  param="platform"
  value="vanilla" /%}
{% /div %}
{% /div %}

## Full Magic Code Example

{% conditional param="platform" value="react" %}

Here's a full example of magic code auth in a React app. Open up your `app/page.tsx` file, and replace the entirety of it with the following code:

```tsx {% showCopy=true %}
'use client';

import React, { useState } from 'react';
import { init } from '@instantdb/react';

const APP_ID = '__APP_ID__';
const db = init({ appId: APP_ID });

function App() {
  return (
    <>
      <db.SignedIn>
        <Main />
      </db.SignedIn>
      <db.SignedOut>
        <Login />
      </db.SignedOut>
    </>
  );
}

function Main() {
  const user = db.useUser();
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Hello {user.email}!</h1>
      <button
        onClick={() => db.auth.signOut()}
        className="bg-blue-600 px-3 py-1 font-bold text-white hover:bg-blue-700"
      >
        Sign out
      </button>
    </div>
  );
}

function Login() {
  const [sentEmail, setSentEmail] = useState('');

  return (
    <div className="flex min-h-screen items-center justify-center">
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
      alert('Uh oh :' + err.body?.message);
      onSendEmail('');
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
        className="w-full border border-gray-300 px-3 py-1"
        placeholder="Enter your email"
        required
        autoFocus
      />
      <button
        type="submit"
        className="w-full bg-blue-600 px-3 py-1 font-bold text-white hover:bg-blue-700"
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
      inputEl.value = '';
      alert('Uh oh :' + err.body?.message);
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
        className="w-full border border-gray-300 px-3 py-1"
        placeholder="123456..."
        required
        autoFocus
      />
      <button
        type="submit"
        className="w-full bg-blue-600 px-3 py-1 font-bold text-white hover:bg-blue-700"
      >
        Verify Code
      </button>
    </form>
  );
}

export default App;
```

{% /conditional %}

{% conditional param="platform" value="react-native" %}

Here's a full example of magic code auth in a React Native app. Open up your `app/index.tsx` file, and replace the entirety of it with the following code:

```tsx {% showCopy=true %}
import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet } from 'react-native';
import { init } from '@instantdb/react-native';

const APP_ID = '__APP_ID__';
const db = init({ appId: APP_ID });

function App() {
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return <Text>Loading...</Text>;
  }
  if (error) {
    return <Text>Uh oh! {error.message}</Text>;
  }
  if (user) {
    return <Main />;
  }
  return <Login />;
}

function Main() {
  const user = db.useUser();
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Hello {user.email}!</Text>
      <Button title="Sign Out" onPress={() => db.auth.signOut()} />
    </View>
  );
}

function Login() {
  const [sentEmail, setSentEmail] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  if (!sentEmail) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Let's log you in!</Text>
        <TextInput
          placeholder="Enter your email"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />
        <Button
          title="Send Code"
          onPress={() => {
            setSentEmail(email);
            db.auth.sendMagicCode({ email }).catch((err) => {
              Alert.alert('Uh oh', err.body?.message);
              setSentEmail('');
            });
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter your code</Text>
      <Text>
        We sent an email to {sentEmail}. Check your email, and enter the code
        you see.
      </Text>
      <TextInput
        placeholder="123456..."
        value={code}
        onChangeText={setCode}
        style={styles.input}
      />
      <Button
        title="Verify Code"
        onPress={() => {
          db.auth
            .signInWithMagicCode({ email: sentEmail, code })
            .catch((err) => {
              Alert.alert('Uh oh', err.body?.message);
              setCode('');
            });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    marginVertical: 8,
  },
});

export default App;
```

{% /conditional %}

{% conditional param="platform" value="vanilla" %}

Here's a full example of magic code auth with vanilla JavaScript. Open up your `src/main.ts` file, and replace the entirety of it with the following code:

```typescript {% showCopy=true %}
import { init, type User } from '@instantdb/core';

const APP_ID = '__APP_ID__';
const db = init({ appId: APP_ID });

const app = document.getElementById('app')!;

let sentEmail = '';

function renderApp(user: User | undefined) {
  if (user) {
    renderMain(user);
  } else {
    renderLogin();
  }
}

function renderMain(user: User) {
  app.innerHTML = `
    <div>
      <h1>Hello ${user.email}!</h1>
      <button id="sign-out">Sign out</button>
    </div>
  `;
  document.getElementById('sign-out')!.addEventListener('click', () => {
    db.auth.signOut();
  });
}

function renderLogin() {
  if (!sentEmail) {
    renderEmailStep();
  } else {
    renderCodeStep();
  }
}

function renderEmailStep() {
  app.innerHTML = `
    <div>
      <h2>Let's log you in</h2>
      <p>
        Enter your email, and we'll send you a verification code.
        We'll create an account for you too if you don't already have one.
      </p>
      <form id="email-form">
        <input
          id="email-input"
          type="email"
          placeholder="Enter your email"
          required
        />
        <button type="submit">Send Code</button>
      </form>
    </div>
  `;
  document.getElementById('email-form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = (document.getElementById('email-input') as HTMLInputElement)
      .value;
    sentEmail = email;
    renderLogin();
    db.auth.sendMagicCode({ email }).catch((err) => {
      alert('Uh oh: ' + err.body?.message);
      sentEmail = '';
      renderLogin();
    });
  });
}

function renderCodeStep() {
  app.innerHTML = `
    <div>
      <h2>Enter your code</h2>
      <p>
        We sent an email to <strong>${sentEmail}</strong>.
        Check your email, and paste the code you see.
      </p>
      <form id="code-form">
        <input
          id="code-input"
          type="text"
          placeholder="123456..."
          required
        />
        <button type="submit">Verify Code</button>
      </form>
    </div>
  `;
  document.getElementById('code-form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const codeInput = document.getElementById('code-input') as HTMLInputElement;
    const code = codeInput.value;
    db.auth.signInWithMagicCode({ email: sentEmail, code }).catch((err) => {
      alert('Uh oh: ' + err.body?.message);
      codeInput.value = '';
    });
  });
}

db.subscribeAuth((auth) => {
  renderApp(auth.user);
});
```

Make sure you have a `<div id="app"></div>` element in your HTML.

{% /conditional %}

---

**Let's dig deeper.**

We created a login flow to handle magic code auth. Of note is `auth.sendMagicCode`
and `auth.signInWithMagicCode`.

On successful validation, Instant's backend will return a user object with a refresh token.
The client SDK will then restart the websocket connection with Instant's sync layer and provide the refresh token.

When doing queries or transactions, the refresh token will be used to hydrate `auth`
on the backend during permission checks.

On the client, auth will now be populated with a `user` -- huzzah!

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

{% /nav-default %}
