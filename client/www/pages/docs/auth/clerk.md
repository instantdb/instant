---
title: Clerk
description: How to integrate Clerk's auth flow with Instant.
---

Instant supports auth with Clerk.

## Setup

**Step 1: Configure Clerk**

Go to your Clerk dashboard, navigate to [`Sessions`](https://dashboard.clerk.com/last-active?path=sessions), then click the `Edit` button in the `Customize session token` section.

Add the email claim to your session token:

```json {% showCopy=true %}
{
  "email": "{{user.primary_email_address}}"
}
```

You can have additional claims as long as the `email` claim is set to `{{user.primary_email_address}}`.

![Clerk token form](/img/docs/clerk-token-form.png)

**Step 2: Get your Clerk Publishable key**

On the Clerk dashboard, navigate to [`API keys`](https://dashboard.clerk.com/last-active?path=api-keys), then copy the `Publishable key`. It should start with `pk_`.

**Step 3: Register your Clerk Publishable key with your instant app**

Go to the Instant dashboard, navigate to the `Auth` tab and add a new clerk app with the publishable key you copied.

## Usage

Use Clerk's `getToken` helper to get a session JWT for your signed-in user. Then call Instant's `db.auth.signInWithIdToken` with the JWT and the client name you set on the Instant dashboard.

When you call `db.auth.signInWithIdToken`, Instant will verify that the JWT was signed by your Clerk app. If verified, Instant use the email in the JWT's claims to lookup your user or create a new one and create a long-lived session. Be sure to call Instant's `db.auth.signOut` when you want to sign the user out.

Here is a full example using clerk's next.js library:

```javascript {% showCopy=true %}
'use client';

import {
  useAuth,
  ClerkProvider,
  SignInButton,
  SignedIn,
  SignedOut,
} from '@clerk/nextjs';
import { init } from '@instantdb/react';
import { useEffect } from 'react';

// Instant app
const APP_ID = '__APP_ID__';

const db = init({ appId: APP_ID });

// Use the clerk client name you set in the Instant dashboard auth tab
const CLERK_CLIENT_NAME = 'REPLACE_ME';

function ClerkSignedInComponent() {
  const { getToken, signOut } = useAuth();

  const signInToInstantWithClerkToken = async () => {
    // getToken gets the jwt from Clerk for your signed in user.
    const idToken = await getToken();

    if (!idToken) {
      // No jwt, can't sign in to instant
      return;
    }

    // Create a long-lived session with Instant for your clerk user
    // It will look up the user by email or create a new user with
    // the email address in the session token.
    db.auth.signInWithIdToken({
      clientName: CLERK_CLIENT_NAME,
      idToken: idToken,
    });
  };

  useEffect(() => {
    signInToInstantWithClerkToken();
  }, []);

  const { isLoading, user, error } = db.useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Error signing in to Instant! {error.message}</div>;
  }
  if (user) {
    return (
      <div>
        <p>Signed in with Instant through Clerk!</p>{' '}
        <button
          onClick={() => {
            // First sign out of Instant to clear the Instant session.
            db.auth.signOut().then(() => {
              // Then sign out of Clerk to clear the Clerk session.
              signOut();
            });
          }}
        >
          Sign out
        </button>
      </div>
    );
  }
  return (
    <div>
      <button onClick={signInToInstantWithClerkToken}>
        Sign in to Instant
      </button>
    </div>
  );
}

function App() {
  return (
    <ClerkProvider>
      <SignedOut>
        <SignInButton />
      </SignedOut>
      <SignedIn>
        <ClerkSignedInComponent />
      </SignedIn>
    </ClerkProvider>
  );
}

export default App;
```
