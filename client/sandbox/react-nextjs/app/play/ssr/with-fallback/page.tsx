import { Suspense } from 'react';
import { TodosWithSuspense } from '../TodosWithSuspense';
import { TodosWithoutSuspense } from '../TodosWithoutSuspense';
import { AddTodo } from '../AddTodo';

export default function Page() {
  return (
    <div className="flex gap-2">
      <Suspense fallback={<div>Loading...</div>}>
        <TodosWithSuspense></TodosWithSuspense>
      </Suspense>
      <TodosWithoutSuspense></TodosWithoutSuspense>
      <AddTodo></AddTodo>
    </div>
  );
}
