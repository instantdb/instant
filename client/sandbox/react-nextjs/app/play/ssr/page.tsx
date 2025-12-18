'use client';
import Link from 'next/link';
import { AddTodo } from './AddTodo';
import { TodosWithoutSuspense } from './TodosWithoutSuspense';
import { TodosWithSuspense } from './TodosWithSuspense';

export default function Page() {
  return (
    <div>
      <Link href="/play/ssr/with-fallback">Fallback version</Link>
      <div className="flex gap-2">
        <TodosWithSuspense></TodosWithSuspense>
        <TodosWithoutSuspense></TodosWithoutSuspense>
        <AddTodo />
      </div>
    </div>
  );
}
