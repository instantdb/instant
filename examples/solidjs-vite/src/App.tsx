import { type Component, Show } from "solid-js";
import { db } from "./lib/db";

const App: Component = () => {
  const state = db.useQuery({ todos: {} });

  return (
    <div class="text-4xl text-green-700 text-center py-20">
      <Show when={!state().isLoading} fallback={<div>Loading...</div>}>
        {JSON.stringify(state().data)}
      </Show>
    </div>
  );
};

export default App;
