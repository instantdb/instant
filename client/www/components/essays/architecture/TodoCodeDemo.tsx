import { Fence } from '@/components/ui';
import { type DemoState } from './Demos';

const CODE_TEMPLATE = `import { init, id } from '@instantdb/react';

const db = init({ appId: '__APP_ID__' });

function App() {
  const { data } = db.useQuery({ todos: {} });

  const addTodo = (text) =>
    db.transact(
      db.tx.todos[id()].update({ text, done: false }),
    );

  const toggleTodo = (todo) =>
    db.transact(
      db.tx.todos[todo.id].update({ done: !todo.done }),
    );

  return (
    <TodoUI
      todos={data?.todos ?? []}
      onAdd={addTodo}
      onToggle={toggleTodo}
    />
  );
}`;

export const TODO_CODE_LINE_COUNT = CODE_TEMPLATE.split('\n').length;

export default function TodoCodeDemo({ demoState }: { demoState: DemoState }) {
  const appId = demoState.app?.id;
  const code = CODE_TEMPLATE.replace('__APP_ID__', appId ?? 'YOUR_APP_ID');

  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <span className="font-mono text-xs text-gray-500">App.tsx</span>
      </div>
      <div className="overflow-x-auto text-sm">
        <Fence
          code={code}
          language="tsx"
          style={{ backgroundColor: '#faf8f5' }}
        />
      </div>
    </div>
  );
}
