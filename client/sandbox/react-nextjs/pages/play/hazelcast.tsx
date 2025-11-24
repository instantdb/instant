import React, { useState } from 'react';
import Head from 'next/head';
import config from '../../config';

let __id = 0;
function nextId() {
  return ++__id;
}

function Page() {
  const [pages, setPages] = useState([
    { port: 8888, id: nextId() },
    { port: 8888, id: nextId() },
    { port: 8888, id: nextId() },
    { port: 8889, id: nextId() },
    { port: 8889, id: nextId() },
    { port: 8889, id: nextId() },
  ]);

  return (
    <div>
      <Head>
        <title>Instant Example App: Hazelcast</title>
        <meta
          name="description"
          content="Relational Database, on the client."
        />
      </Head>
      <div className="text-sm text-gray-800">
        <div>
          <button
            className="m-1 border p-2"
            onClick={() => {
              setPages([...pages, { port: 8888, id: nextId() }]);
            }}
          >
            Add pane with port 8888
          </button>

          <button
            className="m-1 border p-2"
            onClick={() => {
              setPages([...pages, { port: 8889, id: nextId() }]);
            }}
          >
            Add pane with port 8889
          </button>
          <div>
            <div>
              1. Comment out{' '}
              <a
                href="https://github.com/instantdb/instant/blob/main/server/deps.edn#L97"
                className="underline"
              >
                -Dclojure.server.repl
              </a>{' '}
              in deps.edn
            </div>
            <div>
              2. Run <code className="bg-gray-200">make dev</code> and{' '}
              <code className="bg-gray-200">
                PORT=8889 NREPL_PORT=6007 make dev
              </code>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-2">
          {pages.map(({ port, id }) => (
            <div
              key={id}
              className="relative flex h-[30vh] min-h-[250px] w-1/4 min-w-[250px] flex-grow rounded border bg-white shadow-sm"
            >
              <iframe
                className="flex-1"
                src={`http://localhost:3000/recipes/3-cursors?__appId=${config.appId}&port=${port}`}
              />
              <div className="absolute p-2">Port {port}</div>
              <button
                className="absolute right-0 p-2"
                onClick={() => {
                  setPages(pages.filter((x) => x.id !== id));
                }}
              >
                X
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Page;
