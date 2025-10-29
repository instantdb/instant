import { AddTodo } from './AddTodo';
import { TodosWithoutSuspense } from './TodosWithoutSuspense';
import { TodosWithSuspense } from './TodosWithSuspense';

export default function Page() {
  return (
    <div className="flex gap-2">
      <TodosWithSuspense></TodosWithSuspense>
      <TodosWithoutSuspense></TodosWithoutSuspense>
      <AddTodo />
    </div>
  );
}
