import {
  PropsWithChildren,
  RefObject,
  createRef,
  useEffect,
  useRef,
  useState,
} from 'react';
import produce from 'immer';
import clsx from 'clsx';
import { init } from '@instantdb/react';
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

import { ChevronRightIcon } from '@heroicons/react/solid';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import config from '@/lib/config';
import MuxPlayer from '@mux/mux-player-react';
import * as muxVideos from '@/lib/muxVideos';

type EmojiName = keyof typeof emoji;

const emoji = {
  fire: '🔥',
  wave: '👋',
  confetti: '🎉',
  heart: '❤️',
} as const;

const emojiNames = Object.keys(emoji) as EmojiName[];

const refsInit = Object.fromEntries(
  emojiNames.map((a) => [a, createRef<HTMLDivElement>()])
);

const appId = 'fc5a4977-910a-43d9-ac28-39c7837c1eb5';

const db = init<
  {},
  {
    landing: {
      topics: {
        emoji: {
          name: EmojiName;
          rotationAngle: number;
          directionAngle: number;
        };
      };
    };
  }
>({
  ...config,
  appId,
});

const room = db.room('landing', 'landing');

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

function LandingHero() {
  return (
    <div className="pb-16 pt-8">
      <SectionWide>
        <TwoColResponsive>
          <div className="flex flex-1 flex-col gap-8">
            <H2>The realtime client-side database</H2>
            <p>
              Instant is for building real-time and offline-enabled
              applications. We make it easy to build collaborative products like
              Notion or Figma.
            </p>
            <div className="flex flex-row gap-2 md:justify-start">
              <Button type="link" variant="cta" size="large" href="/dash">
                Get Started
              </Button>
              <Button
                type="link"
                variant="secondary"
                size="large"
                href="/tutorial"
              >
                Try the demo
              </Button>
            </div>
            <div className="flex items-center justify-start space-x-2">
              <img src="/img/yc_logo.png" className="inline h-4 w-4" />
              <span className="text-sm">Backed by Y Combinator</span>
            </div>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center space-y-2">
            <MuxPlayer {...muxVideos.walkthrough} />
            <Link href={'/examples'}>
              <a className="flex items-center text-sm rounded-full border bg-white backdrop-blur-lg px-2.5 py-0.5 gap-1 hover:bg-gray-50 shadow">
                See some examples <ChevronRightIcon height="1rem" />
              </a>
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
            <H3>You write your frontend, and we handle the rest</H3>
          </div>
          <TwoColResponsive>
            <div className="flex flex-1 flex-col gap-4">
              <p>
                The best apps today have a common feature set. Every interaction
                happens instantly, you rarely see loading screens, collaboration
                is easy and delightful, and the app still works when offline.
              </p>
              <p>
                But building them is a schlep: spin up servers, auth,
                permissions, endpoints, sockets, then shuffle data, handle
                optimistic updates, and deal with rollbacks.
              </p>
              <p>
                <strong>
                  Instant solves these problems for you by giving you a database
                  you can subscribe to directly in the browser.
                </strong>{' '}
                You write relational queries in your app, and we handle the
                rest.
              </p>
              <p>
                Want to try it yourself?{' '}
                <TextLink href="https://instantdb.com/docs">
                  Build a live app in less than 5 minutes.
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

function LandingHow() {
  return (
    <div className="py-16">
      <Section>
        <div className="flex flex-col gap-6">
          <div className="md:mx-auto md:max-w-md md:text-center">
            <H3>A new kind of client-side infrastructure</H3>
          </div>
          <div className="md:mx-auto md:max-w-2xl md:text-center">
            <p>
              Instant was born when we realized that some of the hardest UI
              problems are actually database problems in disguise. When you
              solve problems at the database layer, your software becomes more
              powerful and succinct. Here’s how:
            </p>
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
          selected ? 'z-20 bg-prism-dark' : 'bg-prism'
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

function LandingRealtimeFeatures() {
  return (
    <div className="bg-gray-100 py-16">
      <Section>
        <div className="flex flex-col gap-8">
          <div className="md:mx-auto md:max-w-md md:text-center">
            <H3>Cursors, Typing Indicators, and Presence at your fingertips</H3>
          </div>
          <TwoColResponsive>
            <div className="flex flex-1 flex-col gap-4">
              <p>
                Once your application becomes multiplayer, you see opportunities
                for new experiences everywhere: who’s online, who’s typing, and
                where are their cursors?
              </p>

              <p>
                Instant supports these use cases —{' '}
                <strong>you can add shared cursors in 10 lines.</strong>
              </p>
            </div>
            <div className="flex flex-1 gap-2 flex-col">
              <ExampleMultiPreview
                appId={appId}
                pathName="4-custom-cursors"
                numViews={2}
              />
            </div>
          </TwoColResponsive>
        </div>
      </Section>
    </div>
  );
}

function LandingScaleFeatures() {
  return (
    <div className="py-16">
      <Section>
        <div className="flex flex-col gap-6">
          <div className="md:mx-auto md:max-w-md md:text-center">
            <H3>Start without a backend, scale to complex use cases</H3>
          </div>
          <div className="flex flex-col gap-6 md:mx-auto md:max-w-2xl">
            <p>
              When you use Instant, you can focus on what’s important: building
              a great UX for your users, and doing it quickly.
            </p>
            <p>
              You don’t need servers, separate auth providers, custom endpoints,
              front-end stores, or different APIs for mobile vs web. You get a
              real-time architecture that makes your frontend smooth.
            </p>
            <p>
              When time comes for custom backend logic, you can spin up a server
              and use Instant’s admin SDK. Build your next SaaS app, React
              Native app, web app, or collaborative app on Instant. We’ll help
              you move fast, and scale alongside you.
            </p>
          </div>
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
              <p>
                Check out our essay below to learn more why we think Instant is
                solving one of the largest problems in frontend development
                today.
              </p>
            </div>
          </div>
          <div className="flex flex-row justify-center gap-4">
            <Button type="link" variant="cta" size="large" href="/dash">
              Get Started
            </Button>
            <Button
              type="link"
              variant="secondary"
              size="large"
              href="/essays/next_firebase"
            >
              Read Essay
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}

const SeeTheCodeButton = ({ href }: { href: string }) => (
  <Link href={href}>
    <a className="flex items-center text-sm rounded-full border bg-white backdrop-blur-lg px-2.5 py-0.5 gap-1 hover:bg-gray-50 shadow">
      See the code <ChevronRightIcon height="1rem" />
    </a>
  </Link>
);

function LandingParty() {
  const elRefsRef = useRef<{
    [k: string]: RefObject<HTMLDivElement>;
  }>(refsInit);

  const publishEmoji = room.usePublishTopic('emoji');

  room.useTopicEffect('emoji', (event) => {
    const { name, directionAngle, rotationAngle } = event;

    const el = elRefsRef.current[name]?.current;
    if (!el) return;

    animateEmoji({ emoji: emoji[name], directionAngle, rotationAngle }, el);
  });

  useEffect(() => {
    const konamiHandler = __konami(() => {
      emojiNames.forEach((emote) => {
        Array(20)
          .fill(null)
          .forEach((_, i) => {
            setTimeout(() => {
              sendEmoji(emote);
            }, i * 200);
          });
      });
    });

    window.addEventListener('keydown', konamiHandler);

    return () => {
      window.removeEventListener('keydown', konamiHandler);
    };
  }, []);

  function sendEmoji(name: EmojiName) {
    const el = elRefsRef.current[name]?.current;
    if (!el) return;

    const params = {
      name,
      rotationAngle: Math.random() * 360,
      directionAngle: Math.random() * 360,
    };

    animateEmoji(
      {
        emoji: emoji[name],
        rotationAngle: params.rotationAngle,
        directionAngle: params.directionAngle,
      },
      elRefsRef.current[name].current
    );

    publishEmoji(params);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="hidden text-sm text-gray-600 md:block">
        This is <strong>live</strong>. Open another tab and press the emojis!
      </div>
      <div className="text-sm text-gray-600 md:hidden">
        This is <strong>live</strong>. Try it with a friend on their device!
      </div>
      <div className="inline-flex select-none gap-6 rounded-xl border bg-white p-6 shadow-lg">
        {emojiNames.map((name, i) => (
          <div key={i} ref={elRefsRef.current[name]} className="relative">
            <button
              className="rounded-lg bg-gray-100 p-2 text-4xl transition-transform hover:scale-110 hover:bg-gray-50 active:scale-90 active:bg-gray-200"
              onClick={() => {
                sendEmoji(name);
              }}
            >
              {emoji[name]}
            </button>
          </div>
        ))}
      </div>
      <SeeTheCodeButton href="/examples#5-reactions" />
    </div>
  );
}

function LandingMultiplayerGraphic() {
  const [items, setItems] = useState([
    { title: 'Hack', done: false },
    { title: 'Write tests', done: false },
    { title: 'Ship', done: false },
    { title: 'Talk to customers', done: false },
  ]);

  useEffect(() => {
    const t = setInterval(() => {
      const i = Math.floor(Math.random() * items.length);

      setItems((items) =>
        produce(items, (d) => {
          const nextCheckIdx = items.findIndex((i) => !i.done);

          if (nextCheckIdx > -1) {
            d[nextCheckIdx].done = !d[nextCheckIdx].done;
          } else {
            for (let index = 0; index < items.length; index++) {
              d[index].done = false;
            }
          }
        })
      );
    }, 2000);

    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-1 translate-x-2 flex-row">
        {[1, 2].map((s) => (
          <div
            key={s}
            className={clsx(
              'w-1/2 rounded bg-gray-500/10 p-1 shadow-xl',
              '-translate-x-4 first:translate-x-0',
              'translate-y-3 first:translate-y-0'
            )}
          >
            <div className="flex h-full w-full flex-col gap-1 overflow-auto rounded bg-white p-4 text-sm text-gray-600">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() =>
                      setItems(
                        produce(items, (d) => {
                          d[i].done = !d[i].done;
                        })
                      )
                    }
                  />
                  <span
                    className={clsx(
                      item.done ? 'text-gray-400 line-through' : undefined
                    )}
                  >
                    {item.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
      })
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
              : 'bg-gray-500/20 text-gray-900'
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
                'w-fullrounded-lg aspect-[16/10] rounded bg-gray-500/10 p-1 shadow-xl'
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
                      'overflow-hidden rounded-sm border bg-white px-2 py-1 font-mono text-xs shadow-sm transition-transform'
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
        <meta name="description" content="A Graph Database on the Client" />
      </Head>
      <GlowBackground>
        <MainNav />
        <LandingHero />
      </GlowBackground>
      <LandingProblemStatement />
      <LandingTestimonials />
      <GlowBackground>
        <LandingHow />
      </GlowBackground>
      <LandingCoreFeatures />
      <LandingRealtimeFeatures />
      <LandingScaleFeatures />
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
  transact(tx.todos[id].delete());
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

const presenceExampleComponentCode = /*js*/ `function App() {
  const { user, peers } = usePresence('home-page', roomId);

  return <Inspector data={{ user, peers }} />
}`;

const presenceExampleDataCode = /*json*/ `{
  me: { cursor: { x: 455, y: 232 } },
  others: [...]
}`;

function animateEmoji(
  config: { emoji: string; directionAngle: number; rotationAngle: number },
  target: HTMLDivElement | null
) {
  if (!target) return;

  const rootEl = document.createElement('div');
  const directionEl = document.createElement('div');
  const spinEl = document.createElement('div');

  spinEl.innerText = config.emoji;
  directionEl.appendChild(spinEl);
  rootEl.appendChild(directionEl);
  target.appendChild(rootEl);

  style(rootEl, {
    transform: `rotate(${config.directionAngle * 360}deg)`,
    position: 'absolute',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    margin: 'auto',
    zIndex: '10',
    pointerEvents: 'none',
  });

  style(spinEl, {
    transform: `rotateZ(${config.rotationAngle * 400}deg)`,
    fontSize: `40px`,
  });

  setTimeout(() => {
    style(directionEl, {
      transform: `translateY(20vh) scale(2)`,
      transition: 'all 400ms',
      opacity: '0',
    });
  }, 20);

  setTimeout(() => rootEl.remove(), 800);
}

function style(el: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
  Object.assign(el.style, styles);
}

function __konami(callback: (event: KeyboardEvent) => void) {
  let kkeys: number[] = [];
  // up,up,down,down,left,right,left,right,B,A
  const konami = '38,38,40,40,37,39,37,39,66,65';
  return (event: KeyboardEvent) => {
    kkeys.push(event.keyCode);
    if (kkeys.toString().indexOf(konami) >= 0) {
      callback(event);
      kkeys = [];
    }
  };
}
