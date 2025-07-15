import { ActionButton, Button, Copyable } from '@/components/ui';
import { getLocal, isDev } from '@/lib/config';
import useLocalStorage from '@/lib/hooks/useLocalStorage';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/solid';
import confetti from 'canvas-confetti';
import * as ephemeral from '@/lib/ephemeral';
import { useState } from 'react';

type InitState = {
  step: 'init';
  appId: undefined;
  adminToken: undefined;
  timeTaken: undefined;
  askedForDemoApp: undefined;
};

type AppCreatedState = {
  step: 'app-created';
  appId: string;
  adminToken: string;
  timeTaken: number;
  askedForDemoApp: boolean;
  claimed: boolean;
};

type InteractionState = InitState | AppCreatedState;

export default function AgentsEssayDemoSection() {
  const [state, setState] = useState<InteractionState>({
    step: 'init',
    appId: undefined,
    adminToken: undefined,
    timeTaken: undefined,
    askedForDemoApp: undefined,
  });

  // const [state, setState] = useLocalStorage<InteractionState>(
  //   'agents-essay-demo',
  //   {
  //     step: 'init',
  //     appId: undefined,
  //     adminToken: undefined,
  //     timeTaken: undefined,
  //     askedForDemoApp: undefined,
  //   },
  // );

  return (
    <div>
      <h2>Create a database</h2>
      <p>
        First things first, let's create a database. We can use the platform SDK
        to do that. This button below is hooked up to the{' '}
        <a
          href="https://github.com/instantdb/instant/tree/main/client/packages/platform#createapp"
          target="_blank"
        >
          createApp
        </a>{' '}
        endpoint:
      </p>
      <div className="flex justify-center">
        <ActionButton
          className="text-2xl px-8 py-2 rounded"
          variant="primary"
          label="Create a database"
          submitLabel="Create a database"
          errorMessage="Oops! Something went wrong.  Please try again."
          disabled={!!state.appId}
          onClick={async () => {
            const start = Date.now();
            const { app } = await ephemeral.provisionApp({
              title: 'agents-essay-demo',
            });
            const end = Date.now();

            const appId = app.id;
            const adminToken = app['admin-token'];
            setState({
              step: 'app-created',
              appId,
              adminToken,
              timeTaken: end - start,
              askedForDemoApp: false,
              claimed: false,
            });
            confetti({
              angle: randomInRange(55, 125),
              spread: randomInRange(50, 70),
              particleCount: randomInRange(50, 100),
            });
          }}
        />
      </div>
      {state.appId ? (
        <AppCreatedSection state={state} setState={setState} />
      ) : (
        <div className="relative">
          <div
            className="absolute inset-0 bg-white flex items-center justify-center border"
            style={{ opacity: 0.97 }}
          >
            <div className="p-4">
              <h3 className="text-gray-500 my-0">
                Your database will appear here!
              </h3>
            </div>
          </div>
          <YouGotDBCallout
            appId={'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
            timeTaken={0}
          />
        </div>
      )}
    </div>
  );
}

function YouGotDBCallout({
  appId,
  timeTaken,
}: {
  appId: string;
  timeTaken: number;
}) {
  return (
    <>
      <h3 className="text-center mt-4">You've got a database!</h3>
      <div className="not-prose">
        <div className="py-4">
          <Copyable label="App ID" value={appId} size="large" />
        </div>
      </div>
      <div className="text-center text-lg">
        Time taken: <strong>{timeTaken}ms</strong>
      </div>
    </>
  );
}

function AppCreatedSection({
  state,
  setState,
}: {
  state: AppCreatedState;
  setState: (state: AppCreatedState) => void;
}) {
  return (
    <div>
      <YouGotDBCallout appId={state.appId} timeTaken={state.timeTaken} />
      <>
        <p>
          Perfect! Now you have a database, a sync engine and a bunch of tools
          at your disposal. It only took {state.timeTaken} milliseconds to spin
          up.
        </p>
        <p>
          The database created in this essay will last about 2 weeks (since
          there’s no sign up required). If you{' '}
          <a href="/dash" target="_blank">
            sign up and claim the app
          </a>
          , it will last forever. No freezes.
        </p>
      </>
      <>
        <h2>Get agents working</h2>
        <p>Now that we have an App ID, we can put all the tools to work.</p>
        <p>
          We can give agents{' '}
          <a href="https://instantdb.com/docs/rules">rules</a> and an MCP
          server. Then it can spin up a full app.
        </p>
        <p>
          Here's one where we build a "Shouts" app. Users can sign up, make
          posts, send shouts in the void, and see who else is online
        </p>
        <ShoutsDemoApp state={state} setState={setState} />
        <p>
          Pretty cool! Our theory about abstractions seem to have played out
          well: agents get quite far writing self-contained code.
        </p>
        <p>
          <strong>There’s two cool things about what we just built.</strong>
        </p>
        <p>
          First, your app is efficient. We didn’t have to spin up any additional
          compute resources to get this far. The overhead of an Instant app is
          just a few rows in a database. That makes it so your agents can build
          apps with abandon — they (or really you) don’t worry about a giant
          compute bill.
        </p>
        <p>
          Second, your app is much more powerful than meets the eye. Every query
          is reactive, so if you open two tabs all shouts will sync. If you
          close your network connections, you can still make shouts while
          offline. If your internet is slow you’ll see optimistic updates right
          away. And it’s all shared globally—everyone in the world sees the same
          thing.
        </p>
      </>
      <>
        <h2>Try it yourself</h2>
        <p>That's a cool app. Want to make something new with your agent?</p>
        <p>
          We built a tutorial just for you. You can follow along to build out a
          full stack app in about 5 minutes. Just Claude, Cursor, or your
          favorite agent start cooking.
        </p>
        <div className="not-prose text-center">
          <Button
            type="link"
            variant="cta"
            size="large"
            href="/labs/mcp-tutorial"
          >
            Build with your own agents
          </Button>
        </div>
        <p>
          And heck, if you are the founder of an app builder platform, Instant
          could be a great use-case for you, too. We’d be thrilled to work with
          you directly. Simply send us an email.
        </p>
      </>
    </div>
  );
}

function ShoutsDemoApp({
  state,
  setState,
}: {
  state: AppCreatedState;
  setState: (state: AppCreatedState) => void;
}) {
  const devBackend = getLocal('devBackend');
  const uri = `/shouts-demo?a=${state.appId}${devBackend ? '&localBackend=1' : ''}`;
  const fullURI = `${isDev ? 'http://localhost:3000' : 'https://instantdb.com'}${uri}`;
  return (
    <div className="not-prose">
      <div className="space-y-2">
        <div className="text-right">
          <a
            className="font-bold bg-[#F5F4ED] p-2 hover:bg-[#F2E9E0] text-[#C96342] rounded-lg border text-xs"
            href="#"
          >
            Claude Transcript
          </a>
        </div>
        <div
          className="border border-gray-200 rounded-lg p-2 flex flex-col"
          style={{
            minHeight: '500px',
            maxHeight: '500px',
          }}
        >
          <div>
            <div className="text-black p-2 rounded-lg bg-gray-200 flex justify-between items-center">
              <div className="text-xs truncate">{fullURI}</div>
              <a href={fullURI} target="_blank">
                <ArrowTopRightOnSquareIcon className="h-4 w-4 text-gray-500" />
              </a>
            </div>
          </div>
          <iframe
            src={`/shouts-demo?a=${state.appId}&localBackend=${devBackend ? '1' : '0'}`}
            className="w-full h-full flex-1"
          />
        </div>
      </div>
    </div>
  );
}

// ----------
// XXX: This is copied from tutorial

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
