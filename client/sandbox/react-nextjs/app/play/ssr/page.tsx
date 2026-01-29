'use client';
import Link from 'next/link';
import { AddTodo } from './AddTodo';
import { TodosWithoutSuspense } from './TodosWithoutSuspense';
import { TodosWithSuspense } from './TodosWithSuspense';
import { db } from './db';

export default function Page() {
  return (
    <div>
      <Link href="/play/ssr/with-fallback">Fallback version</Link>
      <button
        onClick={() => {
          db.auth.signOut();
        }}
      >
        Sign out
      </button>
      <div className="flex gap-2">
        <TodosWithSuspense></TodosWithSuspense>
        <TodosWithoutSuspense></TodosWithoutSuspense>
        <AddTodo />
      </div>
    </div>
  );
}
