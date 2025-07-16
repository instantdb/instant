import { PropsWithChildren, useState } from 'react';
import produce from 'immer';
import clsx from 'clsx';
import Head from 'next/head';

import { Tab, Switch as HeadlessSwitch } from '@headlessui/react';

import { Button, Fence } from '@/components/ui';
import {
  H2,
  H3,
  H4,
  SectionWide,
  TwoColResponsive,
  Section,
  MainNav,
  LandingContainer,
  LandingFooter,
  TextLink,
  Link,
} from '@/components/marketingUi';

import { ChevronRightIcon } from '@heroicons/react/24/solid';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import MuxPlayer from '@mux/mux-player-react';
import * as muxVideos from '@/lib/muxVideos';
import useTotalSessionsCount from '@/lib/hooks/useTotalSessionsCount';
import AnimatedCounter from '@/components/AnimatedCounter';

const appId = 'fc5a4977-910a-43d9-ac28-39c7837c1eb5';

function Switch({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <HeadlessSwitch
      checked={enabled}
      onChange={onChange}
      className={`${enabled ? 'bg-emerald-500' : 'bg-gray-600'}
          relative inline-flex h-[19px] w-[37px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2  focus-visible:ring-white/75`}
    >
      <span className="sr-only">Use setting</span>
      <span
        aria-hidden="true"
        className={`${enabled ? 'translate-x-[18px]' : 'translate-x-0'}
            pointer-events-none inline-block h-[15px] w-[15px] transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out`}
      />
    </HeadlessSwitch>
  );
}

const GlowBackground = ({ children }: PropsWithChildren) => (
  <div className="relative">
    <div
      className={clsx(`absolute inset-0 z-0`)}
      style={{
        background: `linear-gradient(120deg, #e7e7e7 40%, #fee7de 70%, #e4e4e4 100%)`,
      }}
    />
    <div className="relative z-10 h-full">{children}</div>
  </div>
);

const ActiveSessionsCallout = () => {
  const { isLoading, error, data } = useTotalSessionsCount({
    refreshSeconds: 3,
  });
  const height = 38;

  if (isLoading || error || data <= 0) {
    return <div style={{ height }}></div>;
  }

  return (
    <div className="inline-flex items-center space-x-2" style={{ height }}>
      <AnimatedCounter number={data} height={38} />
      <div className="flex-1">sessions are connected on Instant right now</div>
    </div>
  );
};
function LandingHero() {
  return (
    <div className="pb-16 pt-8">
      <SectionWide>
        <TwoColResponsive>
          <div className="flex flex-1 flex-col gap-8">
            <H2>Write your frontend and we handle the rest</H2>
            <div className="mb-6 max-w-md">
              <div className="bg-gradient-to-br from-orange-50 to-red-50 border border-orange-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <p className="text-gray-800 mb-4">
                      Instant is the easy to use backend for your frontend. With
                      Instant you can build delighful apps in less than 10
                      minutes.
                    </p>
                    <Button
                      type="link"
                      variant="cta"
                      size="large"
                      href="/tutorial"
                    >
                      Try the demo
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-start space-x-2">
              <img src="/img/yc_logo.png" className="inline h-4 w-4" />
              <span className="text-sm">Backed by Y Combinator</span>
            </div>
            <ActiveSessionsCallout />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center space-y-2">
            <MuxPlayer {...muxVideos.walkthrough} />
            <Link
              href={'/examples'}
              className="flex items-center text-sm rounded-full border bg-white backdrop-blur-lg px-2.5 py-0.5 gap-1 hover:bg-gray-50 shadow"
            >
              See some examples <ChevronRightIcon height="1rem" />
            </Link>
          </div>
        </TwoColResponsive>
      </SectionWide>
    </div>
  );
}

