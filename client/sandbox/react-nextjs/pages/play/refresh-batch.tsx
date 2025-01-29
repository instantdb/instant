import { init, tx } from '@instantdb/react';
import { useEffect } from 'react';
import config from '../../config';

const db = init(config);

function App() {
  return <Main />;
}
const todoId = 'ae29562e-11cc-4024-917f-2b0397d5a3bb';
const profileId = 'b3141bb5-34e1-4c44-8872-92fac4018b84';
let count = 0;

function Main() {
  const todosQuery = db.useQuery({
    todos: { $: { where: { id: todoId } } },
  });
  const profilesQuery = db.useQuery({
    profiles: { $: { where: { id: profileId } } },
  });
  return (
    <div>
      <div>
        <div className="bold">Todos Query:</div>
        <pre className="h-48 overflow-y-scroll p-4">
          {JSON.stringify(todosQuery, null, 2)}
        </pre>
        <div className="bold">Profiles Query:</div>
        <pre className="h-48 overflow-y-scroll p-4">
          {JSON.stringify(profilesQuery, null, 2)}
        </pre>
        <div className="space-x-4">
          <button
            className="text-blue font-bold"
            onClick={() => {
              db.transact(
                tx.todos[todoId].update({
                  title: 'Updated at ' + ++count,
                }),
              );
            }}
          >
            Update Todo
          </button>
          <button
            className="text-blue font-bold"
            onClick={() => {
              db.transact(
                tx.profiles[profileId].update({
                  name: 'Updated at ' + ++count,
                }),
              );
            }}
          >
            Update Profile
          </button>
        </div>
        <div className="max-w-md">
          <p>
            Here's how you can trigger the invalidator to send multiple
            refreshes:{' '}
          </p>
          <p>
            1. Update `handle-refresh`, and add a{' '}
            <code>(Thread/sleep 1000)</code>
          </p>
          <p>2. Load this page</p>
          <p>3. Click between Update Todo and Update Profile</p>
          <p>You should see a batch size of 2.</p>
          <p>
            The reason you will only see a batch size of 2, is that the
            invalidator is good about dropping redundant refreshes. Here's how
            that works:
          </p>
          <p>
            Once we invalidate a query, we delete it form the datalog-cache.
            This makes it so further transactions that would have invalidated
            that query will no-op. This is why we need two different queries
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
