import { useEffect, useRef, useState } from 'react';
import {
  id,
  init,
  InstantReactWebDatabase,
  InstantUnknownSchema,
} from '@instantdb/react';
import config from '@/lib/config';
import { Button } from '@/components/ui';
import { BrowserChrome } from '@/components/BrowserChrome';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { type DemoState } from './Demos';
import { createDemoApp } from './createDemoApp';

type InstantDB = InstantReactWebDatabase<InstantUnknownSchema>;

const VIDA_IMAGES = [
  { url: '/img/essays/vida.jpg', name: 'vida.jpg' },
  { url: '/img/essays/vida-sofa.jpeg', name: 'vida-sofa.jpeg' },
];

export default function FileUploadDemo({
  demoState,
  setDemoState,
}: {
  demoState: DemoState;
  setDemoState: (state: DemoState) => void;
}) {
  const [loading, setLoading] = useState(false);
  const app = demoState.app;

  if (app) {
    return <FileUploadPreview appId={app.id} />;
  }

  return (
    <div className="essay-breakout not-prose my-6">
      <div className="relative">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr,auto]">
          <div className="h-[440px] rounded-xl border border-gray-200 bg-gray-50" />
          <div className="hidden h-[440px] w-48 rounded-xl border border-gray-200 bg-gray-50 md:block" />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/75 backdrop-blur-sm">
          <p className="px-6 text-center font-mono text-sm text-gray-500">
            Spin up a backend to try the file upload demo.
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

function FileUploadPreview({ appId }: { appId: string }) {
  const dbRef = useRef<InstantDB | null>(null);

  if (!dbRef.current) {
    dbRef.current = init({
      ...config,
      appId,
      __extraDedupeKey: 'essay-file-upload',
    } as any);
  }

  const db = dbRef.current;

  return (
    <ErrorBoundary
      renderError={() => (
        <p className="p-4 text-sm text-red-500">Error loading preview</p>
      )}
    >
      <FileUploadLayout db={db} appId={appId} />
    </ErrorBoundary>
  );
}

function FileUploadLayout({ db, appId }: { db: InstantDB; appId: string }) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [todoText, setTodoText] = useState('Walk Vida');
  const prefetchedFiles = useRef<Map<string, File>>(new Map());

  useEffect(() => {
    for (const img of VIDA_IMAGES) {
      fetch(img.url)
        .then((res) => res.blob())
        .then((blob) => {
          prefetchedFiles.current.set(
            img.name,
            new File([blob], img.name, { type: blob.type }),
          );
        });
    }
    // Warm the CORS preflight cache for the storage upload
    fetch(`${config.apiURI}/storage/upload`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
    }).catch(() => {});
  }, []);

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);

    let file: File;
    if (e.dataTransfer.files.length > 0) {
      file = e.dataTransfer.files[0];
    } else {
      const html = e.dataTransfer.getData('text/html');
      const vidaMatch = VIDA_IMAGES.find((img) => html?.includes(img.name));
      if (!vidaMatch) return;

      const cached = prefetchedFiles.current.get(vidaMatch.name);
      if (cached) {
        file = cached;
      } else {
        const res = await fetch(vidaMatch.url);
        const blob = await res.blob();
        file = new File([blob], vidaMatch.name, { type: blob.type });
      }
    }

    setUploading(true);
    try {
      const { data: fileData } = await db.storage.uploadFile(
        `upload-${Date.now()}-${file.name}`,
        file,
      );

      const todoId = id();
      await db.transact([
        db.tx.todos[todoId].update({
          text: todoText || file.name.replace(/\.[^.]+$/, ''),
          done: false,
          createdAt: Date.now(),
        }),
        db.tx.todos[todoId].link({ $files: fileData.id }),
      ]);
      setTodoText('');
      setUploaded(true);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="essay-breakout not-prose my-6 flex flex-col gap-4 md:flex-row">
      {/* File viewer — first on mobile, second on desktop */}
      <div className="flex h-56 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white md:order-2 md:h-[440px] md:w-52 md:shrink-0">
        {/* Sidebar / breadcrumb header */}
        <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-3 py-2">
          <svg
            className="h-3.5 w-3.5 text-gray-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          <span className="text-[11px] text-gray-400">/</span>
          <span className="text-[11px] font-medium text-gray-600">photos</span>
          <span className="ml-auto text-[10px] text-gray-400">
            {VIDA_IMAGES.length} items
          </span>
        </div>
        {/* File grid */}
        <div className="flex flex-1 flex-row gap-2 overflow-x-auto p-2 md:flex-col md:overflow-x-hidden md:overflow-y-auto">
          {VIDA_IMAGES.map((img) => (
            <div
              key={img.name}
              draggable
              className="group flex shrink-0 cursor-grab flex-col items-center gap-1 rounded-lg p-2 hover:bg-gray-50 active:cursor-grabbing"
            >
              <img
                src={img.url}
                alt="Vida the dog"
                draggable
                className="aspect-square w-28 rounded-md border border-gray-200 object-cover shadow-sm"
              />
              <div className="flex items-center gap-1">
                <svg
                  className="h-3 w-3 text-gray-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.22-2.219a.75.75 0 00-1.06 0l-1.91 1.909-4.22-4.22a.75.75 0 00-1.06 0L2.5 11.06zm6.5-3.31a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="max-w-[6rem] truncate text-[10px] text-gray-500">
                  {img.name}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Browser: create todo with drop zone */}
      <div
        className={`flex h-[440px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white transition-colors md:order-1 ${
          dragOver
            ? 'border-orange-400 ring-2 ring-orange-200'
            : 'border-gray-200'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <BrowserChrome />
        <div className="relative flex-1 overflow-auto">
          <CreateTodoWithImage
            db={db}
            dragOver={dragOver}
            uploading={uploading}
            uploaded={uploaded}
            setUploaded={setUploaded}
            text={todoText}
            setText={setTodoText}
          />
        </div>
      </div>
    </div>
  );
}

function CreateTodoWithImage({
  db,
  dragOver,
  uploading,
  uploaded,
  setUploaded,
  text,
  setText,
}: {
  db: InstantDB;
  dragOver: boolean;
  uploading: boolean;
  uploaded: boolean;
  setUploaded: (v: boolean) => void;
  text: string;
  setText: (v: string) => void;
}) {
  const { data, isLoading } = db.useQuery({
    todos: {
      $files: {},
      $: { order: { createdAt: 'desc' } },
    },
  });

  const todos = data?.todos ?? [];

  if (!uploaded) {
    return (
      <div className="flex h-full flex-col bg-white">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5">
          <div className="text-lg font-semibold text-gray-800">New Todo</div>
          <div className="w-full">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-lg bg-gray-50 px-3 py-2.5 text-base text-gray-700 placeholder-gray-300 focus:outline-none"
              placeholder="What needs to be done?"
            />
          </div>
          <div
            className={`flex h-40 w-full items-center justify-center rounded-lg border-2 border-dashed px-4 transition-colors ${
              dragOver
                ? 'border-orange-400 bg-orange-50'
                : 'border-gray-200 bg-gray-50'
            }`}
          >
            {uploading ? (
              <span className="text-sm text-gray-500">Uploading…</span>
            ) : dragOver ? (
              <span className="text-sm font-medium text-orange-500">
                Drop to attach image
              </span>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <svg
                  className="h-6 w-6 text-gray-300"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.22-2.219a.75.75 0 00-1.06 0l-1.91 1.909-4.22-4.22a.75.75 0 00-1.06 0L2.5 11.06zm6.5-3.31a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm text-gray-400">
                  Drop an image to attach
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex-1 overflow-y-auto px-5">
        {!isLoading && todos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <span className="text-base">No todos yet</span>
          </div>
        ) : (
          todos.map((todo) => (
            <div
              key={todo.id}
              className="flex items-center gap-3 border-b border-gray-50 py-3"
            >
              <button
                onClick={() =>
                  db.transact(db.tx.todos[todo.id].update({ done: !todo.done }))
                }
                className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  todo.done
                    ? 'border-orange-500 bg-orange-500'
                    : 'border-orange-300 hover:border-orange-400'
                }`}
              >
                {todo.done && (
                  <svg
                    className="h-3 w-3 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
              {todo.$files?.length > 0 && (
                <img
                  src={todo.$files[0].url}
                  alt=""
                  className="h-10 w-10 rounded object-cover"
                />
              )}
              <span
                className={`text-base ${
                  todo.done ? 'text-gray-400 line-through' : 'text-gray-700'
                }`}
              >
                {todo.text}
              </span>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-gray-100 px-5 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem(
              'todo',
            ) as HTMLInputElement;
            const trimmed = input.value.trim();
            if (!trimmed) return;
            db.transact(
              db.tx.todos[id()].update({
                text: trimmed,
                done: false,
                createdAt: Date.now(),
              }),
            );
            input.value = '';
          }}
          className="flex items-center gap-2"
        >
          <input
            name="todo"
            type="text"
            placeholder="What needs to be done?"
            className="flex-1 rounded-lg bg-gray-50 px-3 py-2.5 text-base text-gray-700 placeholder-gray-300 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setUploaded(false)}
            className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-50"
            title="Attach image"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.22-2.219a.75.75 0 00-1.06 0l-1.91 1.909-4.22-4.22a.75.75 0 00-1.06 0L2.5 11.06zm6.5-3.31a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
