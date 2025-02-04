import { useEffect, useState } from 'react';
import {
  ClerkProvider,
  useAuth,
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from '@clerk/nextjs';

import { init, InstantReactWebDatabase } from '@instantdb/react';
import config from '../../config';

function App({ db }: { db: InstantReactWebDatabase<any> }) {
  const { getToken, signOut } = useAuth();
  const signInWithToken = () => {
    getToken().then((jwt) => {
      if (!jwt) {
        throw new Error('no jwt');
      }
      db.auth.signInWithIdToken({ idToken: jwt, clientName: 'clerk' });
    });
  };
  useEffect(() => {
    signInWithToken();
  }, []);
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Uh oh! {error.message}</div>;
  }
  if (user) {
    return (
      <div>
        Logged in with clerk and instant.
        <div>
          <button
            onClick={() => {
              db.auth.signOut();
            }}
          >
            Sign out Instant only
          </button>
        </div>
        <div>
          <button
            onClick={() => {
              signOut();
            }}
          >
            Sign out Clerk only
          </button>
        </div>
        <div>
          <button
            onClick={() => {
              db.auth.signOut().then(() => {
                signOut();
              });
            }}
          >
            Sign out both
          </button>
        </div>
        <div>
          <button onClick={signInWithToken}>
            Sign in to Instant again, just for fun
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      Not logged in to Instant, logged in to Clerk.
      <div>
        <button onClick={signInWithToken}>
          Sign in to Instant with Clerk's auth
        </button>
      </div>
    </div>
  );
}

function Wrapper() {
  const appId = process.env.NEXT_PUBLIC_INSTANT_WITH_CLERK_APP_ID;
  const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!appId || !clerkPublishableKey) {
    return (
      <div>
        Make sure to add `NEXT_PUBLIC_INSTANT_WITH_CLERK_APP_ID` and
        `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to your .env file:
        <pre>
          NEXT_PUBLIC_INSTANT_WITH_CLERK_APP_ID="YOUR_APP_ID"
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="YOUR_CLERK_KEY"
        </pre>
      </div>
    );
  }

  const db = init({ ...config, appId: appId });

  return (
    <div style={{ margin: 40 }}>
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        afterSignOutUrl={'/play/clerk'}
      >
        <SignedOut>
          <SignInButton />
        </SignedOut>
        <SignedIn>
          <App db={db} />
        </SignedIn>
      </ClerkProvider>
    </div>
  );
}

export default Wrapper;
