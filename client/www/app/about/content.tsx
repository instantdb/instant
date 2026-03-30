'use client';

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
import { useState } from 'react';
import {
  queryExamples,
  transactionExamples,
} from '@/lib/product/database/examples';
import { permissionExamples } from '@/lib/product/auth/examples';
import { motion } from 'motion/react';

// Line animation timing (seconds)
const T_HLINE_START = 0.3;
const T_HLINE_DUR = 0.5;
const T_VLINE_START = T_HLINE_START + T_HLINE_DUR;
const T_VLINE_DUR = 1.4;
const T_VLINE_END = T_VLINE_START + T_VLINE_DUR;
const T_BOX_DUR = 0.3;
const T_BOX_TOP = T_VLINE_END;
const T_BOX_RIGHT = T_BOX_TOP + T_BOX_DUR;
const T_BOX_BOTTOM = T_BOX_RIGHT + T_BOX_DUR;
const T_BOX_LEFT = T_BOX_BOTTOM + T_BOX_DUR;

// The "wave" offset — how far behind the settle layer trails the bright layer
const T_WAVE = 0.4;

// Animated line segment with wave effect: muted base → bright front → settled color
function ThreadLine({
  className,
  delay,
  duration,
  direction,
  origin,
  style,
}: {
  className: string;
  delay: number;
  duration: number;
  direction: 'horizontal' | 'vertical';
  origin: string;
  style?: React.CSSProperties;
}) {
  const scale = direction === 'horizontal' ? 'scaleX' : 'scaleY';
  return (
    <>
      <div className={`${className} bg-gray-100`} style={style} />
      <motion.div
        className={`${className} bg-gray-300`}
        initial={{ [scale]: 0 }}
        animate={{ [scale]: 1 }}
        transition={{ duration, delay, ease: 'easeInOut' }}
        style={{ ...style, transformOrigin: origin }}
      />
      <motion.div
        className={`${className} bg-gray-200`}
        initial={{ [scale]: 0 }}
        animate={{ [scale]: 1 }}
        transition={{ duration, delay: delay + T_WAVE, ease: 'easeInOut' }}
        style={{ ...style, transformOrigin: origin }}
      />
    </>
  );
}

