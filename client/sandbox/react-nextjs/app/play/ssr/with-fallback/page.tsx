'use client';
import { Suspense } from 'react';
import { TodosWithSuspense } from '../TodosWithSuspense';
import { TodosWithoutSuspense } from '../TodosWithoutSuspense';
import { AddTodo } from '../AddTodo';
import Link from 'next/link';

export default function Page() {
  return (
    <div>
      <Link href="/play/ssr/">Whole page version</Link>
      <AddTodo></AddTodo>
      <div className="flex gap-2">
        <Suspense fallback={<div>Loading...</div>}>
          <TodosWithSuspense />
        </Suspense>
        <TodosWithoutSuspense />
      </div>
    </div>
  );
}
