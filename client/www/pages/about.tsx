import { MainNav } from '@/components/marketingUi';
import { Footer } from '@/components/new-landing/Footer';
import { Section } from '@/components/new-landing/Section';
import { TopWash } from '@/components/new-landing/TopWash';
import { AnimateIn } from '@/components/new-landing/AnimateIn';
import { TabbedCodeExample } from '@/components/new-landing/TabbedCodeExample';
import { TripleDemo } from '@/components/about/TripleDemo';
import { DatalogDemo } from '@/components/about/DatalogDemo';
import { SqlDemo } from '@/components/about/SqlDemo';
import {
  LandingButton,
  SectionTitle,
  SectionSubtitle,
  Subheading,
} from '@/components/new-landing/typography';
import {
  queryExamples,
  transactionExamples,
} from '@/lib/product/database/examples';
import { permissionExamples } from '@/lib/product/auth/examples';
import { motion, useReducedMotion } from 'motion/react';

const heroWords = 'Building the database for the AI era'.split(' ');

function DownArrow() {
  return (
    <div className="flex justify-center">
      <svg
        className="h-5 w-5 text-gray-300"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"
        />
      </svg>
    </div>
  );
}

function HeroHeader() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="flex flex-col items-center gap-10 text-center lg:flex-row lg:items-center lg:gap-16 lg:text-left">
      <h1 className="text-4xl leading-[1.1] font-normal sm:text-5xl lg:max-w-[60%] lg:text-6xl">
        {heroWords.map((word, i) => (
          <motion.span
            key={i}
            className="mr-[0.28em] inline-block"
            initial={{
              opacity: 0,
              y: shouldReduceMotion ? 0 : 20,
              filter: shouldReduceMotion ? 'none' : 'blur(4px)',
            }}
            animate={{
              opacity: 1,
              y: 0,
              filter: 'blur(0px)',
            }}
            transition={{
              duration: 0.5,
              ease: [0.25, 0.1, 0.25, 1],
              delay: 0.1 + i * 0.08,
            }}
          >
            {word}
          </motion.span>
        ))}
      </h1>
      <motion.p
        className="max-w-xl text-lg text-balance sm:text-xl lg:max-w-lg"
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.6,
          ease: 'easeOut',
          delay: 0.1 + heroWords.length * 0.08 + 0.15,
        }}
      >
        We started Instant because we believed we needed a new kind of database
        for the future of app development. Now, with agents building more
        software than ever, that need is bigger than ever.
      </motion.p>
    </div>
  );
}

const timelineEvents = [
  {
    date: 'April 2021',
    title: 'The Essay',
    description:
      '"Database in the Browser" outlines what the future of app development could look like. The ideas resonate with thousands of developers.',
  },
  {
    date: 'August 2022',
    title: 'The Architecture',
    description:
      '"A Graph-Based Firebase" goes viral on Twitter. The team lays out how a triple store and a new query language could give developers the best of Firebase and Supabase.',
  },
  {
    date: 'August 2024',
    title: 'Open Source Launch',
    description:
      'After two years of development, Instant is open-sourced. Hits the front page of Hacker News with 1,000+ upvotes. The demo of spinning up a database instantly captures developer imagination.',
  },
  {
    date: 'January 2025',
    title: 'Full Backend',
    description:
      'Instant becomes a complete backend as a service with database, auth, permissions, and storage.',
  },
  {
    date: 'August 2025',
    title: 'Create Instant App',
    description:
      'Launch of create-instant-app and end-to-end typesafety. Getting started with Instant becomes as easy as a single terminal command.',
  },
  {
    date: 'January 2026',
    title: 'Instant sings with AI',
    description:
      'Modern LLMs natively know how to use Instant. Agents can build full apps in a few prompts. Instant handles 10,000+ concurrent connections and 1,000+ queries per second in production.',
  },
];

