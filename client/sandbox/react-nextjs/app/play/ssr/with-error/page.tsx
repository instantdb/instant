'use client';
import Link from 'next/link';
import { db } from '../db';
import { ErrorBoundary } from 'react-error-boundary';

const TodosWithError = () => {
  const user = db.useAuth();
  const { data } = db.useSuspenseQuery({
    todos: {
      $: {
        limit: 100,
        // @ts-ignore: we want this to throw an error
        order: { serverCreatedAt: 'badorder' },
      },
    },
  });

  return (
    <div className="m-2 overflow-auto border-4 border-green-500 p-2">
      USER:{' '}
      <pre className="overflow-auto text-xs">
        {JSON.stringify(user, null, 2)}
      </pre>
      <h1>With Suspense / SSR</h1>
      <pre className="overflow-auto text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
};

const TodosWithClientOnlyError = () => {
  const user = db.useAuth();
  const { data } = db.useSuspenseQuery({
    todos: {
      $: {
        limit: 100,
        // @ts-ignore: we want this to throw an error on the client
        order:
          typeof window === 'undefined'
            ? { serverCreatedAt: 'desc' }
            : { serverCreatedAt: 'badorder' },
      },
    },
  });

  return (
    <div className="m-2 overflow-auto border-4 border-green-500 p-2">
      USER:{' '}
      <pre className="overflow-auto text-xs">
        {JSON.stringify(user, null, 2)}
      </pre>
      <h1>With Suspense / SSR</h1>
      <pre className="overflow-auto text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
};

const TodosWithServerOnlyError = () => {
  const user = db.useAuth();
  const { data } = db.useSuspenseQuery({
    todos: {
      $: {
        limit: 100,
        // @ts-ignore: we want this to throw an error on the client
        order:
          typeof window !== 'undefined'
            ? { serverCreatedAt: 'desc' }
            : { serverCreatedAt: 'badorder' },
      },
    },
  });

  return (
    <div className="m-2 overflow-auto border-4 border-green-500 p-2">
      USER:{' '}
      <pre className="overflow-auto text-xs">
        {JSON.stringify(user, null, 2)}
      </pre>
      <h1>With Suspense / SSR</h1>
      <pre className="overflow-auto text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
};

export default function Page() {
  return (
    <div>
      <Link href="/play/ssr/">Whole page version</Link>
      <div className="flex flex-col gap-2">
        <ErrorBoundary
          fallbackRender={(props) => {
            return (
              <div>
                <div>Error from the server</div>
                <pre>{(props.error as Error).message}</pre>
              </div>
            );
          }}
        >
          <TodosWithError />
        </ErrorBoundary>
        <ErrorBoundary
          fallbackRender={(props) => {
            return (
              <div>
                <div>Error from the client</div>
                <pre>{(props.error as Error).message}</pre>
              </div>
            );
          }}
        >
          <TodosWithClientOnlyError />
        </ErrorBoundary>

        <ErrorBoundary
          fallbackRender={(props) => {
            return (
              <div>
                <div>
                  Error from the server only (you shouldn't see this once js
                  executes)
                </div>
                <pre>{(props.error as Error).message}</pre>
              </div>
            );
          }}
        >
          <TodosWithServerOnlyError />
        </ErrorBoundary>
      </div>
    </div>
  );
}
