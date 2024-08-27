import { useEffect, useState } from "react";

import { init, tx, id } from "@instantdb/react";
import config from "../../config";
import Login from "../../components/Login";

const { auth, useAuth, transact, useQuery } = init(config);

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
  return <Login auth={auth} />;
}

function Main({ user }: { user: { id: string; email: string } }) {
  const { isLoading, error, data } = useQuery({ users: {} });
  useEffect(() => {
    if (isLoading) return;

    // Don't add the user if it already exists
    if (data?.users.find((u: any) => u.email === user.email)) return;

    // This is a new user so let's add them to the database!
    // and give them a random color between red, blue , and yellow
    const randomColor = ["red", "blue", "yellow"][Math.floor(Math.random() * 3)];
    transact(tx.users[id()].update({ email: user.email, randomColor }));
  }, [isLoading]);

  if (isLoading) return <div>Loading Query...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="p-4">
      <h1>Hi {user.email}!</h1>
      <button
        className="px-4 py-2 rounded border-2 my-2"
        onClick={(e) => {
          auth.signOut();
        }}
      >
        Sign Out
      </button>
      {/* Render all the users */}
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

export default App;
