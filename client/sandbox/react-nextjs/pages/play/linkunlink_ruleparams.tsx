import { useState } from 'react';
import { init, tx, id, i } from '@instantdb/react';
import config from '../../config';
import EphemeralAppPage from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    groups: i.entity({
      name: i.string(),
      ownerId: i.string(),
    }),
    users: i.entity({
      name: i.string(),
    }),
  },
  links: {
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

const perms = {
  groups: {
    allow: {
      view: 'true',
      create: 'true',
      update: 'true',
      delete: 'true',
      link: {
        members: 'data.ownerId == auth.id || linkedData.id == auth.id',
      },
      unlink: {
        members: 'data.ownerId == auth.id || linkedData.id == auth.id',
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

function Example({ appId }: { appId: string }) {
  const db = init({ ...config, appId, schema });
  const [currentUserId, setCurrentUserId] = useState<string>('');

  const { isLoading, error, data } = db.useQuery({
    groups: {
      members: {},
    },
    users: {},
  });

  const seedData = async () => {
    const owner = id();
    const user1 = id();
    const user2 = id();
    const user3 = id();
    const groupId = id();

    await db.transact([
      tx.users[owner].update({ name: 'Owner' }),
      tx.users[user1].update({ name: 'Alice' }),
      tx.users[user2].update({ name: 'Bob' }),
      tx.users[user3].update({ name: 'Charlie' }),
      tx.groups[groupId].update({ name: 'Main Group', ownerId: owner }),
    ]);

    setCurrentUserId(owner);
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
  const currentUser = users.find((u) => u.id === currentUserId);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Link/Unlink Permissions Demo</h1>
      <p className="mb-4">
        Owners can add or remove anyone. Users can _only_ remove themselves.
      </p>
      <div className="mb-6 p-4 bg-gray-100 rounded">
        <p className="mb-2">
          Current User: {currentUser?.name || 'None'} (ID:{' '}
          {currentUserId || 'N/A'})
        </p>
        <button
          onClick={seedData}
          className="bg-blue-500 text-white px-4 py-2 rounded mr-2"
        >
          Seed Data
        </button>
        <select
          value={currentUserId}
          onChange={(e) => setCurrentUserId(e.target.value)}
          className="px-4 py-2 border rounded"
        >
          <option value="">Select User</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.id.slice(0, 8)}...)
            </option>
          ))}
        </select>
      </div>

      {groups.map((group) => {
        const isOwner = group.ownerId === currentUserId;
        const memberIds = new Set(group.members?.map((m: any) => m.id) || []);

        return (
          <div key={group.id} className="mb-6 p-4 border rounded">
            <h2 className="text-xl font-semibold mb-2">
              {group.name} (Owner:{' '}
              {users.find((u) => u.id === group.ownerId)?.name})
            </h2>

            <div className="mb-4">
              <h3 className="font-semibold mb-2">Current Members:</h3>
              {group.members?.map((member: any) => (
                <div key={member.id} className="flex items-center gap-2 mb-1">
                  <span>{member.name}</span>
                  <button
                    onClick={() => removeMember(group.id, member.id)}
                    className="text-red-500 text-sm"
                    title={
                      isOwner
                        ? 'Owner can remove anyone'
                        : 'Users can only remove themselves'
                    }
                  >
                    Remove{' '}
                    {isOwner
                      ? '(as owner)'
                      : member.id === currentUserId
                        ? '(self)'
                        : '(no permission)'}
                  </button>
                </div>
              ))}
            </div>

            <div>
              <h3 className="font-semibold mb-2">Available Users:</h3>
              {users
                .filter((u) => !memberIds.has(u.id))
                .map((user) => (
                  <div key={user.id} className="flex items-center gap-2 mb-1">
                    <span>{user.name}</span>
                    <button
                      onClick={() => addMember(group.id, user.id)}
                      className="text-green-500 text-sm"
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

export default function Page() {
  return <EphemeralAppPage schema={schema} perms={perms} Component={Example} />;
}
