---
title: Firebase Auth
description: How to integrate Firebase's auth flow with Instant.
---

# Firebase Auth

Instant supports delegating auth to Firebase Auth.

## Setup

**Step 1: Get your Firebase Project ID**

On the [Firebase dashboard](https://console.firebase.google.com/), open your project and navigate to navigate to `Project Overview` > `⚙` > `Project Settings`, then copy the `Project ID`.

**Step 2: Register your Firebase Project ID with your instant app**

Go to the Instant dashboard, navigate to the `Auth` tab and add a new firebase auth app with the Project ID you copied.

## Usage

Use Firebase's `getIdToken` helper to get a JWT for your signed-in user. Then call Instant's `db.auth.signInWithIdToken` with the JWT and the client name you set on the Instant dashboard.

When you call `db.auth.signInWithIdToken`, Instant will verify that the JWT was signed by your Firebase app. If verified, Instant use the email in the JWT's claims to lookup your user or create a new one and create a long-lived session. Be sure to call Instant's `db.auth.signOut` when you want to sign the user out.

Here is a full example:

```tsx
'use client';

import { init } from '@instantdb/react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
} from 'firebase/auth';
import { useEffect, useState } from 'react';

// Instant app
const APP_ID = '__APP_ID__';

const db = init({ appId: APP_ID });

// Use the firebase client name you set in the Instant dashboard auth tab
const FIREBASE_CLIENT_NAME = 'REPLACE_ME';

const firebaseConfig = {
  // Use the same Project ID you set in the Instant dashboard auth tab
  projectId: 'REPLACE_ME',
  apiKey: 'REPLACE_ME',
};

const firebaseApp = initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        user.getIdToken().then((idToken) => {
          db.auth.signInWithIdToken({
            idToken,
            clientName: FIREBASE_CLIENT_NAME,
          });
        });
      } else {
        db.auth.signOut();
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    try {
      await createUserWithEmailAndPassword(firebaseAuth, email, password);
    } catch (error) {
      console.error('Sign up error:', error);
    }
  };

  return (
    <>
      <db.SignedOut>
        <form onSubmit={handleSignIn}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit">Sign In</button>
          <button type="button" onClick={handleSignUp}>
            Sign Up
          </button>
        </form>
      </db.SignedOut>
      <db.SignedIn>
        <SignedInComponent />
      </db.SignedIn>
    </>
  );
}

function SignedInComponent() {
  const user = db.useUser();

  const handleSignOut = async () => {
    await firebaseAuth.signOut();
  };

  return (
    <div>
      <div>Signed in as {user.email}!</div>
      <button onClick={handleSignOut}>Sign Out</button>
    </div>
  );
}

export default App;
```