function LandingProblemStatement() {
  return (
    <div className="my-16">
      <Section>
        <div className="flex flex-col gap-8">
          <div className="md:mx-auto md:max-w-md md:text-center">
            <H3>Instant is a batteries included client-side database</H3>
          </div>
          <TwoColResponsive>
            <div className="flex flex-1 flex-col gap-4">
              <p>
                To build an app you write two kinds of code. The business logic
                that solves your specific problem, and the generic stuff that
                most apps have to take care of: authenticating users, making
                queries, running permissions, uploading files, and executing
                transactions.
              </p>
              <p>
                The generic stuff is critical to get right, full of edge cases,
                and also not the differentiating factor for your app — unless
                they’re broken
              </p>
              <p>If all this work isn’t differentiating, why work on it?</p>
              <p>
                <strong>
                  Instant gives you a database with queries, transactions, auth,
                  permissions, storage, real-time and offline support. All in a
                  simple SDK you can use directly in the browser.
                </strong>
              </p>
              <p>
                Here we implement chat using three functions:{' '}
                <code className="font-mono text-orange-600 text-sm">
                  `init`
                </code>
                ,{' '}
                <code className="font-mono text-orange-600 text-sm">
                  `useQuery`
                </code>
                , and{' '}
                <code className="font-mono text-orange-600 text-sm">
                  `transact`
                </code>
              </p>
              <p>
                Want to try it yourself?{' '}
                <TextLink href="/tutorial">
                  Build a full-stack app in less than 10 minutes.
                </TextLink>
              </p>
            </div>
            <div className="flex flex-1 flex-col gap-4">
              <div className="overflow-auto rounded border bg-prism font-mono text-sm">
                <Fence language="javascript" code={queryExampleComponentCode} />
              </div>
            </div>
          </TwoColResponsive>
        </div>
      </Section>
    </div>
  );
}

