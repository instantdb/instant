import { useEffect, useRef, useState } from 'react';
import { getFiles, FilesRecord, File } from '@/data/tutorial-examples';
import {
  ActionButton,
  Button,
  Copyable,
  Fence,
  FenceLanguage,
  twel,
} from '@/components/ui';
import config, { getLocal, isBrowser, setLocal } from '@/lib/config';
import tutorialMonacoTheme from '@/data/tutorialMonacoTheme.json';
import clsx from 'clsx';
import { LandingFooter, MainNav, Section } from '@/components/marketingUi';
import Head from 'next/head';
import { ToastContainer } from 'react-toastify';
import confetti from 'canvas-confetti';
import { DiffEditor, Monaco } from '@monaco-editor/react';
import MuxPlayer from '@mux/mux-player-react';
import * as muxVideos from '@/lib/muxVideos';

type InteractionState = {
  t: string | null;
  appId: string | null;
  ex1ReloadIdx: number;
  ex1NumTabs: number;
  hasReloaded: boolean;
  hasAddedTab: boolean;
};

const maxNumTabs = 2;

export async function getStaticProps() {
  const files = getFiles();

  return {
    props: {
      files,
    },
  };
}

export default function Page({ files }: { files: FilesRecord }) {
  return (
    <div className="bg-[#F8F9FA] min-h-full">
      <Head>
        <title>Instant Tutorial</title>
        <meta name="description" content="A Graph Database on the Client" />
      </Head>
      <ToastContainer />
      <div className="flex min-h-screen flex-col justify-between">
        <MainNav />
        <div className="flex-1">
          <Tutorial files={files} />
        </div>
        <LandingFooter />
      </div>
    </div>
  );
}

const Prose = twel(
  'div',
  'prose prose-h1:mt-8 prose-h1:mb-4 prose-h2:mt-4 prose-h2:mb-2 prose-pre:bg-gray-100'
);

