import { useState } from 'react';
import { init, tx, id, User } from '@instantdb/react';
import config from '../../config';

const { useAuth, useQuery, transact, auth } = init(config);

async function customSignIn(email: string): Promise<{ token: string }> {
  const response = await fetch('http://localhost:3005/signin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });
  const data = await response.json();
  return data;
}

function App() {
  const { isLoading, user, error } = useAuth();
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Uh oh! {error.message}</div>;
  }
  if (user) {
    return <Main user={user} />;
  }
  return <Login />;
}

// 4. Log users in!
function Login() {
  const [email, setEmail] = useState('');

  const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value);
  };

  const handleSignIn = async () => {
    const data = await customSignIn(email);
    auth.signInWithToken(data.token);
  };

  return (
    <div>
      <input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={handleEmailChange}
      />
      <button onClick={handleSignIn}>Sign In</button>
    </div>
  );
}

// 5. Make queries to your heart's content!
// Checkout InstaQL for examples
// https://paper.dropbox.com/doc/InstaQL--BgBK88TTiSE9OV3a17iCwDjCAg-yVxntbv98aeAovazd9TNL
function Main({ user }: { user: User }) {
  const { isLoading, error, data } = useQuery({ goals: { todos: {} } });
  if (isLoading) return <div>Loading Query...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return (
    <div className="p-4">
      <h1>Hi {user.email}!</h1>
      <h2>id: {user.id}</h2>
      <button
        className="px-4 py-2 bg-blue-500 text-white rounded border-2 my-2"
        onClick={(e) => {
          const todoAId = id();
          const todoBId = id();
          transact([
            tx.todos[todoAId].update({
              title: 'Go on a run',
              creatorId: user.id,
            }),
            tx.todos[todoBId].update({
              title: 'Drink a protein shake',
              creatorId: user.id,
            }),
            tx.goals[id()]
              .update({
                title: 'Get six pack abs',
                priority6: 1,
                creatorId: user.id,
              })
              .link({ todos: todoAId })
              .link({ todos: todoBId }),
          ]);
        }}
      >
        Create some example data
      </button>
      <button
        className="px-4 py-2 bg-red-500 text-white rounded border-2 my-2"
        onClick={(e) => {
          const goalIds = data.goals.map((g) => g.id);
          const todoIds = data.goals
            .map((g) => g.todos.map((t) => t.id))
            .flat();
          transact([
            ...goalIds.map((id) => tx.goals[id].delete()),
            ...todoIds.map((id) => tx.todos[id].delete()),
          ]);
        }}
      >
        Clear Data
      </button>

      <button
        className="px-4 py-2 rounded border-2 my-2"
        onClick={(e) => {
          auth.signOut();
        }}
      >
        Sign Out
      </button>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

export default App;