function HeroHeader() {
  return (
    <div className="flex flex-col items-center gap-10 text-center lg:flex-row lg:items-center lg:gap-16 lg:text-left">
      <h1 className="text-4xl leading-[1.1] font-normal sm:text-5xl lg:max-w-[60%] lg:text-6xl">
        Building the database for the AI era
      </h1>
      <p className="max-w-xl text-lg text-balance sm:text-xl lg:max-w-lg">
        We started Instant because we believed we needed a new kind of database
        for the future of app development. Now, with agents building more
        software than ever, that need is bigger than ever.
      </p>
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
  const [filterValue, setFilterValue] = useState(true);
  const toggleFilter = () => setFilterValue((v) => !v);
  return (
    <div className="text-off-black w-full overflow-x-auto">
      <MainNav />

      {/* Hero */}
      <div className="relative pt-16">
        <TopWash />
        <Section className="relative pt-16 pb-6 sm:pt-20 sm:pb-8">
          <HeroHeader />
        </Section>
      </div>

      {/* ── Thread container: h-line → timeline → values box ── */}
      <div className="landing-width relative mx-auto">
        {/* Horizontal line */}
        <div className="relative h-px">
          <ThreadLine
            className="absolute inset-0"
            delay={T_HLINE_START}
            duration={T_HLINE_DUR}
            direction="horizontal"
            origin="left"
          />
        </div>

        {/* Our Story + Timeline */}
        <div className="relative pt-4 pb-12 sm:pt-8 sm:pb-16">
          {/* Vertical thread line (lg only) — at the timeline dots' x position */}
          <ThreadLine
            className="absolute hidden w-px lg:block"
            delay={T_VLINE_START}
            duration={T_VLINE_DUR}
            direction="vertical"
            origin="top"
            style={{ left: 'calc(50% + 3rem)', top: 0, bottom: 0 }}
          />
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Left: narrative */}
            <div className="text-center lg:text-left">
              <Subheading>Our story</Subheading>
              <div className="mt-8 space-y-6 text-left text-lg leading-relaxed text-gray-600">
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
                  could give developers the relational power of Supabase with
                  the real-time magic of Firebase. The essay went viral and the
                  team raised a seed round to build Instant.
                </p>
                <p>
                  Two years of heads-down development later, Instant was
                  open-sourced. It hit the front page of Hacker News with 1,000+
                  upvotes. The demo of spinning up a database instantly
                  resonated with the community.
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
                  With the rise of agents, we believe more software will be
                  built than ever. Infrastructure needs to scale to millions of
                  apps, not just millions of users. Instant is the database for
                  that future.
                </p>
              </div>
            </div>

            {/* Right: timeline */}
            <div className="relative lg:mt-16">
              {/* Local timeline line (mobile only — on lg the global line covers it) */}
              <div className="absolute top-0 bottom-0 left-4 w-px bg-gray-200 lg:hidden" />
              <div className="space-y-8">
                {timelineEvents.map((event, i) => (
                  <div key={event.date} className="relative pl-12">
                    {/* Dot — pops in as the line reaches it */}
                    <motion.div
                      className="absolute top-1.5 left-2.5 h-3 w-3 rounded-full bg-orange-600 ring-4 ring-white"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        duration: 0.3,
                        delay:
                          T_VLINE_START +
                          (T_VLINE_DUR * (i + 0.5)) / timelineEvents.length,
                        ease: 'easeOut',
                      }}
                    />
                    <div className="text-base font-medium text-orange-600">
                      {event.date}
                    </div>
                    <h3 className="mt-1 text-lg font-semibold">
                      {event.title}
                    </h3>
                    <p className="mt-1 text-lg">{event.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* What we believe — muted box + animated bright overlay */}
        <div className="relative border border-gray-100">
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 50% 40%, #F5F3F0 0%, #FAFAF9 50%, white 100%)',
            }}
          />
          {/* Animated box borders */}
          <ThreadLine
            className="absolute top-0 right-0 left-0 h-px"
            delay={T_BOX_TOP}
            duration={T_BOX_DUR}
            direction="horizontal"
            origin="left"
          />
          <ThreadLine
            className="absolute top-0 right-0 bottom-0 w-px"
            delay={T_BOX_RIGHT}
            duration={T_BOX_DUR}
            direction="vertical"
            origin="top"
          />
          <ThreadLine
            className="absolute right-0 bottom-0 left-0 h-px"
            delay={T_BOX_BOTTOM}
            duration={T_BOX_DUR}
            direction="horizontal"
            origin="right"
          />
          <ThreadLine
            className="absolute top-0 bottom-0 left-0 w-px"
            delay={T_BOX_LEFT}
            duration={T_BOX_DUR}
            direction="vertical"
            origin="bottom"
          />

          <div className="relative px-8 py-12 sm:px-12 sm:py-16">
            <div className="text-center">
              <SectionTitle>What we believe</SectionTitle>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 md:px-12">
              {values.map((v) => (
                <div key={v.title}>
                  <Subheading>{v.title}</Subheading>
                  <p className="mt-4 text-lg text-gray-600">{v.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Vertical connector — fills the gap between the values box and architecture */}
      <div className="relative flex justify-center">
        <div className="relative w-px py-12 sm:py-16">
          <ThreadLine
            className="absolute inset-0"
            delay={T_BOX_LEFT + T_BOX_DUR}
            duration={0.4}
            direction="vertical"
            origin="top"
          />
        </div>
      </div>

      {/* Architecture */}
      <Section className="!pt-0 pb-0 sm:!pt-0 sm:pb-0">
        <div className="flex flex-col items-center text-center">
          {/* Hood line + title share a w-fit wrapper so they're the same width */}
          <div className="relative w-fit">
            <div className="relative h-px">
              <ThreadLine
                className="absolute inset-0"
                delay={T_BOX_LEFT + T_BOX_DUR + 0.4}
                duration={0.5}
                direction="horizontal"
                origin="center"
              />
            </div>
            <motion.div
              className="h-3"
              style={{
                background:
                  'radial-gradient(ellipse at center top, rgba(0,0,0,0.05) 0%, transparent 70%)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0.4,
                delay: T_BOX_LEFT + T_BOX_DUR + 0.4 + 0.5,
              }}
            />
            <SectionTitle>Under the hood</SectionTitle>
          </div>
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
              <p className="mt-2 text-lg">
                All data in Instant is stored as triples:{' '}
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
                  [entity, attribute, value]
                </code>
                . A user&apos;s name, a goal&apos;s title, a relation between
                them. They&apos;re all expressed the same way.
              </p>
              <p className="mt-2 text-lg">
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
                <p className="mt-2 text-lg">
                  Developers write InstaQL, a declarative syntax using plain
                  JavaScript objects. You describe the shape of the data you
                  want, and that&apos;s the shape you get back.
                </p>
                <p className="mt-2 text-lg">
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
                <p className="mt-2 text-lg">
                  On the client, InstaQL queries compile to Datalog, a
                  logic-based query language that runs in a lightweight engine
                  right in the browser.
                </p>
                <p className="mt-2 text-lg">
                  This local datalog engine is what makes optimistic updates
                  possible. When you mutate data, the change applies to the
                  local triple store instantly. The engine re-evaluates affected
                  queries and your UI updates before the server even responds.
                </p>
              </div>
              <div className="flex min-w-0 grow items-center justify-center lg:bg-radial lg:from-white lg:to-[#FFF9F4] lg:px-[40px] lg:py-[37px]">
                <DatalogDemo
                  filterValue={filterValue}
                  onToggleFilter={toggleFilter}
                />
              </div>
            </div>
          </AnimateIn>

          {/* 4. SQL on the server */}
          <AnimateIn>
            <div className="flex flex-col-reverse items-stretch gap-8 md:flex-row md:items-center">
              <div className="flex min-w-0 grow items-center justify-center lg:bg-[#F5F3FF] lg:px-[40px] lg:py-[37px]">
                <SqlDemo
                  filterValue={filterValue}
                  onToggleFilter={toggleFilter}
                />
              </div>
              <div className="space-y-4 md:max-w-[440px]">
                <Subheading>SQL on the server</Subheading>
                <p className="mt-2 text-lg">
                  On the server, the same InstaQL queries take a different path.
                  They&apos;re translated into SQL and executed against
                  Postgres.
                </p>
                <p className="mt-2 text-lg">
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
                <p className="mt-2 text-lg">
                  For writes, developers use InstaML, a simple API for creating,
                  updating, deleting, and linking data.
                </p>
                <p className="mt-2 text-lg">
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

          {/* 6. Permissions */}
          <AnimateIn>
            <div className="flex flex-col-reverse items-stretch gap-8 md:flex-row md:items-center">
              <div className="min-w-0 grow lg:bg-[#F7F7F8] lg:px-[66px] lg:py-[37px]">
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
              <div className="space-y-4 text-center md:max-w-[440px] md:text-left">
                <Subheading>Permissions: access control</Subheading>
                <p className="mt-2 text-lg">
                  Every read and every write passes through a permission layer
                  based on Google&apos;s Common Expression Language (CEL).
                </p>
                <p className="mt-2 text-lg">
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
