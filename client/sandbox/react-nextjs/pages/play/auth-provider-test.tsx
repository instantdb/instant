import { init, tx, id, InstantAuthContext } from '@instantdb/react';
import config from '../../config';
import Login from '../../components/Login';

// Initialize the database
const db = init(config);

// Test component that uses useCurrentUser
function AuthenticatedApp() {
  const user = db.useCurrentUser(); // This is guaranteed to be non-null!
  const { isLoading, error, data } = db.useQuery({ goals: { todos: {} } });

  if (isLoading) return <div>Loading Query...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="p-4">
      <h1>Welcome {user.email}!</h1>
      <h2>User ID: {user.id}</h2>
      <p>✅ This component has guaranteed access to user data!</p>
      <p>No loading states or null checks needed!</p>

      <div className="mt-4 space-x-2">
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded border-2"
          onClick={() => {
            const todoAId = id();
            const todoBId = id();
            db.transact([
              tx.todos[todoAId].update({
                title: 'Go on a run',
                creatorId: user.id, // No need for user! assertion
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
          Create Example Data
        </button>

        <button
          className="px-4 py-2 bg-red-500 text-white rounded border-2"
          onClick={() => {
            const goalIds = data.goals.map((g) => g.id);
            const todoIds = data.goals
              .map((g) => g.todos.map((t) => t.id))
              .flat();
            db.transact([
              ...goalIds.map((id) => tx.goals[id].delete()),
              ...todoIds.map((id) => tx.todos[id].delete()),
            ]);
          }}
        >
          Clear Data
        </button>

        <button
          className="px-4 py-2 rounded border-2"
          onClick={() => {
            db.auth.signOut();
          }}
        >
          Sign Out
        </button>
      </div>

      <pre className="mt-4 bg-gray-100 p-2 rounded">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

// Custom provider component that handles auth states
function CustomAuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoading, user, error } = db.useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading authentication...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-red-600">Auth error: {error.message}</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <Login auth={db.auth} />
      </div>
    );
  }

  // Provide authenticated user to child components
  return (
    <InstantAuthContext.Provider value={user}>
      {children}
    </InstantAuthContext.Provider>
  );
}

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">InstantAuthContext Test</h1>
        <p className="mb-4">
          Demonstrate how to use InstantAuthContext and useCurrentUser. Login
          below to access the authenticated app.
        </p>
        <CustomAuthProvider>
          <AuthenticatedApp />
        </CustomAuthProvider>
      </div>
    </div>
  );
}

export default App;
