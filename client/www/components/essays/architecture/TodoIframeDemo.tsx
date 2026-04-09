import { useEffect, useRef, useState } from 'react';
import {
  init,
  InstantReactWebDatabase,
  InstantUnknownSchema,
} from '@instantdb/react';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/solid';
import config from '@/lib/config';
import { Button } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { type DemoState } from './Demos';
import { createDemoApp } from './createDemoApp';
import TodoApp from './TodoApp';

type InstantDB = InstantReactWebDatabase<InstantUnknownSchema>;

export default function TodoIframeDemo({
  demoState,
  setDemoState,
}: {
  demoState: DemoState;
  setDemoState: (state: DemoState) => void;
}) {
  const [loading, setLoading] = useState(false);
  const app = demoState.app;

  if (app) {
    return <TodoPreviews appId={app.id} />;
  }

  return (
    <div className="not-prose my-6">
      <div className="relative">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="h-[440px] rounded-xl border border-gray-200 bg-gray-50" />
          <div className="h-[440px] rounded-xl border border-gray-200 bg-gray-50" />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/75 backdrop-blur-sm">
          <p className="px-6 text-center font-mono text-sm text-gray-500">
            Spin up a backend to try the live demo.
          </p>
          <Button
            variant="cta"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                const app = await createDemoApp();
                setDemoState({ app });
              } catch {
                setLoading(false);
              }
            }}
          >
            {loading ? 'Spinning up…' : 'Try the demo'}
          </Button>
        </div>
      </div>
    </div>
  );
}

const avatars = [
  { src: '/img/landing/stopa.jpg', alt: 'Stopa' },
  { src: '/img/landing/joe.jpg', alt: 'Joe' },
];

function TodoPreviews({ appId }: { appId: string }) {
  const dbsRef = useRef<InstantDB[]>([]);
  const [baseUrl, setBaseUrl] = useState('https://instantdb.com');

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  const fullUrl = `${baseUrl}/launch-todo?a=${appId}`;

  function getDb(index: number): InstantDB {
    while (dbsRef.current.length <= index) {
      const i = dbsRef.current.length;
      dbsRef.current.push(
        init({
          ...config,
          appId,
          __extraDedupeKey: `essay-todo-${i}`,
        } as any),
      );
    }
    return dbsRef.current[index];
  }

  return (
    <div className="not-prose my-6 grid grid-cols-1 gap-4 md:grid-cols-2">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="flex h-[440px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white"
        >
          <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
            <div className="flex flex-1 items-center gap-2 truncate rounded bg-white px-2 py-1 text-xs text-gray-500">
              <span className="truncate">{fullUrl}</span>
              <a
                href={fullUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-shrink-0"
              >
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
              </a>
            </div>
            <img
              src={avatars[i].src}
              alt={avatars[i].alt}
              className="h-6 w-6 flex-shrink-0 rounded-full object-cover ring-2 ring-white"
            />
          </div>
          <div className="flex-1 overflow-auto">
            <ErrorBoundary
              renderError={() => (
                <p className="p-2 text-sm text-red-500">
                  Error loading preview
                </p>
              )}
            >
              <TodoApp db={getDb(i)} />
            </ErrorBoundary>
          </div>
        </div>
      ))}
    </div>
  );
}
