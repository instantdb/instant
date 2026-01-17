import { useState } from 'react';
import {
  init,
  tx,
  id,
  i,
  InstantReactAbstractDatabase,
  InstantSchemaDef,
} from '@instantdb/react';
import config from '../../config';
import EphemeralAppPage from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    groups: i.entity({
      name: i.string(),
    }),
    users: i.entity({
      name: i.string(),
    }),
  },
  links: {
    groupOwner: {
      forward: {
        on: 'groups',
        has: 'one',
        label: 'owner',
      },
      reverse: {
        on: 'users',
        has: 'many',
        label: 'ownedGroups',
      },
    },

    groupMembers: {
      forward: {
        on: 'groups',
        has: 'many',
        label: 'members',
      },
      reverse: {
        on: 'users',
        has: 'many',
        label: 'groups',
      },
    },
  },
});

type Schema = typeof schema;

const perms = {
  groups: {
    allow: {
      view: 'true',
      create: 'true',
      update: 'true',
      delete: 'true',
      link: {
        members: 'data.owner == auth.id || linkedData.id == auth.id',
      },
      unlink: {
        // both data.owner and data.ref("owner.id") works
        members: 'auth.id in data.ref("owner.id") || linkedData.id == auth.id',
      },
    },
  },
  users: {
    allow: {
      view: 'true',
      create: 'true',
      update: 'true',
      delete: 'true',
    },
  },
};

function Login({ db }: { db: InstantReactAbstractDatabase<Schema> }) {
  const [state, setState] = useState({
    sentEmail: '',
    email: '',
    code: '',
  });
  const { sentEmail, email, code } = state;
  return (
    <div>
      <div>
        {!sentEmail ? (
          <div key="em">
            <h2>Let's log you in!</h2>
            <div>
              <input
                placeholder="Enter your email"
                type="email"
                value={email}
                onChange={(e) => setState({ ...state, email: e.target.value })}
              />
            </div>
            <div>
              <button
                onClick={() => {
                  setState({ ...state, sentEmail: email });
                  db.auth.sendMagicCode({ email }).catch((err) => {
                    alert('Uh oh :' + err.body?.message);
                    setState({ ...state, sentEmail: '' });
                  });
                }}
              >
                Send Code
              </button>
            </div>
          </div>
        ) : (
          <div key="cd">
            <h2>Okay we sent you an email! What was the code?</h2>
            <div>
              <input
                type="text"
                placeholder="Code plz"
                value={code || ''}
                onChange={(e) => setState({ ...state, code: e.target.value })}
              />
            </div>
            <button
              onClick={(e) => {
                db.auth
                  .signInWithMagicCode({ email: sentEmail, code })
                  .catch((err) => {
                    alert('Uh oh :' + err.body?.message);
                    setState({ ...state, code: '' });
                  });
              }}
            >
              Verify
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Example({
  db,
  user,
}: {
  db: InstantReactAbstractDatabase<Schema>;
  user: { id: string };
}) {
  const { isLoading, error, data } = db.useQuery({
    groups: {
      members: {},
      owner: {},
    },
    users: {},
  });

  const me = user.id;

  const seedData = async () => {
    const user1 = id();
    const user2 = id();
    const user3 = id();
    const myGroup = id();
    const alicesGroup = id();

    await db.transact([
      tx.users[me].update({ name: 'Me' }),
      tx.users[user1].update({ name: 'Alice' }),
      tx.users[user2].update({ name: 'Bob' }),
      tx.users[user3].update({ name: 'Charlie' }),
      tx.groups[myGroup].update({ name: 'My Group' }).link({ owner: me }),
      tx.groups[alicesGroup]
        .update({ name: 'Alice’s Group' })
        .link({ owner: user1 }),
    ]);
  };

  const addMember = async (groupId: string, userId: string) => {
    try {
      await db.transact([tx.groups[groupId].link({ members: userId })]);
    } catch (error) {
      console.error('Failed to add member:', error);
      alert(`Failed to add member: ${error}`);
    }
  };

  const removeMember = async (groupId: string, userId: string) => {
    try {
      await db.transact([tx.groups[groupId].unlink({ members: userId })]);
    } catch (error) {
      console.error('Failed to remove member:', error);
      alert(`Failed to remove member: ${error}`);
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const groups = data?.groups || [];
  const users = data?.users || [];
  const currentUser = users.find((u) => u.id === me);

  return (
    <div className="p-8">
      <h1 className="mb-4 text-2xl font-bold">Link/Unlink Permissions Demo</h1>

      <div className="mb-6 rounded bg-gray-100 p-4">
        <p className="mb-2">
          Current User: {currentUser?.name || 'None'} (ID: {me || 'N/A'})
        </p>
        <button
          onClick={seedData}
          className="mr-2 rounded bg-blue-500 px-4 py-2 text-white"
        >
          Seed Data
        </button>
      </div>

      {groups.map((group) => {
        const isOwner = group?.owner?.id === me;
        const memberIds = new Set(group.members?.map((m: any) => m.id) || []);

        return (
          <div key={group.id} className="mb-6 rounded border p-4">
            <h2 className="mb-2 text-xl font-semibold">
              {group.name} (Owner:{' '}
              {users.find((u) => u.id === group?.owner?.id)?.name})
            </h2>

            <div className="mb-4">
              <h3 className="mb-2 font-semibold">Current Members:</h3>
              {group.members?.map((member: any) => (
                <div key={member.id} className="mb-1 flex items-center gap-2">
                  <span>{member.name}</span>
                  <button
                    onClick={() => removeMember(group.id, member.id)}
                    className="text-sm text-red-500"
                    title={
                      isOwner
                        ? 'Owner can remove anyone'
                        : 'Users can only remove themselves'
                    }
                  >
                    Remove{' '}
                    {isOwner
                      ? '(as owner)'
                      : member.id === me
                        ? '(self)'
                        : '(no permission)'}
                  </button>
                </div>
              ))}
            </div>

            <div>
              <h3 className="mb-2 font-semibold">Available Users:</h3>
              {users
                .filter((u) => !memberIds.has(u.id))
                .map((user) => (
                  <div key={user.id} className="mb-1 flex items-center gap-2">
                    <span>{user.name}</span>
                    <button
                      onClick={() => addMember(group.id, user.id)}
                      className="text-sm text-green-500"
                    >
                      Add
                    </button>
                  </div>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Router({ appId }: { appId: string }) {
  const db = init({ ...config, appId, schema });

  const auth = db.useAuth();
  if (auth.isLoading) {
    return <div>Loading...</div>;
  }
  if (auth.error) {
    return <div>Uh oh! {auth.error.message}</div>;
  }
  if (!auth.user) {
    return <Login db={db} />;
  }

  return <Example db={db} user={auth.user} />;
}

export default function Page() {
  return <EphemeralAppPage schema={schema} perms={perms} Component={Router} />;
}