function LandingCore() {
  return (
    <div className="py-16">
      <Section>
        <div className="flex flex-col gap-6">
          <div className="md:mx-auto md:max-w-md md:text-center">
            <H3>Real-time by default</H3>
          </div>
          <div className="md:mx-auto md:max-w-2xl md:text-left">
            <p>
              The best apps today have a common feature set. Every interaction
              happens instantly, you rarely see loading screens, collaboration
              is easy and delightful, and the app still works when offline.{' '}
              <strong>
                When you use Instant, you get these features for free
              </strong>
              .
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}

function LandingMulti() {
  return (
    <div className="py-16">
      <Section>
        <div className="flex flex-col gap-6">
          <div className="md:mx-auto md:max-w-md md:text-center">
            <H3>Built for humans and agents</H3>
          </div>
          <div className="md:mx-auto md:max-w-2xl md:text-left space-y-2">
            <p>
              When we started building Instant we wanted something great for
              builders. We wanted to offer a generous free tier where projects
              aren't limited or paused. To make this work we built Instant to be
              multi-tenant.{' '}
              <strong>
                This means you can spin up a new database in less than 100ms.
              </strong>
            </p>
            <p>
              Turns out when you make something great for humans, it also works
              great for agents. Combine a multi-tenant database with a platform
              SDK and you have infrastructure that lets an agent have a backend
              for every chat.
            </p>
            <p>
              We wrote an essay to go deeper on what we mean. If this interests
              you and your team we'd love to chat.
            </p>
          </div>
          <div className="flex flex-row justify-center gap-4">
            <Button
              type="link"
              variant="secondary"
              size="large"
              href="/essays/agents"
            >
              Read Essay on Agents
            </Button>
            <Button
              type="link"
              variant="cta"
              size="large"
              href="mailto:founders@instantdb.com?subject=InstantDB%20Platform%20Plan%20Inquiry"
            >
              Contact Us
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}

const ThemedTab = ({
  children,
  className,
}: PropsWithChildren & { className?: string }) => {
  return (
    <Tab
      className={({ selected }) =>
        clsx(
          'relative z-10 translate-x-1 px-5 py-2 last:translate-x-0 outline-none',
          className,
          selected ? 'z-20 bg-prism-dark' : 'bg-prism',
        )
      }
    >
      {children}
    </Tab>
  );
};

function LandingCoreFeatures() {
  const isHydrated = useIsHydrated();
  return (
    <div className="my-16">
      <Section>
        <div className="flex flex-col gap-16">
          <TwoColResponsive>
            <div className="flex flex-1 shrink-0 basis-1/2 flex-col gap-6">
              <H4>Instant Updates</H4>
              <p>
                When apps are at their best, every change a user make should
                reflect instantly. There should be few spinners, loading states,
                or refresh buttons.
              </p>

              <p>
                To do this today, you write custom code for endpoints, logic to
                apply optimistic updates, and to handle rollbacks.
              </p>

              <p>
                Databases already know how to apply changes and handle
                rollbacks. With Instant, you write{' '}
                <code className="font-mono text-orange-600">`transact`</code>,
                and optimistic updates are handled for you.
              </p>
            </div>
            <div className="flex flex-1 shrink-0 basis-1/2 flex-col overflow-hidden">
              {isHydrated ? (
                <Tab.Group>
                  <Tab.List className="pl-4">
                    <ThemedTab className="rounded-tl border-l border-t">
                      Instant
                    </ThemedTab>
                    <ThemedTab className="rounded-tr border-r border-t">
                      Not Instant
                    </ThemedTab>
                  </Tab.List>
                  <Tab.Panels>
                    <Tab.Panel>
                      <div className="h-80 overflow-auto rounded border bg-prism text-sm">
                        <Fence
                          language="javascript"
                          code={mutationExampleCode}
                        />
                      </div>
                    </Tab.Panel>
                    <Tab.Panel>
                      <div className="h-80 overflow-auto rounded border bg-prism text-sm">
                        <Fence
                          language="javascript"
                          code={mutationWithoutInstantExampleCode}
                        />
                      </div>
                    </Tab.Panel>
                  </Tab.Panels>
                </Tab.Group>
              ) : null}
            </div>
          </TwoColResponsive>
          <TwoColResponsive>
            <div className="flex flex-1 shrink-0 basis-1/2 flex-col gap-6">
              <H4>Multiplayer</H4>
              <p>
                Users seek collaborative experiences and sync across devices. To
                get this right, you need to set up sockets, cache and invalidate
                queries, and set up permission filters.
              </p>

              <p>
                Instant takes inspiration from systems like Figma’s LiveGraph
                and Linear’s sync. We built the infrastructure that listens to
                transactions, and updates relevant queries.
              </p>
            </div>
            <div className="flex-1 shrink-0 basis-1/2 flex gap-2 flex-col">
              <ExampleMultiPreview
                appId={appId}
                pathName="5-reactions"
                numViews={2}
              />
            </div>
          </TwoColResponsive>
          <TwoColResponsive>
            <div className="flex flex-1 flex-col gap-6">
              <H4>Offline Mode</H4>
              <p>
                Users want your app to work even when they're offline. Not only
                does this make your app available everywhere, it makes your app
                feel faster. The first time your app loads, users see a loading
                screen. Every load afterwards gets satisfied by the local cache.
              </p>
              <p>
                To support this, you need a way to apply changes locally,
                persist to disk, and reconcile when users come back online.{' '}
              </p>
              <p>
                Instant comes with this logic baked in: the local database knows
                what is committed to the server and what is pending. No need to
                deal with queues.
              </p>
            </div>
            <div className="flex-1">
              <LandingOfflineGraphic />
            </div>
          </TwoColResponsive>
        </div>
      </Section>
    </div>
  );
}

function Testimonial({
  blurb,
  person,
  role,
  photo,
}: {
  blurb: string;
  person: string;
  role: string;
  photo: string;
}) {
  return (
    <div>
      <p className="ml-2 h-56 w-80 rounded border bg-white p-4 italic text-gray-700">
        "{blurb}"
      </p>
      <div className="flex -translate-y-1 gap-3">
        <div className="h-16 w-16 overflow-hidden rounded-[50%] bg-black shadow">
          <img src={photo} alt={person} />
        </div>
        <div className="flex flex-col justify-center">
          <div>{person}</div>
          <div className="text-gray-500">{role}</div>
        </div>
      </div>
    </div>
  );
}

function LandingTestimonials() {
  return (
    <div className="hiddenscrollbar flex my-16 overflow-auto mx-8 xl:justify-center ">
      <div className="hiddenscrollbar flex gap-12 xl:grid xl:grid-cols-3">
        {testimonials.map((t) => (
          <Testimonial key={t.person} {...t} />
        ))}
      </div>
    </div>
  );
}

const angels = [
  { name: 'James Tamplin', role: 'CEO of Firebase' },
  { name: 'Paul Graham', role: 'Co-Founder of YCombinator' },
  { name: 'Karri Saarinen', role: 'CEO of Linear' },
  { name: 'Amjad Masad', role: 'CEO of Replit' },
  { name: 'Zach Sims', role: 'CEO of Codecademy' },
  { name: 'Greg Brockman', role: 'Co-Founder of OpenAI' },
  { name: 'Jeff Dean', role: 'Chief Scientist of Google DeepMind' },
  {
    name: 'And 50+ technical founders',
    role: 'Sendbird, Panther, Segment and more',
  },
];

function AngelList() {
  return (
    <div className="grid list-disc grid-cols-2 items-start gap-4">
      {angels.map(({ name, role }) => {
        return (
          <div key={name} className="flex items-center gap-4">
            <div>
              <div>{name}</div>
              <div className="text-gray-500">{role}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LandingTeam() {
  return (
    <div className="my-16">
      <Section>
        <div className="flex flex-col gap-12">
          <div className="flex flex-col gap-6">
            <div className="md:mx-auto md:max-w-md md:text-center">
              <H3>About the team</H3>
            </div>
            <div className="flex flex-col gap-6 md:mx-auto md:max-w-2xl">
              <p>
                Instant is built by senior and staff engineers from Facebook and
                Airbnb. We spent multiple years thinking deeply about this
                problem and have built a product that we believe is the future
                of application development.
              </p>
              <p>
                We're backed by YCombinator, SV Angel, and top investors like:
              </p>
              <AngelList />
            </div>
          </div>
          <div className="flex flex-row justify-center gap-4">
            <Button type="link" variant="cta" size="large" href="/dash">
              Start Building
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}

const SeeTheCodeButton = ({ href }: { href: string }) => (
  <Link
    href={href}
    className="flex items-center text-sm rounded-full border bg-white backdrop-blur-lg px-2.5 py-0.5 gap-1 hover:bg-gray-50 shadow"
  >
    See the code <ChevronRightIcon height="1rem" />
  </Link>
);

function LandingOfflineGraphic() {
  const showQueueLength = 3;
  const [state, setState] = useState<{
    online: boolean;
    queue1: { ts: string }[];
    queue2: { ts: string }[];
    synced: { ts: string }[];
  }>({
    online: false,
    queue1: [],
    queue2: [],
    synced: [],
  });

  function onClick(q: 'queue1' | 'queue2') {
    setState((s) =>
      produce(s, (d) => {
        const e = { ts: new Date().toISOString() };
        if (!s.online) {
          d[q].push(e);
        } else {
          d.synced.push(e);
        }
      }),
    );
  }

  function onChangeOnline(online: boolean) {
    setState((s) => {
      if (!online) {
        return { ...s, online: false };
      }

      return {
        online: true,
        queue1: [],
        queue2: [],
        synced: [...s.synced, ...s.queue1, ...s.queue2],
      };
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div
          onClick={(e) => {
            onChangeOnline(!state.online);
          }}
          className={clsx(
            'flex w-36 items-center space-x-2 rounded px-2 py-2 shadow-sm transition-colors cursor-pointer',
            state.online
              ? 'bg-emerald-500/10 text-emerald-700'
              : 'bg-gray-500/20 text-gray-900',
          )}
        >
          <Switch enabled={state.online} onChange={onChangeOnline} />
          <span>{state.online ? 'Sync On' : 'Sync Off'}</span>
        </div>
      </div>
      <div className="flex gap-2">
        {(['queue1', 'queue2'] as const).map((q) => (
          <div key={q} className="flex flex-1 flex-col gap-3">
            <div
              className={clsx(
                'w-fullrounded-lg aspect-[16/10] rounded bg-gray-500/10 p-1 shadow-xl',
              )}
            >
              <div className="flex h-full flex-col items-center justify-center gap-1 rounded bg-white p-2">
                <button
                  className="bg-orange-600 px-2 py-1 text-white transition-all active:scale-95"
                  onClick={() => onClick(q)}
                >
                  Press me
                </button>
                <span className="font-bold">
                  Check-ins: {state[q].length + state.synced.length}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col-reverse gap-1">
                {state[q].slice(-showQueueLength).map((item, i) => (
                  <div
                    className={clsx(
                      'overflow-hidden rounded-sm border bg-white px-2 py-1 font-mono text-xs shadow-sm transition-transform',
                    )}
                  >
                    {item.ts}
                  </div>
                ))}
              </div>
              {state[q].length > showQueueLength ? (
                <div className="flex justify-center text-xs text-gray-500">
                  {state[q].length - showQueueLength} more
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Landing2024() {
  return (
    <LandingContainer>
      <Head>
        <title>Instant</title>
        <meta
          key="og:title"
          property="og:title"
          content="InstantDB: A Modern Firebase"
        />
        <meta
          key="og:description"
          property="og:description"
          content="We make you productive by giving your frontend a real-time database."
        />
      </Head>
      <GlowBackground>
        <MainNav />
        <LandingHero />
      </GlowBackground>
      <LandingProblemStatement />
      <LandingTestimonials />
      <GlowBackground>
        <LandingCore />
      </GlowBackground>
      <LandingCoreFeatures />
      <GlowBackground>
        <LandingMulti />
      </GlowBackground>
      <LandingTeam />
      <LandingFooter />
    </LandingContainer>
  );
}

export function ExampleMultiPreview({
  numViews,
  appId,
  pathName,
}: {
  numViews: number;
  appId: string;
  pathName: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {Array(numViews)
        .fill(null)
        .map((_, i) => (
          <div key={i} className="flex h-36 bg-white rounded border shadow-sm">
            {appId ? (
              <iframe
                className="flex-1"
                src={'/examples/' + pathName + '?__appId=' + appId}
              />
            ) : (
              <div className="flex-1 animate-slow-pulse bg-gray-300"></div>
            )}
          </div>
        ))}
      <div className="flex justify-center">
        <SeeTheCodeButton href={`/examples#${pathName}`} />
      </div>
    </div>
  );
}

const testimonials = [
  {
    blurb: `I wanted to build relational capabilities into Firebase (but it would have required us to build another database and we never got around to it). I'm glad to see Instant is doing it.`,
    person: 'James Tamplin',
    role: 'Co-Founder, Firebase',
    photo: '/img/peeps/james.png',
  },
  {
    blurb:
      'Most generic database query tools like react-query etc. are cached at the browser tab level. So if you rename a file, the tab bar can easily become out of sync unless you have a great local first sync provider... and I got it working easily with Instant.',
    person: 'AJ Nandi',
    role: 'Co-Founder, Subset.so',
    photo: '/img/peeps/aj_nandi.jpeg',
  },
  {
    blurb:
      "Instant takes care of complex data ops so you can focus on building your product. I wouldn't want to use any other db right now.",
    person: 'Ignacio De Haedo',
    role: 'Engineer, Meta',
    photo: '/img/peeps/nacho.jpg',
  },
  {
    blurb:
      'Deeply nested, GraphQL-like queries that update in realtime are a dream come true.',
    person: 'Hunter Tinney',
    role: 'CTO, Palette',
    photo: '/img/peeps/hunter.jpeg',
  },
  {
    blurb: `I built a cross-platform app across mobile and React Native. I copy-pasted my data logic, and it all just worked!`,
    person: 'Alex Reichert',
    role: 'Engineer, Stripe',
    photo: '/img/peeps/alex.png',
  },
  {
    blurb:
      'I built an “email inbox” simulation with user auth/login, permissions, multiple folders (inbox /_ sent), and live updates (including sending across user accounts) in ~50 minutes or so. Very impressive stuff, and a lot of fun!',
    person: 'Sean Grove',
    role: 'Engineer, OpenAI',
    photo: '/img/peeps/sean.png',
  },
];

const queryExampleComponentCode = /*js*/ `
import { init, tx, id } from "@instantdb/react";

const db = init({
  appId: process.env.NEXT_PUBLIC_APP_ID,
});

function Chat() {
  // 1. Read
  const { isLoading, error, data } = db.useQuery({
    messages: {},
  });

  // 2. Write
  const addMessage = (message) => {
    db.transact(tx.messages[id()].update(message));
  };

  // 3. Render!
  return <UI data={data} onAdd={addMessage} />;
}`.trim();

const mutationExampleCode = /*js*/ `async function deleteTodo(id) {
  // teams and todos are _immediately_
  // updated. If there's an error,
  // instant rolls back for you
  transact(db.tx.todos[id].delete());
}`;

const mutationWithoutInstantExampleCode = /*js*/ `async function deleteTodo(id) {
  // get all the teams we need to
  // change the todo for
  const todo = todoStore.get(id);
  const teamsForTodo = teamStore
    .getTeamsForTodo(id);
  // delete the todo in each team
  teamsForTodo.forEach((team) => {
    team.deleteTodo(id);
  });
  // delete the todo in the store
  todoStore.delete(id);
  try {
    await api.deleteTodo(id, newText);
  } catch (e) {
    // uh oh, there was a failure,
    // let's roll back
    todoStore.set(id, todo);
    teamsForTodo.forEach((team) => {
      team.addTodo(id);
    });
  }
}`;
