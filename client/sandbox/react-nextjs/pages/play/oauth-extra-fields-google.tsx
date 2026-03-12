import { init, User, i } from '@instantdb/react';
import { useState } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import config from '../../config';
import Link from 'next/link';

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID;
const GOOGLE_CLIENT_ID =
  '873926401300-t33oit5b8j5n0gl1nkk9fee6lvuiaia0.apps.googleusercontent.com';

const schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      displayName: i.string().optional(),
    }),
  },
});

const db = init({
  ...config,
  appId: APP_ID!,
  schema,
});

function App() {
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }
  if (error) {
    return (
      <div className="p-4">
        <div>Uh oh! {error.message}</div>
        <Login />
      </div>
    );
  }
  if (user) {
    return <Main user={user} />;
  }
  return (
    <div>
      <Instructions />
      <Login />
    </div>
  );
}

function Instructions() {
  return (
    <div className="m-4 rounded bg-yellow-50 p-4 text-sm">
      <p className="mb-2 font-bold">Prerequisites</p>
      <ol className="mb-3 list-inside list-decimal space-y-1">
        <li>
          Sandbox app in `.env` must exist with{' '}
          <code className="rounded bg-gray-100 px-1">displayName</code> as an
          optional attr on{' '}
          <code className="rounded bg-gray-100 px-1">$users</code>
        </li>
        <li>
          Set up Google OAuth clients via dashboard. Use{' '}
          <code className="rounded bg-gray-100 px-1">google-web</code> for
          redirect and{' '}
          <code className="rounded bg-gray-100 px-1">
            google-button-for-web
          </code>{' '}
          for the native button
        </li>
        <li>Local server running with the extra-fields branch</li>
        <li>
          (Optional) For Google Button: sync your clock to avoid clock sync
          error:{' '}
          <code className="rounded bg-gray-100 px-1">
            sudo sntp -sS time.apple.com
          </code>
        </li>
      </ol>
      <p className="mb-2 font-bold">Testing</p>
      <ol className="list-inside list-decimal space-y-1">
        <li>Type a display name below</li>
        <li>Click either "Google (Redirect)" or the Google Button</li>
        <li>After sign-in, the $users record should show your displayName</li>
        <li>
          Sign out, delete the user from the explorer, and sign in again without
          a display name to verify backwards compat
        </li>
      </ol>
      <p className="mt-3 text-xs text-gray-500">
        extraFields are only written on first creation. If displayName is
        missing, the user likely already existed. Delete and retry.
      </p>
    </div>
  );
}

function Login() {
  const [displayName, setDisplayName] = useState('');
  const [nonce] = useState(crypto.randomUUID());

  const redirectLoginURL = db.auth.createAuthorizationURL({
    clientName: 'google-web',
    redirectURL: window.location.href,
    extraFields: displayName ? { displayName } : undefined,
  });

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="p-4">
        <Link href="/">{'<-'} Home</Link>
        <h1 className="my-4 text-xl font-bold">
          Google OAuth Extra Fields Test
        </h1>
        <div className="my-4">
          <label className="block text-sm font-medium">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter a display name"
            className="mt-1 rounded border px-3 py-2"
          />
        </div>
        <div className="flex items-center gap-4">
          <a
            href={redirectLoginURL}
            className="inline-block rounded bg-blue-500 px-4 py-2 text-white"
          >
            Google (Redirect)
          </a>
          <GoogleLogin
            nonce={nonce}
            onError={() => alert('Login failed')}
            onSuccess={({ credential }) => {
              db.auth
                .signInWithIdToken({
                  clientName: 'google-button-for-web',
                  idToken: credential,
                  nonce,
                  extraFields: displayName ? { displayName } : undefined,
                })
                .catch((err) => {
                  alert('Uh oh: ' + err.body?.message);
                });
            }}
          />
        </div>
      </div>
    </GoogleOAuthProvider>
  );
}

function Main({ user }: { user: User }) {
  const { data } = db.useQuery({ $users: {} });
  const currentUser = data?.$users?.find((u: any) => u.id === user.id);

  return (
    <div className="p-4">
      <Link href="/">{'<-'} Home</Link>
      <h1 className="my-4 text-xl font-bold">Signed in!</h1>
      <div className="my-4">
        <p>
          <strong>Email:</strong> {user.email}
        </p>
        <p>
          <strong>ID:</strong> {user.id}
        </p>
        {currentUser && (
          <div className="mt-2">
            <p>
              <strong>$users record:</strong>
            </p>
            <pre className="mt-1 rounded bg-gray-100 p-2 text-sm">
              {JSON.stringify(currentUser, null, 2)}
            </pre>
          </div>
        )}
      </div>
      <button
        className="rounded border-2 px-4 py-2"
        onClick={() => db.auth.signOut()}
      >
        Sign Out
      </button>
    </div>
  );
}

export default App;
