import { type Component } from "solid-js";
import { createInstantQuery } from "./lib/createInstsantQuery";

const App: Component = () => {
  const todoResource = createInstantQuery({ todos: {} });

  return (
    <div class="text-4xl text-green-700 text-center py-20">
      {JSON.stringify(todoResource())}
    </div>
  );
};

export default App;