function Tutorial({ files }: { files: FilesRecord }) {
  const width = useScreenWidth();

  const [interactionState, _setInteractionState] = useState<InteractionState>({
    t: null,
    appId: null,
    ex1ReloadIdx: 1,
    ex1NumTabs: 1,
    hasReloaded: false,
    hasAddedTab: false,
  });

  function mergeInteractionState(newState: Partial<InteractionState>) {
    const nextState = { ...interactionState, ...newState };
    setLocal('__tutorial-interaction-state', nextState);
    _setInteractionState(nextState);
  }

  useEffect(() => {
    const state = getLocal('__tutorial-interaction-state');
    if (state) mergeInteractionState(state);
  }, []);

  const diffEditorOptions = {
    language: 'typescript',
    className: 'h-[600px] border text-xl',
    options: {
      minimap: { enabled: false },
      readOnly: true,
      scrollBeyondLastLine: false,
      renderSideBySide: width > 840,
      fontSize: 14,
    },
    onMount: (_: any, monaco: Monaco) => {
      monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        module: monaco.languages.typescript.ModuleKind.ESNext,
        target: monaco.languages.typescript.ScriptTarget.ESNext,
        jsx: monaco.languages.typescript.JsxEmit.React,
      });

      monaco.editor.defineTheme('tut', tutorialMonacoTheme as any);

      monaco.editor.setTheme('tut');
    },
  };

  return (
    <div className="flex flex-col py-20 px-8">
      <SimpleContent>
        <Prose>
          <h1 className="text-center">Getting Started with Instant</h1>
          <p>
            Hey there hacker! We (the team behind Instant) are so excited to
            have you try out Instant! We’ve written this guide to help you get a
            feel for how you can use Instant to build delightful apps.
          </p>
          <p>
            Without further ado, let’s begin our journey! To create your first
            app, simply click this button below.
          </p>
          <div>
            <div className="flex justify-center">
              <ActionButton
                className="text-2xl px-8 py-2 rounded"
                variant="primary"
                label="Create an app"
                submitLabel="Create an app"
                errorMessage="Oops! Something went wrong.  Please try again."
                disabled={interactionState.appId !== null}
                onClick={async () => {
                  const app = (await provisionEphemeralApp()).json.app;

                  const appId = app.id;
                  const t = app['admin-token'];
                  mergeInteractionState({ appId, t });
                  confetti({
                    angle: randomInRange(55, 125),
                    spread: randomInRange(50, 70),
                    particleCount: randomInRange(50, 100),
                  });
                }}
              />
            </div>
            <p className="text-center">
              <span className="not-prose text-gray-500 italic">
                No sign up required. This will ‘kick off’ the tutorial!
              </span>
            </p>
          </div>
          {interactionState.appId !== null ? (
            <>
              <hr />
              <h1 className="text-center">Your brand new app!</h1>
              <div className="not-prose">
                <div className="py-4">
                  <Copyable
                    label="App ID"
                    value={interactionState.appId}
                    size="large"
                  />
                </div>
              </div>
              <p>
                With that one-click you’ve claimed an id that you can use for
                storing your data. Now we'll show you how to wire up your db to
                an app and start adding data.
                <span className="md:hidden">
                  {' '}
                  Check out the walkthrough below, and the full code example
                  right after.
                </span>
                <span className="hidden md:inline">
                  {' '}
                  Check out the walkthrough below on your left with the full
                  code and preview on the right.
                </span>
              </p>
            </>
          ) : null}
        </Prose>
      </SimpleContent>
      {interactionState.appId !== null ? (
        <>
          <SplitStickyContent
            sticky={
              <Example
                reloadIdx={interactionState.ex1ReloadIdx}
                appId={interactionState.appId}
                file={files['1-todos-add']}
                numTabs={interactionState.ex1NumTabs}
              />
            }
            content={
              <Prose>
                <p>
                  We’ll start by creating a brand new Next.js project from the
                  terminal
                </p>
                <CodeBlock
                  language="bash"
                  code={`
npx create-next-app -e hello-world instant-demo y
cd instant-demo
npm i @instantdb/react
npm run dev
`}
                />
                <p>
                  Now in <Token>app/page.tsx</Token> we can set up a bare-bones
                  message app.
                </p>
                <p>
                  So what’s going on here? Well aside from the standard
                  react-fare, we’ve got logic to
                </p>
                <ol>
                  <li>Connect to your instant app</li>
                  <li>Read your data from instant</li>
                  <li>Write data to the database</li>
                </ol>
                <h3>1. How to connect to the app from JS</h3>
                <CodeBlock language="tsx" code="const db = init(config)" />
                <p>
                  This line is all you need to connect to your database.
                  Seriously, that’s it! With this one line you now have a
                  database at your fingertips that will allow you to persist
                  data and propagate changes in real-time.
                </p>
                <h3>2. How to start adding data</h3>
                <CodeBlock
                  language="tsx"
                  code={`
function addMessage(text) {
  db.transact(
    tx.messages[id()].update({
      text,
      createdAt: new Date(),
    }),
  );
}
`}
                />
                <p>
                  Writing to the database is done via the{' '}
                  <Token>transact</Token> function. In this example you can
                  think of <Token>tx.messages</Token> as referring to the{' '}
                  <Token>messages</Token> table. The <Token>id</Token> function
                  generates a unique identifier for this new message, and the
                  <Token>update</Token> function does an <Token>insert</Token>{' '}
                  with the specified data. The equivalent of this in SQL would
                  be
                </p>
                <CodeBlock
                  language="sql"
                  code={`INSERT INTO messages (id, text, createdAt) VALUES (:id, 'hello world', NOW());`}
                />
                <h3>3. How to query the data</h3>
                <CodeBlock
                  language="tsx"
                  code={`const { isLoading, error, data } = db.useQuery({ messages: {} });`}
                />

                <p>
                  Reading from the database is done via the{' '}
                  <code>useQuery</code> function. In this example we’re
                  subscribing to the <code>messages</code> table. The equivalent
                  of this in SQL qould be
                </p>

                <CodeBlock language="sql" code={`SELECT * from messages;`} />

                <p>
                  Playing with this example, you’ll see you can create messages
                  and they’ll be added to the list below.
                </p>

                <p>What’s so special? Try reloading the preview.</p>

                <div className="flex justify-center">
                  <Button
                    className="text-2xl px-8 py-2 rounded"
                    onClick={() => {
                      mergeInteractionState({
                        ex1ReloadIdx: interactionState.ex1ReloadIdx + 1,
                        hasReloaded: true,
                      });
                    }}
                  >
                    Reload the page
                  </Button>
                </div>
                <p className="text-center">
                  <span className="not-prose text-gray-500 italic">
                    This will refresh the preview box
                  </span>
                </p>
                <div
                  className={clsx(
                    interactionState.ex1ReloadIdx > 1 ? 'block' : 'hidden'
                  )}
                >
                  <p>
                    Unlike React’s <code>setState</code>, your data is
                    persisted! But that’s not all…
                  </p>
                  <p>Try opening another tab and creating a new message!</p>
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Button
                      className="text-2xl px-8 py-2 rounded"
                      disabled={interactionState.ex1NumTabs >= maxNumTabs}
                      onClick={() => {
                        mergeInteractionState({
                          ex1NumTabs: Math.min(
                            maxNumTabs,
                            interactionState.ex1NumTabs + 1
                          ),
                          hasAddedTab: true,
                        });
                      }}
                    >
                      Open another tab
                    </Button>
                  </div>
                  <p className="text-center">
                    <span className="not-prose text-gray-500 italic">
                      This will open a new tab in the preview box
                    </span>
                  </p>
                </div>
                <div
                  className={
                    interactionState.ex1NumTabs > 1 ? 'block' : 'hidden'
                  }
                >
                  <p>
                    Your messages are updated in real-time! New data doesn’t
                    require a refresh and can be seen <strong>instantly</strong>
                    .
                  </p>
                </div>
              </Prose>
            }
          />

          {interactionState.appId !== null &&
          interactionState.hasAddedTab &&
          interactionState.hasReloaded ? (
            <>
              <SimpleContent>
                <Prose>
                  <p>
                    If you compare using Instant to React, for less than 10
                    lines of code you got yourself a state management system
                    that persists your data, reacts to changes, and broadcasts
                    updates across devices.{' '}
                    <strong>We call this a sync engine.</strong>
                  </p>
                </Prose>
              </SimpleContent>
              <FullBleedContent>
                <DiffEditor
                  {...diffEditorOptions}
                  original={files['todos-add-react'].code}
                  modified={files['1-todos-add'].code}
                  modifiedModelPath="inmemory://model/todos-add.modifies.tsx"
                  originalModelPath="inmemory://model/todos-add.original.tsx"
                />
              </FullBleedContent>
              <SimpleContent>
                <Prose>
                  <p>
                    With <Token>useQuery</Token> and <Token>transact</Token> you
                    can obviate the need for state management libraries like
                    Redux. In fact, because all updates happen instantly, you
                    don’t even need <Token>useState</Token> or{' '}
                    <Token>setState</Token>, you can use Instant to manage your
                    persisted state and UI state.
                  </p>
                </Prose>
              </SimpleContent>
              <SplitStickyContent
                sticky={
                  <Example
                    appId={interactionState.appId}
                    file={files['2-todos-edit']}
                    numTabs={2}
                  />
                }
                content={
                  <Prose>
                    <h2>The Benefits of Sync</h2>
                    <p>
                      There’s also the added benefit of not needing to stand-up
                      additional endpoints for different actions. In a
                      traditional REST application, we may make separate
                      endpoints with their own SQL queries for create, destroy,
                      index, show, and update. We would then call those
                      endpoints from the frontend, parse the response, and then
                      update the UI. If we ever needed to get additional data
                      from the backend, we’d need to update both our frontend
                      and backend once more. But look how simple it is to add a
                      delete and update action with Instant.
                    </p>
                    <CodeBlock
                      language="tsx"
                      code={`
function deleteMessage(messageId) {
  db.transact(tx.messages[messageId].delete());
}
`}
                    />
                    <CodeBlock
                      language="tsx"
                      code={`
function updateMessage(messageId, newText) {
  db.transact(tx.messages[messageId].update({ text: newText }));
}
`}
                    />
                    <p>
                      You can play with this in the sandbox. Notice again how
                      all changes are persisted, and if you have multiple tabs
                      open changes will be visible instantly.
                    </p>
                  </Prose>
                }
              />
              <SimpleContent>
                <Prose>
                  <p>
                    Again, if you compare using Instant to React, delete and
                    update will persist changes and broadcast updates for no
                    additional lines of code. Better yet, adding this
                    functionality required no backend updates.
                  </p>
                </Prose>
              </SimpleContent>
              <FullBleedContent>
                <DiffEditor
                  {...diffEditorOptions}
                  original={files['todos-update-delete-react'].code}
                  modified={files['todos-update-delete-instant'].code}
                  modifiedModelPath="inmemory://model/todos-update-delete.modifies.tsx"
                  originalModelPath="inmemory://model/todos-update-delete.original.tsx"
                />
              </FullBleedContent>
              <SplitStickyContent
                sticky={
                  <Example
                    appId={interactionState.appId}
                    file={files['3-todos-attributes']}
                    numTabs={2}
                  />
                }
                content={
                  <Prose>
                    <p>
                      We could even add a new property to messages in our
                      <Token>updateMessage</Token> function.
                    </p>
                    <CodeBlock
                      language="tsx"
                      code={
                        /* tsx */ `
                        // spec changed, we want to include \`updatedAt\` now
function updateMessage(messageId, newText) {
  db.transact(
    tx.messages[messageId]
      .update({ text: newText, updatedAt: Date.now() })
  );
}
`
                      }
                    />
                    <p>
                      And render this new property in our UI without touching
                      the backend.
                    </p>
                    <CodeBlock
                      language="tsx"
                      code={
                        /* tsx */ `
{messages.map((message) => (
  <div key={message.id} className="flex items-center space-x-2">
    <div>{message.text}</div>
    <button onClick={() => toggleEdit(message.id)}>✏️</button>
    <button onClick={() => deleteMessage(message.id)}>❌</button>
    {message.updatedAt &&
      <div>Updated at: {new Date(message.updatedAt).toLocaleTimeString()}</div>
    }
  </div>
))}
`
                      }
                    />
                  </Prose>
                }
              />
              <SimpleContent>
                <Prose>
                  <h1 className="text-center">Offline Mode</h1>
                  <p>
                    Another benefit of using Instant’s sync engine is the
                    offline mode capabilities you get for free.{' '}
                    <strong>
                      Apps built with Instant continue to work offline.
                    </strong>{' '}
                    You can turn off the internet, make some changes, turn the
                    internet back on, and see all your changes get synced. Try
                    making changes in different tabs with different network
                    settings.
                  </p>
                </Prose>
              </SimpleContent>
              <FullBleedContent>
                <div className="border shadow-lg my-4">
                  <MuxPlayer
                    streamType="on-demand"
                    playbackId="l1UOG6KX5f4tC402kuIyUzOS3esKZ8rQj4xhEdl02CMv00"
                    primaryColor="#FFFFFF"
                    secondaryColor="#000000"
                  />
                </div>
              </FullBleedContent>
              <SimpleContent>
                <Prose>
                  <h1 className="text-center">Building Modern Apps</h1>
                  <p>
                    This is just a taste of what Instant offers. You can also:
                  </p>
                  <ul>
                    <li>
                      <A href="https://www.instantdb.com/docs/instaml#link-data">
                        Create
                      </A>{' '}
                      and{' '}
                      <A href="https://www.instantdb.com/docs/instaql#fetch-associations">
                        query
                      </A>{' '}
                      associations in real-time.
                    </li>
                    <li>
                      Manage your schema and explore your data{' '}
                      <A href="https://www.instantdb.com/docs/modeling-data#overview">
                        with a GUI
                      </A>{' '}
                      or{' '}
                      <a href="https://www.instantdb.com/docs/cli">with code</a>
                      .
                    </li>
                    <li>
                      Manage users via{' '}
                      <A href="https://www.instantdb.com/docs/auth">
                        auth and OAuth
                      </A>{' '}
                      and add authorization rules via{' '}
                      <A href="https://www.instantdb.com/docs/permissions">
                        permissions
                      </A>
                    </li>
                    <li>
                      Share ephemeral updates like showing{' '}
                      <A href="https://www.instantdb.com/docs/presence-and-topics#presence">
                        who’s currently online
                      </A>{' '}
                      or{' '}
                      <A href="https://www.instantdb.com/examples#5-reactions">
                        live reactions
                      </A>
                    </li>
                  </ul>
                  <p>
                    When you put this all together, you can{' '}
                    <strong>
                      productively build modern applications like Figma, Notion,
                      and Linear
                    </strong>
                    .
                  </p>
                </Prose>
              </SimpleContent>

              <FullBleedContent>
                <div className="border shadow-lg  my-4">
                  <MuxPlayer {...muxVideos.instldraw} />
                </div>
              </FullBleedContent>

              <SimpleContent>
                <Prose>
                  <p>
                    Curious to hack more? Whether you're building a side project
                    or your next big thing, you can start building with Instant{' '}
                    <strong>for free</strong>.
                  </p>

                  <p>
                    We don't pause projects, we don't limit number of active
                    applications, and we have no restrictions for commercial
                    use. When you're ready to grow, we have plans that scale
                    with you.
                  </p>

                  <p>
                    Click the sign-up button below to create a free account and
                    continue hacking on this app!
                  </p>

                  <div className="flex justify-center">
                    <div className="not-prose">
                      <Button
                        className="text-2xl px-8 py-2 rounded"
                        type="link"
                        href="https://instantdb.com/dash"
                      >
                        Claim your app!
                      </Button>
                    </div>
                  </div>
                </Prose>
              </SimpleContent>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Example({
  appId,
  reloadIdx,
  numTabs,
  file,
}: {
  appId: string;
  file: File;
  reloadIdx?: number;
  numTabs?: number;
}) {
  return (
    <div className="flex flex-1 w-full flex-col overflow-hidden h-screen md:h-full">
      <div className="flex-1 flex overflow-hidden border-b">
        <Fence
          code={file.code.replaceAll(`__getAppId()`, `"${appId}"`)}
          language="tsx"
          className="overflow-auto h-full w-full p-8 m-0 text-sm"
          style={{ margin: 0 }}
        />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex flex-col md:flex-row flex-1 md:h-full">
          {Array.from({ length: numTabs ?? 1 }).map((_, idx) => (
            <div key={idx} className={'flex-1 h-full border-r last:border-r-0'}>
              <PreviewFrame
                key={idx}
                appId={appId}
                file={file}
                reloadIdx={reloadIdx}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SimpleContent({ children }: { children?: React.ReactNode }) {
  return (
    <div className="max-w-2xl w-full mx-auto flex flex-col overflow-x-hidden">
      {children}
    </div>
  );
}

function FullBleedContent({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 px-6 py-5 max-w-7xl w-full mx-auto">
      {children}
    </div>
  );
}

function SplitStickyContent({
  content,
  sticky,
}: {
  content: React.ReactNode;
  sticky: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row relative gap-5 px-6 py-5 md:h-full">
      <div className="flex-1 flex flex-col overflow-x-hidden gap-5 md:py-16">
        {content}
      </div>
      <div className="md:sticky md:top-0 flex-1 flex md:h-screen flex-col overflow-hidden py-3">
        <div className="border rounded h-full overflow-hidden">{sticky}</div>
      </div>
    </div>
  );
}

function PreviewFrame({
  appId,
  file,
  reloadIdx,
}: {
  appId: string;
  file: File;
  reloadIdx?: number;
}) {
  const [localReloadIdx, setLocalReloadIdx] = useState(0);
  const finalReloadIdx = (reloadIdx ?? 0) + localReloadIdx;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  return (
    <div className="flex flex-col h-full">
      <div className="bg-gray-100 px-2 py-1 flex gap-2 border-b">
        <Button
          variant="secondary"
          size="mini"
          onClick={() => {
            setLocalReloadIdx((prev) => prev + 1);
          }}
        >
          Refresh
        </Button>
        {/* <Button
          variant="secondary"
          size="mini"
          onClick={() => {
            iframeRef.current?.contentWindow?.postMessage({
              type: 'mock-offline',
            });
            alert('TODO');
          }}
        >
          Offline
        </Button> */}
      </div>
      <div className="overflow-hidden w-full h-full bg-white">
        {appId ? (
          <iframe
            key={finalReloadIdx}
            className="w-full h-full"
            ref={iframeRef}
            src={`/tutorial-examples/${file.pathName}?__appId=${appId}&__reloadIdx=${finalReloadIdx}`}
          />
        ) : (
          <div className="flex-1 animate-slow-pulse bg-gray-300"></div>
        )}
      </div>
    </div>
  );
}

function CodeBlock({
  language,
  code,
}: {
  language: FenceLanguage;
  code: string;
}) {
  return (
    <Fence
      className="border rounded text-sm overflow-auto w-full"
      language={language}
      code={code.trim()}
    />
  );
}

function useScreenWidth() {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return width;
}

const Token = twel('code', 'bg-gray-200 px-1 rounded font-mono text-sm');
const A = twel<{ href: string }>('a', 'underline');

async function provisionEphemeralApp() {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Instant Tutorial Todo App',
    }),
  });

  const json = await r.json();

  return {
    ok: r.ok,
    json,
  };
}

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

if (isBrowser) {
  Object.assign(window, {
    __resetTutorial() {
      setLocal('__tutorial-interaction-state', {});
    },
  });
}
