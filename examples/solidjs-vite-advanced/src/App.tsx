import { type Component, Switch, Match } from "solid-js";
import { db } from "./lib/db";
import Login from "./components/Login";
import StatusBar from "./components/StatusBar";
import TodoList from "./components/TodoList";
import PresenceBar from "./components/PresenceBar";
import ChatPanel from "./components/ChatPanel";

const App: Component = () => {
  const auth = db.useAuth();

  return (
    <div class="min-h-screen bg-gray-50">
      <Switch>
        <Match when={auth().isLoading}>
          <div class="flex items-center justify-center min-h-screen">
            <p class="text-gray-500">Loading...</p>
          </div>
        </Match>
        <Match when={auth().error}>
          <div class="flex items-center justify-center min-h-screen">
            <p class="text-red-500">Auth error: {auth().error?.message}</p>
          </div>
        </Match>
        <Match when={auth().user}>
          <AuthenticatedApp />
        </Match>
        <Match when={true}>
          <Login />
        </Match>
      </Switch>
    </div>
  );
};

const AuthenticatedApp: Component = () => {
  const user = db.useUser();

  return (
    <div class="max-w-4xl mx-auto p-4 space-y-4">
      <header class="flex items-center justify-between bg-white rounded-lg shadow p-4">
        <div>
          <h1 class="text-xl font-bold">SolidJS + InstantDB Advanced Demo</h1>
          <p class="text-sm text-gray-500">Signed in as {user().email}</p>
        </div>
        <button
          class="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
          onClick={() => db.auth.signOut()}
        >
          Sign out
        </button>
      </header>

      <StatusBar />
      <PresenceBar />

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TodoList />
        <ChatPanel />
      </div>
    </div>
  );
};

export default App;
