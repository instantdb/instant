import { useState } from 'react';
import { id, i, InstantReactAbstractDatabase } from '@instantdb/react';
import EphemeralAppPage from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string(),
    }),
    todos: i.entity({
      title: i.string(),
      done: i.boolean().optional(),
      owner: i.string(),
    }),
  },
  links: {
    userGuestUser: {
      forward: { on: '$users', has: 'one', label: 'linkedPrimaryUser' },
      reverse: { on: '$users', has: 'many', label: 'linkedGuestUsers' },
    },
  },
});

const perms = {
  todos: {
    bind: [
      'isOwner',
      'data.owner == auth.id',
      'isGuestOwner',
      "data.owner in auth.ref('$user.linkedGuestUsers.id')",
    ],
    allow: {
      view: 'isOwner || isGuestOwner',
      create: 'isOwner',
      update: 'isOwner || isGuestOwner',
      delete: 'isOwner',
    },
  },
};

function SignInWithMagicCode({
  db,
}: {
  db: InstantReactAbstractDatabase<typeof schema>;
}) {
  const [email, setEmail] = useState('a@b.c');
  const [sentEmail, setSentEmail] = useState('');
  const [code, setCode] = useState('');

  const handleSendCode = () => {
    setSentEmail(email);
    db.auth.sendMagicCode({ email }).catch((err) => {
      alert('Error: ' + err.body?.message);
      setSentEmail('');
    });
  };

  const handleVerifyCode = () => {
    db.auth.signInWithMagicCode({ email: sentEmail, code }).catch((err) => {
      alert('Error: ' + err.body?.message);
      setCode('');
    });
  };

  return (
    <div className="flex">
      <div className="w-[200px] flex items-center">
        <span className="text-sm font-medium">Magic Code</span>
      </div>
      <div className="w-[500px]">
        {!sentEmail ? (
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSendCode}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 whitespace-nowrap"
            >
              Send code
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleVerifyCode}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Verify
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SignInAsGuest({
  db,
}: {
  db: InstantReactAbstractDatabase<typeof schema>;
}) {
  const handleSignInAsGuest = () => {
    db.auth.signInAsGuest().catch((err) => {
      alert('Error: ' + err.body?.message);
    });
  };

  return (
    <div className="flex">
      <div className="w-[200px] flex items-center">
        <span className="text-sm font-medium">Guest</span>
      </div>
      <div className="w-[500px]">
        <button
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          onClick={handleSignInAsGuest}
        >
          Sign in as guest
        </button>
      </div>
    </div>
  );
}

function SignedOut({
  db,
}: {
  db: InstantReactAbstractDatabase<typeof schema>;
}) {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Sign In</h1>

      <div className="space-y-4">
        <SignInAsGuest db={db} />
        <SignInWithMagicCode db={db} />
      </div>
    </div>
  );
}

function SignedInAsGuest({
  user,
  db,
}: {
  user: any;
  db: InstantReactAbstractDatabase<typeof schema>;
}) {
  return (
    <div className="max-w-4xl mx-auto">
      <SignedIn user={user} db={db} />

      <h2 className="text-lg font-semibold mb-4">Upgrade your account</h2>
      <div className="space-y-4">
        <SignInWithMagicCode db={db} />
      </div>
    </div>
  );
}

function SignedIn({
  user,
  db,
}: {
  user: any;
  db: InstantReactAbstractDatabase<typeof schema>;
}) {
  const { data, isLoading, error } = db.useQuery({
    todos: { $: { where: { owner: user.id } } },
    $users: { $: { where: { linkedPrimaryUser: user.id } } },
  });

  async function transferTodos(guestId: string) {
    const {
      data: { todos },
    } = await db.queryOnce({
      todos: {
        $: {
          where: { owner: guestId },
        },
      },
    });
    if (!todos.length) {
      alert('Nothing to transfer!');
      return;
    }
    const txes = todos.map((todo) =>
      db.tx.todos[todo.id].update({ owner: user.id }),
    );
    await db.transact(txes);
  }

  const guestUsers = data?.$users;
  return (
    <div className="my-6 max-w-4xl mx-auto">
      <table className="min-w-full border mb-6">
        <tbody className="bg-white divide-y divide-gray-200">
          {Object.entries(user)
            .sort(([a], [b]) => a.localeCompare(b))
            .filter(([key]) => key !== 'refresh_token')
            .map(([key, value]) => (
              <tr key={key}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {key}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {typeof value === 'object'
                    ? JSON.stringify(value)
                    : String(value)}
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      {data ? (
        <div className="p-4">
          <div>Data for the user</div>
          {data.todos.map((x) => (
            <div key={x.id}>{x.title}</div>
          ))}
          <div>Linked Guest Users</div>
          {guestUsers?.map((u) => (
            <div>
              {u.id}
              <button
                className="ml-2 bg-blue-500 text-white px-2 text-sm hover:bg-blue-600"
                onClick={() => transferTodos(u.id)}
              >
                Transfer
              </button>
            </div>
          ))}
        </div>
      ) : isLoading ? (
        'Loading'
      ) : (
        <div>{error.message}</div>
      )}

      <button
        onClick={() =>
          db.transact(
            db.tx.todos[id()].update({
              owner: user.id,
              title: String(Math.floor(Math.random() * 100)),
            }),
          )
        }
        className="px-4 py-2 mr-4 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Add some todos
      </button>

      <button
        onClick={() => db.auth.signOut()}
        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
      >
        Sign out
      </button>
    </div>
  );
}

function UserDashboard({
  db,
}: {
  db: InstantReactAbstractDatabase<typeof schema>;
}) {
  const user = db.useUser();
  return user.isGuest ? (
    <SignedInAsGuest db={db} user={user} />
  ) : (
    <SignedIn db={db} user={user} />
  );
}

function App({ db }: { db: InstantReactAbstractDatabase<typeof schema> }) {
  return (
    <div>
      <db.SignedIn>
        <UserDashboard db={db} />
      </db.SignedIn>
      <db.SignedOut>
        <SignedOut db={db} />
      </db.SignedOut>
    </div>
  );
}

export default function Page() {
  return <EphemeralAppPage schema={schema} perms={perms} Component={App} />;
}
