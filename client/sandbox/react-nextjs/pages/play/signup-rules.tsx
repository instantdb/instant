import { i, User, InstantReactAbstractDatabase } from '@instantdb/react';
import { useState } from 'react';
import EphemeralAppPage from '../../components/EphemeralAppPage';
import config from '../../config';
import Link from 'next/link';

const schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      username: i.string().optional(),
      displayName: i.string().optional(),
    }),
  },
});

// Restrict signup to @allowed.com emails and require username >= 3 chars
const perms = {
  $users: {
    allow: {
      create:
        "data.email.endsWith('@allowed.com') && (data.username == null || data.username.size() >= 3)",
    },
  },
};

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
  if (isLoading) return <div className="p-4">Loading...</div>;
  if (error) {
    return (
      <div className="p-4">
        <div>Uh oh! {error.message}</div>
        <Login db={db} appId={appId} />
      </div>
    );
  }
  if (user) return <Main db={db} user={user} />;
  return <Login db={db} appId={appId} />;
}

function Login({
  db,
  appId,
}: {
  db: InstantReactAbstractDatabase<typeof schema>;
  appId: string;
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const adminToken = getAdminToken(appId);

  return (
    <div className="max-w-lg p-4">
      <Link href="/">{'<-'} Home</Link>
      <h1 className="my-4 text-xl font-bold">Signup Rules Test</h1>

      <div className="my-4 rounded bg-gray-50 p-3 text-sm">
        <p className="font-medium">Active create rule:</p>
        <pre className="mt-1 text-xs">
          {`data.email.endsWith('@allowed.com')\n  && (data.username == null || data.username.size() >= 3)`}
        </pre>
        <p className="mt-2 text-gray-600">
          Try signing up with a non-@allowed.com email, or with a username
          shorter than 3 characters.
        </p>
      </div>

      <div className="my-4 space-y-2">
        <div>
          <label className="block text-sm font-medium">
            Username (extraField)
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Optional, min 3 chars"
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">
            Display Name (extraField)
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>
      </div>

      {!sentTo ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              if (adminToken) {
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
            placeholder="Email (try @allowed.com vs other)"
            className="w-full rounded border px-3 py-2"
          />
          <button
            type="submit"
            className="rounded bg-blue-500 px-4 py-2 text-white"
          >
            Send Code
          </button>
        </form>
      ) : (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setResult(null);
            try {
              const extraFields: Record<string, string> = {};
              if (username) extraFields.username = username;
              if (displayName) extraFields.displayName = displayName;

              const res = await db.auth.signInWithMagicCode({
                email: sentTo!,
                code,
                extraFields:
                  Object.keys(extraFields).length > 0 ? extraFields : undefined,
              });
              setResult(`created: ${res.created}, user: ${res.user.email}`);
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
            className="w-full rounded border px-3 py-2"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-blue-500 px-4 py-2 text-white"
            >
              Verify
            </button>
            <button
              type="button"
              className="rounded border px-4 py-2"
              onClick={() => {
                setSentTo(null);
                setCode('');
                setError(null);
                setResult(null);
              }}
            >
              Reset
            </button>
          </div>
        </form>
      )}
      {error && (
        <div className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">
          {error}
        </div>
      )}
      {result && (
        <div className="mt-2 rounded bg-green-50 p-2 text-sm text-green-700">
          {result}
        </div>
      )}
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
    <div className="max-w-lg p-4">
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
            <p className="font-medium">$users record:</p>
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
  return <EphemeralAppPage schema={schema} perms={perms} Component={App} />;
}
