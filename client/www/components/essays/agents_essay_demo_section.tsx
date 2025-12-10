import { Button, Fence } from '@/components/ui';
import config, { getLocal, isDev } from '@/lib/config';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/solid';
import confetti from 'canvas-confetti';
import * as ephemeral from '@/lib/ephemeral';
import { useEffect, useState } from 'react';
import { PlatformApi } from '@instantdb/platform';
import { i } from '@instantdb/core';
import useLocalStorage from '@/lib/hooks/useLocalStorage';
import differenceInDays from 'date-fns/differenceInDays';

type InitState = {
  step: 'init';
  appId: undefined;
  adminToken: undefined;
  timeTaken: undefined;
  askedForDemoApp: undefined;
  expiresMs: undefined;
};

type SchemaPushedState = {
  outString: string;
};

type PermsPushedState = {
  outString: string;
};

type AppCreatedState = {
  step: 'app-created';
  appId: string;
  adminToken: string;
  timeTaken: number;
  askedForDemoApp: boolean;
  claimed: boolean;
  expiresMs: number;
  schema?: SchemaPushedState;
  perms?: PermsPushedState;
};

type InteractionState = InitState | AppCreatedState;

export default function AgentsEssayDemoSection() {
  const init = {
    step: 'init',
    appId: undefined,
    adminToken: undefined,
    timeTaken: undefined,
    askedForDemoApp: undefined,
    expiresMs: undefined,
  } as const;
  const [state, setState] = useLocalStorage<InteractionState>(
    'agents-essay-demo',
    init,
  );
  useEffect(() => {
    if (state.step !== 'app-created') return;
    if (state.claimed) return;
    if (
      !state.expiresMs ||
      differenceInDays(new Date(state.expiresMs), new Date()) < 2
    ) {
      setState(init);
    }
  }, [state.expiresMs]);

  return (
    <div>
      <h1 id="habit-tracker-dinosaurs">A habit tracker with dinosaurs</h1>
      <p>
        We’re going to build a habit tracker with one important twist: dinosaurs
        and aliens are going to be involved. And we'll build it right inside
        this essay.
      </p>
      <p>
        If you keep pressing the buttons that follow, you’ll have an app you can
        play with at the end.
      </p>
      <h2>An example prompt</h2>
      <p>
        Before we continue, here's the prompt we gave Claude to generate all the
        code that follows:
      </p>
      <blockquote>
        Create a habit tracking app where users can create habits, mark daily
        completions, and visualize streaks. Include features for setting habit
        frequency (daily/weekly), viewing completion calendars, and tracking
        overall progress percentages. Make it all dinosaur and alien themed.
        <br />
        <br />
        Keep the code to {'<'} 1000 lines.
      </blockquote>
      <p>We're going to wire this up to a real backend step-by-step.</p>
      <h2 id="create-a-database">Create a database</h2>
      <p>
        The first thing we'll ask our agent is to create a new database. It can
        use the MCP server to do that.
      </p>
      <p>
        We’ve added a <code>create-app</code> tool right inside this essay.
        Click it, and we’ll spin up a new database.
      </p>
      <ToolCall
        name="create-app"
        argsString={`{ title: 'dino-habit-tracker' }`}
        out={
          state.appId
            ? {
                str: ` { app: {  id: '${state.appId}' } } `,
                timeTaken: state.timeTaken,
              }
            : undefined
        }
        onClick={async () => {
          const start = Date.now();
          const res = await ephemeral.provisionApp({
            title: 'dino-habit-tracker',
          });

          const { app, expires_ms } = res;
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
            expiresMs: expires_ms,
          });
          confetti({
            angle: randomInRange(55, 125),
            spread: randomInRange(50, 70),
            particleCount: randomInRange(50, 100),
          });
        }}
      />
      {state.appId ? (
        <AppCreatedSection state={state} setState={setState} />
      ) : null}
    </div>
  );
}

