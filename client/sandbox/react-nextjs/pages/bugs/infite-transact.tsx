import { i, id, InstantReactAbstractDatabase } from '@instantdb/react';
import { useState, useEffect } from 'react';
import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    todos: i.entity({
      text: i.string(),
    }),
  },
});

type Schema = typeof schema;

const perms = {
  todos: {
    allow: {
      view: 'true',
      create: 'false',
    },
  },
};

interface AppProps {
  db: InstantReactAbstractDatabase<Schema>;
  appId: string;
}

function App({ db }: AppProps) {
  const { data } = db.useQuery({ todos: {} });
  const [shouldTrigger, setShouldTrigger] = useState(false);
  const [attempts, setAttempts] = useState(0);

  function addTodo() {
    db.transact(db.tx.todos[id()].create({ text: `Todo ${Date.now()}` }));
  }

  useEffect(() => {
    if (shouldTrigger) {
      if (data?.todos && data.todos.length === 0) {
        addTodo();
        setAttempts(attempts + 1);
      }
    }
  }, [shouldTrigger, data?.todos]);

  return (
    <div className="flex flex-col items-center gap-4">
      <ResetButton className="bg-red-500 text-white px-4 py-2 rounded" />
      <div className="flex gap-4">
        <button
          onClick={() => {
            setShouldTrigger(true);
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Add Todo
        </button>
        <button
          onClick={() => {
            setShouldTrigger(false);
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Stop Adding Todos
        </button>
      </div>
      <div>Attempts: {attempts}</div>

      <div className="mt-4">
        <h3 className="font-bold">Todos ({data?.todos?.length || 0}):</h3>
        {data?.todos?.map((todo) => (
          <div key={todo.id} className="p-2 border-b">
            {todo.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <div className="max-w-lg flex flex-col mt-20 mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-center mb-4">
        Infinite transact bug
      </h1>
      <div className="space-y-4">
        <p>
          It's very easy to create an infinite transaction loop with useEffect
          and permissions.
        </p>
        <p>
          In this example we try to create todos when none exist (e.g seeding
          data on the client) but the permissions prevent us from creating them,
          which causes an infinite loop of trying to create todos.
        </p>
        <p>
          When you click "Add Todo", it will turn on a flag to create a todo if
          none exist. This will fail and trigger the useEffect to try again,
          which will keep trying until you click "Stop Adding Todos".
        </p>
        <p>
          It's very easy for an LLM to create a bug like this. It would be nice
          if we could at least rate limit in this scenario
        </p>
      </div>
      <EphemeralAppPage schema={schema} perms={perms} Component={App} />
    </div>
  );
}
