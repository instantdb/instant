import { i, id, InstantReactAbstractDatabase } from '@instantdb/react';
import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    todos: i.entity({
      text: i.string(),
    }),
    comments: i.entity({
      text: i.string(),
    }),
  },
  links: {
    todoComments: {
      forward: { on: 'todos', has: 'many', label: 'comments' },
      reverse: { on: 'comments', has: 'one', label: 'todo' },
    },
  },
});

type Schema = typeof schema;

interface AppProps {
  db: InstantReactAbstractDatabase<Schema>;
  appId: string;
}

function App({ db }: AppProps) {
  const { data } = db.useQuery({ todos: { comments: {} } });

  function addTodo() {
    db.transact(db.tx.todos[id()].create({ text: `Todo ${Date.now()}` }));
  }

  function addComment(todoId: string) {
    db.transact(
      db.tx.comments[todoId]
        .create({ text: `Comment ${Date.now()}` })
        .link({ todo: todoId }),
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <ResetButton className="bg-red-500 text-white px-4 py-2 rounded" />
      <div className="flex gap-4">
        <button
          onClick={() => {
            addTodo();
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Add Todo
        </button>
      </div>

      <div className="mt-4">
        <h3 className="font-bold">Todos ({data?.todos?.length || 0}):</h3>
        {data?.todos?.map((todo) => (
          <div key={todo.id} className="p-2">
            {todo.text}
            <button
              onClick={() => addComment(todo.id)}
              className="ml-4 bg-green-500 text-white px-2 py-1 rounded"
            >
              Add Comment
            </button>
            {todo.comments && todo.comments.length > 0 && (
              <div className="mt-2">
                <h4 className="font-semibold">Comments:</h4>
                <ul className="list-disc pl-5">
                  {todo.comments.map((comment) => (
                    <li key={comment.id}>{comment.text}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const snippet = `const profileID = "7784278a-552b-4afc-97d3-6ca598cddc4f" // Different to userID
const userID = "6784278a-552b-4afc-97d3-6ca598cddc4f"

//Using the userID as profile id
db.transact(db.tx.profiles[userID].create(
  {
    name: "TESTNAME",
    username: "TESTUSERNAME",
    created_at: new Date().toISOString()
  }
).link({ $user: userID }))
`;

export default function Page() {
  return (
    <div className="max-w-lg flex flex-col mt-20 mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-center mb-4">Bad Create</h1>
      <p>
        We got a report that the following code snippet would throw an error
      </p>
      <pre className="bg-gray-200 whitespace-pre-wrap">{snippet}</pre>
      <p>This would return an error like so</p>
      <pre className="bg-red-200 whitespace-pre-wrap">
        Creating entities that exist: 6784278a-552b-4afc-97d3-6ca598cddc4f
      </pre>
      <p>The issue seems to be in how we validate create on the server.</p>
      <p>
        You can repro this issue by first creating a todo and then trying to add
        a comment to it. This will fail and you'll see an error in the console
      </p>
      <EphemeralAppPage schema={schema} Component={App} />
    </div>
  );
}