function ToolCall({
  name,
  argsString,
  onClick,
  out,
}: {
  name: string;
  argsString: string;
  onClick: () => Promise<void>;
  out?: { str: string; timeTaken?: number };
}) {
  const [running, setRunning] = useState(false);
  return (
    <>
      <div className="not-prose my-4 flex items-baseline space-x-2 rounded-sm bg-white p-4">
        <div className="">
          <div className="h-2 w-2 rounded-full bg-green-600"></div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-2 text-sm">
            <div className="font-mono font-bold">instant</div>
            <div className="font-mono font-bold">-</div>
            <div className="font-mono font-bold">{name}</div>
          </div>
          <div className="max-h-20 overflow-x-auto overflow-y-auto text-xs [&_pre]:p-0!">
            <Fence code={argsString} language="javascript" />
          </div>
        </div>
        <div>
          <Button
            variant="cta"
            size="mini"
            disabled={!!out || running}
            onClick={async () => {
              setRunning(true);
              try {
                await onClick();
              } catch (e) {
                setRunning(false);
              }
            }}
          >
            Run tool
          </Button>
        </div>
      </div>
      {out ? (
        <ToolOutput outString={out.str} timeTaken={out.timeTaken} />
      ) : (
        <div className="not-prose relative">
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-2 bg-white/90">
            <div className="font-mono text-sm font-bold text-gray-500">
              Click 'Run tool' to see the result.
            </div>
            <p className="font-mono text-sm text-gray-500">
              (There's more in the essay!)
            </p>
          </div>
          <ToolOutput
            outString={`
{
  ...
} `.trim()}
          />
        </div>
      )}
    </>
  );
}

function ToolOutput({
  outString,
  timeTaken,
}: {
  outString: string;
  timeTaken?: number;
}) {
  return (
    <div className="not-prose my-4 flex items-baseline space-x-2 rounded-sm bg-white p-4">
      <div className="">⎿</div>
      <div className="min-w-0 flex-1">
        <div className="max-h-20 overflow-x-auto overflow-y-auto text-xs [&_pre]:p-0!">
          <Fence code={outString} language="javascript" />
        </div>
      </div>
      {Number.isFinite(timeTaken) ? (
        <div>
          <div className="bg-gray-100 px-2 font-mono font-bold">
            {timeTaken} ms
          </div>
        </div>
      ) : null}
    </div>
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
      <p className="not-prose px-8 text-sm italic">
        Note: The database created in this essay will last about 2 weeks (since
        there’s no sign up required). If you{' '}
        <a href="/dash" target="_blank" className="underline">
          sign up and claim the app
        </a>
        , it will last forever. No freezes.
      </p>
      <>
        <p>
          Heck yeah! Now you have your own database, a sync engine, and a whole
          suite of tools to play with. And it only took {state.timeTaken} ms to
          spin up (This includes the time it took to get the ID over to your
          device).
        </p>
      </>
      <>
        <h2 id="schemas-and-permissions">Schemas and Permissions</h2>
        <p>
          A good habit tracker needs to store habits and completions. We also
          want to make sure that users can only access their own habits.
        </p>
        <p>
          To do this, our agent can include schemas and permissions in the
          <code>create-app</code> tool, or call <code>schema-push</code> and{' '}
          <code>push-perms</code> directly. Let’s create a schema now:
        </p>

        <ToolCall
          name="schema-push"
          argsString={entitiesArg}
          out={
            state.schema
              ? {
                  str: state.schema.outString,
                }
              : undefined
          }
          onClick={async () => {
            const api = new PlatformApi({
              auth: { token: state.adminToken },
              apiURI: config.apiURI,
            });
            const res = await api.schemaPush(state.appId, {
              schema: getSchema(),
            });
            setState({
              ...state,
              schema: {
                outString: `
{
  summary: {
    friendlyDescription: '${res.summary.friendlyDescription}'
  }
} // ...
`.trim(),
              },
            });
          }}
        />
        {state.schema ? (
          <AppSchemaSection
            state={{ ...state, schema: state.schema! }}
            setState={setState}
          />
        ) : null}
      </>
    </div>
  );
}

function AppSchemaSection({
  state,
  setState,
}: {
  state: AppCreatedState & { schema: SchemaPushedState };
  setState: (state: AppCreatedState) => void;
}) {
  return (
    <>
      <p>Woohoo! Now we have a schema. Let's push permissions next.</p>
      <ToolCall
        name="push-perms"
        argsString={JSON.stringify(getPerms(), null, 2)}
        out={
          state.perms
            ? {
                str: state.perms.outString,
              }
            : undefined
        }
        onClick={async () => {
          const api = new PlatformApi({
            auth: { token: state.adminToken },
            apiURI: config.apiURI,
          });
          const res = await api.pushPerms(state.appId, {
            perms: getPerms(),
          });
          setState({
            ...state,
            perms: {
              outString: JSON.stringify(res, null, 2),
            },
          });
        }}
      />
      {state.perms ? (
        <AppPermsSection
          state={{ ...state, perms: state.perms! }}
          setState={setState}
        />
      ) : null}
    </>
  );
}

function AppPermsSection({
  state,
  setState,
}: {
  state: AppCreatedState & { perms: PermsPushedState };
  setState: (state: AppCreatedState) => void;
}) {
  return (
    <>
      <p>Now we have a real data model!</p>
      <h2>Let the agent build</h2>
      <p>
        Our agent has the backend infra it needs to build out the full app. We
        asked Claude to build the app with Next. Here's what it came up with:
      </p>
      <DemoApp state={state} setState={setState} />
      <p>
        Pretty cool! Our theory about abstractions seem to have played out well:
        agents get quite far writing self-contained code.
      </p>
      <p>
        <strong>There’s two cool things about what we just built.</strong>
      </p>
      <p>
        First, our app is much more powerful than meets the eye. If you close
        your network connections, you can still use the app while offline. If
        your internet is slow you’ll see optimistic updates right away. And if
        you open up a new tab, it’ll sync up right away. All this is built-in.
      </p>
      <p>
        Second, our app is efficient. We didn’t have to spin up any additional
        compute resources to get this far. The overhead of an Instant app is
        just a few rows in a database. That makes it so your agents can build
        apps with abandon — they (or really you) don’t worry about a giant
        compute bill.
      </p>
    </>
  );
}

function DemoApp({
  state,
}: {
  state: AppCreatedState;
  setState: (state: AppCreatedState) => void;
}) {
  const devBackend = getLocal('devBackend');
  const uri = `/dino-habits?a=${state.appId}${devBackend ? '&localBackend=1' : ''}`;
  const fullURI = `${isDev ? 'http://localhost:3000' : 'https://instantdb.com'}${uri}`;
  return (
    <div className="pointer-events-none" style={{ height: '750px' }}>
      <div className="not-prose pointer-events-auto absolute right-0 left-0 p-4">
        <div className="mx-auto max-w-4xl">
          <div className="space-y-2">
            <div
              className="flex flex-col rounded-lg border border-gray-200 p-2"
              style={{
                minHeight: '750px',
                maxHeight: '750px',
              }}
            >
              <div>
                <div className="flex items-center justify-between rounded-lg bg-gray-200 p-2 text-black">
                  <div className="truncate text-xs">{fullURI}</div>
                  <a href={fullURI} target="_blank">
                    <ArrowTopRightOnSquareIcon className="h-4 w-4 text-gray-500" />
                  </a>
                </div>
              </div>
              <iframe src={uri} className="h-full w-full flex-1" />
            </div>
          </div>
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

const entitiesArg = `
{
  "entities": {
    "habits": {
      "name": {
        "type": "string",
        "required": true
      },
      "emoji": {
        "type": "string",
        "required": true
      },
      "frequency": {
        "type": "string",
        "required": true
      },
      "targetCount": {
        "type": "number",
        "required": true
      },
      "createdAt": {
        "type": "number",
        "required": true,
        "indexed": true
      },
      "species": {
        "type": "string",
        "required": true
      }
    },
    "completions": {
      "completedAt": {
        "type": "number",
        "required": true,
        "indexed": true
      },
      "count": {
        "type": "number",
        "required": true
      }
    }
  },
  "links": {
    "habitOwner": {
      "from": {
        "entity": "habits",
        "has": "one",
        "label": "owner",
        "required": true
      },
      "to": {
        "entity": "$users",
        "has": "many",
        "label": "habits"
      }
    },
    "completionHabit": {
      "from": {
        "entity": "completions",
        "has": "one",
        "label": "habit",
        "required": true
      },
      "to": {
        "entity": "habits",
        "has": "many",
        "label": "completions"
      }
    }
  }
}
`.trim();
function getSchema() {
  return i.schema({
    entities: {
      $files: i.entity({
        path: i.string().unique().indexed(),
        url: i.string(),
      }),
      $users: i.entity({
        email: i.string().unique().indexed().optional(),
      }),
      habits: i.entity({
        name: i.string(),
        emoji: i.string(),
        frequency: i.string(),
        targetCount: i.number(),
        createdAt: i.number().indexed(),
        species: i.string(),
      }),
      completions: i.entity({
        completedAt: i.number().indexed(),
        count: i.number(),
      }),
    },
    links: {
      habitOwner: {
        forward: { on: 'habits', has: 'one', label: 'owner', required: true },
        reverse: { on: '$users', has: 'many', label: 'habits' },
      },
      completionHabit: {
        forward: {
          on: 'completions',
          has: 'one',
          label: 'habit',
          required: true,
        },
        reverse: { on: 'habits', has: 'many', label: 'completions' },
      },
    },
  });
}

function getPerms() {
  return {
    habits: {
      allow: {
        view: "auth.id in data.ref('owner.id')",
        create: 'auth.id != null',
        update: "auth.id in data.ref('owner.id')",
        delete: "auth.id in data.ref('owner.id')",
      },
      bind: [] as string[],
    },
    completions: {
      allow: {
        view: "auth.id in data.ref('habit.owner.id')",
        create: "auth.id in data.ref('habit.owner.id')",
        update: "auth.id in data.ref('habit.owner.id')",
        delete: "auth.id in data.ref('habit.owner.id')",
      },
      bind: [] as string[],
    },
  } as const;
}
