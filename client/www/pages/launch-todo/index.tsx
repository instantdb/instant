'use client';

import { init } from '@instantdb/react';
import { asClientOnlyPage, useReadyRouter } from '@/components/clientOnlyPage';
import config from '@/lib/config';
import TodoApp from '@/components/essays/architecture/TodoApp';
import { schema } from '@/components/essays/architecture/createDemoApp';

let db: ReturnType<typeof init> = null as any;

function App() {
  const router = useReadyRouter();
  const appId = router.query.a as string;

  if (!appId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
        You loaded this screen without an appId.
      </div>
    );
  }

  if (!db) {
    db = init({
      ...config,
      appId,
      schema,
    });
  }

  return (
    <div className="h-screen">
      <TodoApp db={db as any} />
    </div>
  );
}

export default asClientOnlyPage(App);
