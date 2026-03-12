import { init, User, i } from '@instantdb/react';
import { useState } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import config from '../../config';
import Link from 'next/link';

const APP_ID = '2d960014-0690-4dc5-b13f-a3c202663241';
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
  appId: APP_ID,
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
  return <Login />;
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
