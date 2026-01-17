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
        <h3 className="mb-2 text-lg font-bold">
          Logged in with Clerk and Instant
        </h3>

        <div className="mb-4">
          <button
            className="m-2 bg-black p-2 text-white"
            onClick={() => {
              db.auth.signOut();
            }}
          >
            Sign out Instant only
          </button>
          <button
            className="m-2 bg-black p-2 text-white"
            onClick={() => {
              signOut();
            }}
          >
            Sign out Clerk only
          </button>
          <button
            className="m-2 bg-black p-2 text-white"
            onClick={() => {
              db.auth.signOut().then(() => {
                signOut();
              });
            }}
          >
            Sign out both
          </button>
          <button
            className="m-2 bg-black p-2 text-white"
            onClick={signInWithToken}
          >
            Sign in to Instant again, just for fun
          </button>
        </div>

        <div className="mb-4">
          <h4 className="mb-1 font-semibold">Instant User Object:</h4>
          <pre className="rounded border bg-gray-100 p-2 text-xs">
            {JSON.stringify(user, null, 2)}
          </pre>
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
