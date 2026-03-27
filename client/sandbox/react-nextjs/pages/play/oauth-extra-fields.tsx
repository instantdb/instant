import { i, User, InstantReactAbstractDatabase } from '@instantdb/react';
import { useState } from 'react';
import EphemeralAppPage from '../../components/EphemeralAppPage';
import config from '../../config';
import Link from 'next/link';

const schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      username: i.string().unique().indexed().optional(),
      displayName: i.string().optional(),
    }),
  },
});

function getAdminToken(appId: string): string | null {
  try {
    return localStorage.getItem(`ephemeral-admin-token-${appId}`);
  } catch {
    return null;
  }
}

function App({
  db,
  appId,
}: {
  db: InstantReactAbstractDatabase<typeof schema>;
  appId: string;
}) {
  const { isLoading, user, error } = db.useAuth();
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return (
      <div className="p-4">
        <div>Uh oh! {error.message}</div>
        <Login db={db} appId={appId} />
      </div>
    );
  }
  if (user) {
    return <Main db={db} user={user} />;
  }
  return <Login db={db} appId={appId} />;
}

function Login({
  db,
  appId,
}: {
  db: InstantReactAbstractDatabase<typeof schema>;
  appId: string;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const adminToken = getAdminToken(appId);

  return (
    <div className="p-4">
      <Link href="/">{'<-'} Home</Link>
      <h1 className="my-4 text-xl font-bold">Extra Fields Test</h1>
      <div className="my-4">
        <label className="block text-sm font-medium">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter a username"
          className="mt-1 rounded border px-3 py-2"
        />
      </div>
      {!adminToken && (
        <p className="text-sm text-red-500">
          No admin token found. Try resetting the app.
        </p>
      )}
      {!sentTo ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              if (adminToken) {
                // Use admin endpoint to get the code directly
                const res = await fetch(`${config.apiURI}/admin/magic_code`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'app-id': appId,
                    authorization: `Bearer ${adminToken}`,
                  },
                  body: JSON.stringify({ email }),
                });
                const data = await res.json();
                setSentTo(email);
                setCode(data.code);
              } else {
                await db.auth.sendMagicCode({ email });
                setSentTo(email);
              }
            } catch (err: any) {
              setError(err.body?.message || err.message);
            }
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="mt-1 rounded border px-3 py-2"
          />
          <button
            type="submit"
            className="ml-2 rounded bg-blue-500 px-4 py-2 text-white"
          >
            Send Code
          </button>
        </form>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res = await db.auth.signInWithMagicCode({
                email: sentTo,
                code,
                extraFields: username ? { username } : undefined,
              });
              console.log('signInWithMagicCode result:', res);
              console.log('created:', res.created);
            } catch (err: any) {
              setError(err.body?.message || err.message);
            }
          }}
        >
          <p className="text-sm text-gray-600">Code sent to {sentTo}</p>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter code"
            className="mt-1 rounded border px-3 py-2"
          />
          <button
            type="submit"
            className="ml-2 rounded bg-blue-500 px-4 py-2 text-white"
          >
            Verify
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-red-500">{error}</p>}
    </div>
  );
}

function Main({
  db,
  user,
}: {
  db: InstantReactAbstractDatabase<typeof schema>;
  user: User;
}) {
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

export default function Page() {
  return <EphemeralAppPage schema={schema} Component={App} />;
}