const values = [
  {
    title: 'Sync is the future',
    description:
      "Every app will eventually need real-time sync, optimistic updates, and offline mode. These shouldn't require a team of engineers. They should come for free.",
  },
  {
    title: 'Good abstractions compound',
    description:
      "When the right abstraction exists, it's a waste of tokens to build it again. One coherent package beats ten separate services wired together.",
  },
  {
    title: 'Agents need infrastructure too',
    description:
      'In the AI era, more apps will be built than ever. We need hosting that scales to millions of apps, not just millions of users.',
  },
  {
    title: 'Developer experience is everything',
    description:
      "A 12-line chat app. A single terminal command to get started. Schema, permissions, and queries all in your code. If it's not delightful, we haven't shipped.",
  },
];

export default function AboutPage() {
  return (
    <div className="text-off-black w-full overflow-x-auto">
      <MainNav transparent />

      {/* Hero */}
      <div className="relative overflow-hidden pt-16">
        <TopWash />
        <Section className="relative pt-16 pb-16 sm:pt-20 sm:pb-20">
          <HeroHeader />
        </Section>
      </div>

      {/* Our Story + Timeline */}
      <Section className="pt-4 sm:pt-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: narrative */}
          <div className="text-center lg:text-left">
            <Subheading>Our story</Subheading>
            <div className="mt-8 space-y-6 text-[17px] leading-relaxed text-gray-600">
              <p>
                In 2021, we wrote{' '}
                <a
                  href="/essays/db_browser"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-600 underline underline-offset-2 hover:text-orange-700"
                >
                  &ldquo;Database in the Browser&rdquo;
                </a>
                , a deep exploration of every pain point developers face
                building modern apps. Fetching data, keeping it consistent,
                optimistic updates, offline mode, permissions. The thesis was
                simple: these are all database problems in disguise.
              </p>
              <p>
                A year later, we published{' '}
                <a
                  href="/essays/next_firebase"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-600 underline underline-offset-2 hover:text-orange-700"
                >
                  &ldquo;A Graph-Based Firebase&rdquo;
                </a>
                , which laid out how a triple store and a new query language
                could give developers the relational power of Supabase with the
                real-time magic of Firebase. The essay went viral and the team
                raised a seed round to build Instant.
              </p>
              <p>
                Two years of heads-down development later, Instant was
                open-sourced. It hit the front page of Hacker News with 1,000+
                upvotes. The demo of spinning up a database instantly resonated
                with the community.
              </p>
              <p>
                In 2025 Instant became a full backend solution with database,
                auth, permissions, and storage all governed by the same data
                model. Then came{' '}
                <span className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-sm">
                  create-instant-app
                </span>{' '}
                and end-to-end typesafety, so getting started was as easy as a
                single terminal command.
              </p>
              <p>
                In 2026 Instant entered the AI era. Modern LLMs natively know
                how to use it. Give them a bit of context and they can build
                apps like Counter-Strike and Instagram in a few prompts.
              </p>
              <p>
                With the rise of agents, we believe more software will be built
                than ever. Infrastructure needs to scale to millions of apps,
                not just millions of users. Instant is the database for that
                future.
              </p>
            </div>
          </div>

          {/* Right: timeline */}
          <div className="relative lg:mt-16">
            <div className="absolute top-0 bottom-0 left-4 w-px bg-gray-300" />
            <div className="space-y-8">
              {timelineEvents.map((event) => (
                <div key={event.date} className="relative pl-12">
                  <div className="absolute top-1.5 left-2.5 h-3 w-3 rounded-full bg-orange-600 ring-4 ring-white" />
                  <div className="text-sm font-medium text-orange-600">
                    {event.date}
                  </div>
                  <h3 className="mt-1 text-base font-semibold">
                    {event.title}
                  </h3>
                  <p className="mt-1 text-sm">{event.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Values */}
      <div className="relative overflow-hidden bg-[#F2F0ED]">
        <div className="pointer-events-none absolute top-0 right-0 left-0 z-[5] h-24 bg-gradient-to-b from-white to-transparent" />
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-[5] h-24 bg-gradient-to-b from-transparent to-white" />
        <Section className="relative z-10 !pt-6 sm:!pt-10">
          <div className="text-center">
            <SectionTitle>What we believe</SectionTitle>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 md:px-12">
            {values.map((v) => (
              <div key={v.title}>
                <h3 className="text-xl font-normal sm:text-2xl">{v.title}</h3>
                <p className="mt-2 text-lg text-gray-600">{v.description}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Architecture */}
      <Section className="pb-0 sm:pb-0">
        <div className="flex flex-col items-center text-center">
          <SectionTitle>Under the hood</SectionTitle>
          <SectionSubtitle>
            Instant looks simple on the surface. A few lines of code and your
            app has a real-time backend. But there&apos;s a lot of interesting
            architecture that makes this possible.
          </SectionSubtitle>
        </div>

        <div className="mt-16 space-y-24">
          {/* 1. Triples */}
          <div className="flex flex-col items-stretch gap-8 md:flex-row md:items-center">
            <div className="space-y-4 md:max-w-[400px]">
              <Subheading>Triples: the foundation</Subheading>
              <p className="mt-2 text-base">
                All data in Instant is stored as triples:{' '}
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
                  [entity, attribute, value]
                </code>
                . A user&apos;s name, a goal&apos;s title, a relation between
                them. They&apos;re all expressed the same way.
              </p>
              <p className="mt-2 text-base">
                This simple, uniform structure can model any entity and any
                relationship. Because triples work the same on both the frontend
                and backend, we can use the same data model everywhere.
              </p>
            </div>
            <div className="flex min-w-0 grow items-center justify-center lg:bg-[#F0F5FA] lg:px-[40px] lg:py-[37px]">
              <TripleDemo />
            </div>
          </div>

          {/* 2. InstaQL */}
          <AnimateIn>
            <div className="flex flex-col-reverse items-stretch gap-8 md:flex-row md:items-center">
              <div className="lg:bg-surface/20 min-w-0 grow lg:px-[66px] lg:py-[37px]">
                <TabbedCodeExample
                  examples={queryExamples}
                  tabs={[
                    { key: 'query', label: 'InstaQL' },
                    { key: 'result', label: 'Result' },
                    { key: 'sql', label: 'Equivalent SQL', language: 'sql' },
                  ]}
                />
              </div>
              <div className="space-y-4 md:max-w-[440px]">
                <Subheading>InstaQL: reading data</Subheading>
                <p className="mt-2 text-base">
                  Developers write InstaQL, a declarative syntax using plain
                  JavaScript objects. You describe the shape of the data you
                  want, and that&apos;s the shape you get back.
                </p>
                <p className="mt-2 text-base">
                  No joins, no SQL, no GraphQL resolvers. The query language was
                  designed so that the shape of the query mirrors the shape of
                  the result.
                </p>
              </div>
            </div>
          </AnimateIn>

          {/* 3. Datalog on the frontend */}
          <AnimateIn>
            <div className="flex flex-col items-stretch gap-8 md:flex-row md:items-center">
              <div className="space-y-4 md:max-w-[400px]">
                <Subheading>Datalog on the frontend</Subheading>
                <p className="mt-2 text-base">
                  On the client, InstaQL queries compile to Datalog, a
                  logic-based query language that runs in a lightweight engine
                  right in the browser.
                </p>
                <p className="mt-2 text-base">
                  This local datalog engine is what makes optimistic updates
                  possible. When you mutate data, the change applies to the
                  local triple store instantly. The engine re-evaluates affected
                  queries and your UI updates before the server even responds.
                </p>
              </div>
              <div className="flex min-w-0 grow items-center justify-center lg:bg-radial lg:from-white lg:to-[#FFF9F4] lg:px-[40px] lg:py-[37px]">
                <DatalogDemo />
              </div>
            </div>
          </AnimateIn>

          {/* 4. SQL on the server */}
          <AnimateIn>
            <div className="flex flex-col-reverse items-stretch gap-8 md:flex-row md:items-center">
              <div className="flex min-w-0 grow items-center justify-center lg:bg-[#F5F3FF] lg:px-[40px] lg:py-[37px]">
                <SqlDemo />
              </div>
              <div className="space-y-4 md:max-w-[440px]">
                <Subheading>SQL on the server</Subheading>
                <p className="mt-2 text-base">
                  On the server, the same InstaQL queries take a different path.
                  They&apos;re translated into SQL and executed against Postgres
                  Aurora.
                </p>
                <p className="mt-2 text-base">
                  You get the performance and reliability of a battle-tested
                  database. One query language, two execution paths: datalog
                  locally for speed, SQL on the server for truth.
                </p>
              </div>
            </div>
          </AnimateIn>

          {/* 5. InstaML */}
          <AnimateIn>
            <div className="flex flex-col items-stretch gap-8 md:flex-row md:items-center">
              <div className="space-y-4 md:max-w-[400px]">
                <Subheading>InstaML: writing data</Subheading>
                <p className="mt-2 text-base">
                  For writes, developers use InstaML, a simple API for creating,
                  updating, deleting, and linking data.
                </p>
                <p className="mt-2 text-base">
                  Write operations optimistically modify the client-side triple
                  store for instant feedback, then send transactions to the
                  server as the source of truth. If the server rejects a write,
                  the local store rolls back automatically.
                </p>
              </div>
              <div className="min-w-0 grow lg:bg-[#F0F5FA] lg:px-[66px] lg:py-[37px]">
                <TabbedCodeExample
                  examples={transactionExamples}
                  tabs={[{ key: 'code', label: 'InstaML' }]}
                  height="h-56"
                />
              </div>
            </div>
          </AnimateIn>

          {/* 4. Permissions */}
          <AnimateIn>
            <div className="flex flex-col-reverse items-stretch gap-8 md:flex-row md:items-start">
              <div className="min-w-0 grow lg:bg-radial lg:from-white lg:to-[#FFF9F4] lg:px-[66px] lg:py-[37px]">
                <TabbedCodeExample
                  examples={permissionExamples}
                  tabs={[
                    {
                      key: 'code',
                      label: 'instant.perms.ts',
                      language: 'typescript',
                    },
                  ]}
                />
              </div>
              <div className="space-y-4 md:max-w-[440px]">
                <Subheading>Permissions: access control</Subheading>
                <p className="mt-2 text-base">
                  Every read and every write passes through a permission layer
                  based on Google&apos;s Common Expression Language (CEL).
                </p>
                <p className="mt-2 text-base">
                  Permissions are expressive enough to handle complex rules like
                  role-based access, row-level filtering, and field-level
                  visibility, but readable enough that you can reason about them
                  at a glance.
                </p>
              </div>
            </div>
          </AnimateIn>
        </div>
      </Section>

      {/* CTA */}
      <div className="relative overflow-hidden bg-[#F0F5FA]">
        <div className="pointer-events-none absolute top-0 right-0 left-0 z-[5] h-48 bg-gradient-to-b from-white to-transparent" />
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-[5] h-48 bg-gradient-to-b from-transparent to-white" />
        <Section className="relative z-10">
          <div className="text-center">
            <SectionTitle>Come build with us</SectionTitle>
            <p className="mx-auto mt-4 max-w-xl text-lg">
              We&apos;re always looking for exceptional hackers who want to work
              on hard problems at the intersection of databases, sync, and AI.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <LandingButton href="https://instantdb.com/dash">
                Get started
              </LandingButton>
              <LandingButton
                href="mailto:founders@instantdb.com"
                variant="secondary"
              >
                Get in touch
              </LandingButton>
            </div>
          </div>
        </Section>
      </div>

      <Footer />
    </div>
  );
}
