import { MainNav } from '@/components/marketingUi';
import { Footer } from '@/components/new-landing/Footer';

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
    <div className="flex min-h-screen flex-col">
      <MainNav />
      <main className="landing-width mx-auto flex-1">
        {/* Hero */}
        <section className="mx-auto flex items-end gap-[148px] pt-20 pb-16 sm:pt-32 sm:pb-24">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Building the database for the AI era
          </h1>
          <p className="mt-6 text-lg text-balance sm:text-xl">
            We started Instant because we believed we needed a new kind of
            database for the future of app development. Now, with agents
            building more software than ever, that need is bigger than ever.
          </p>
        </section>

        {/* Our Story + Timeline */}
        <section className="py-16 sm:py-24">
          <div className="">
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
              {/* Left: narrative */}
              <div>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Our story
                </h2>
                <div className="mt-8 space-y-6 text-[17px] leading-relaxed text-gray-600">
                  <p>
                    In 2021, we wrote{' '}
                    <a
                      href="/essays/db_browser"
                      className="text-orange-600 underline underline-offset-2 hover:text-orange-700"
                    >
                      &ldquo;Database in the Browser&rdquo;
                    </a>
                    , a deep exploration of every pain point developers face
                    building modern apps. Fetching data, keeping it consistent,
                    optimistic updates, offline mode, permissions. The thesis
                    was simple: these are all database problems in disguise.
                  </p>
                  <p>
                    A year later, we published{' '}
                    <a
                      href="/essays/next_firebase"
                      className="text-orange-600 underline underline-offset-2 hover:text-orange-700"
                    >
                      &ldquo;A Graph-Based Firebase&rdquo;
                    </a>
                    , which laid out how a triple store and a new query language
                    could give developers the relational power of Supabase with
                    the real-time magic of Firebase. The essay went viral and
                    the team raised a seed round to build Instant.
                  </p>
                  <p>
                    Two years of heads-down development later, Instant was
                    open-sourced. It hit the front page of Hacker News with
                    1,000+ upvotes. The demo of spinning up a database instantly
                    resonated with the community.
                  </p>
                  <p>
                    In 2025 Instant became a full backend solution with
                    database, auth, permissions, and storage all governed by the
                    same data model. Then came{' '}
                    <span className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-sm">
                      create-instant-app
                    </span>{' '}
                    and end-to-end typesafety, so getting started was as easy as
                    a single terminal command.
                  </p>
                  <p>
                    In 2026 Instant entered the AI era. Modern LLMs natively
                    know how to use it. Give them a bit of context and they can
                    build apps like Counter-Strike and Instagram in a few
                    prompts.
                  </p>
                  <p>
                    With the rise of agents, we believe more software will be
                    built than ever. Infrastructure needs to scale to millions
                    of apps, not just millions of users. Instant is the database
                    for that future.
                  </p>
                </div>
              </div>

              {/* Right: timeline */}
              <div className="relative lg:mt-16">
                <div className="absolute top-0 bottom-0 left-4 w-px bg-gray-300" />
                <div className="space-y-8">
                  {timelineEvents.map((event) => (
                    <div key={event.date} className="relative pl-12">
                      <div className="absolute top-1.5 left-2.5 h-3 w-3 rounded-full bg-orange-600 ring-4 ring-gray-50" />
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
          </div>
        </section>

        {/* Values */}
        <section className="py-16 sm:py-24">
          <div className="">
            <h2 className="text-center text-3xl font-semibold text-balance sm:text-4xl">
              What we believe
            </h2>
            <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 md:px-12">
              {values.map((v) => (
                <div key={v.title}>
                  <h3 className="text-lg font-semibold">{v.title}</h3>
                  <p className="mt-2 text-gray-600">{v.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Architecture */}
        <section className="py-16 sm:py-24">
          <div className="">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold sm:text-4xl">
                Under the hood
              </h2>
              <p className="mt-4 text-lg">
                Instant looks simple on the surface. A few lines of code and
                your app has a real-time backend. But there&apos;s a lot of
                interesting architecture that makes this possible. It starts
                with how we store data.
              </p>
            </div>

            <div className="mt-16 space-y-20">
              {/* 1. Triples */}
              <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-12">
                <div>
                  <h3 className="text-xl font-semibold">
                    Triples: the foundation
                  </h3>
                  <p className="mt-3 leading-relaxed text-gray-600">
                    All data in Instant is stored as triples:{' '}
                    <span className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-sm">
                      [entity, attribute, value]
                    </span>
                    . A user&apos;s name, a goal&apos;s title, a relation
                    between them. They&apos;re all expressed the same way. This
                    simple, uniform structure can model any entity and any
                    relationship. Because triples work the same on both the
                    frontend and backend, we can use the same data model
                    everywhere. This is the key insight that unlocks everything
                    else.
                  </p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950 p-4 font-mono text-xs sm:text-sm">
                  <div className="mb-3">{'// '}Every fact is a triple</div>
                  <table className="w-full">
                    <thead>
                      <tr className="text-left">
                        <th className="pr-4 pb-2 font-normal">entity</th>
                        <th className="pr-4 pb-2 font-normal">attribute</th>
                        <th className="pb-2 font-normal">value</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-300">
                      <tr>
                        <td className="py-1 pr-4 text-blue-300">user_1</td>
                        <td className="py-1 pr-4 text-emerald-300">
                          &quot;name&quot;
                        </td>
                        <td className="py-1 text-emerald-300">
                          &quot;Alice&quot;
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 text-blue-300">goal_1</td>
                        <td className="py-1 pr-4 text-emerald-300">
                          &quot;title&quot;
                        </td>
                        <td className="py-1 text-emerald-300">
                          &quot;Ship v2&quot;
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 text-blue-300">goal_1</td>
                        <td className="py-1 pr-4 text-emerald-300">
                          &quot;status&quot;
                        </td>
                        <td className="py-1 text-emerald-300">
                          &quot;active&quot;
                        </td>
                      </tr>
                      <tr className="border-t border-gray-800">
                        <td className="py-1 pt-2 pr-4 text-blue-300">goal_1</td>
                        <td className="py-1 pt-2 pr-4 text-orange-300">
                          &quot;owner&quot;
                        </td>
                        <td className="py-1 pt-2 text-blue-300">user_1</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="mt-3 text-[10px] sm:text-xs">
                    Attributes store facts. References store relations.
                  </div>
                </div>
              </div>

              {/* 2. InstaQL */}
              <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-12">
                <div>
                  <h3 className="text-xl font-semibold">
                    InstaQL: reading data
                  </h3>
                  <p className="mt-3 leading-relaxed text-gray-600">
                    To query this data, developers write InstaQL, a declarative
                    syntax using plain JavaScript objects and arrays. You
                    describe the shape of the data you want, and that&apos;s the
                    shape you get back. No joins, no SQL, no GraphQL resolvers.
                    The query language was designed so that the shape of the
                    query mirrors the shape of the result.
                  </p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950 p-4 font-mono text-xs sm:text-sm">
                  <div className="mb-2">{'// '}Query</div>
                  <div>
                    <span className="text-gray-400">{'{ '}</span>
                    <span className="text-blue-300">goals</span>
                    <span className="text-gray-400">: {'{ '}</span>
                    <span className="text-blue-300">owner</span>
                    <span className="text-gray-400">
                      : {'{}'} {'}'}
                    </span>
                    <span className="text-gray-400">{' }'}</span>
                  </div>
                  <div className="mt-4 border-t border-gray-800 pt-4">
                    <div className="mb-2">{'// '}Result</div>
                    <div className="text-gray-400">
                      {'{ '}
                      <span className="text-blue-300">goals</span>: [
                    </div>
                    <div className="pl-4 text-gray-400">
                      {'{ '}
                      <span className="text-blue-300">id</span>:{' '}
                      <span className="text-emerald-300">
                        &quot;goal_1&quot;
                      </span>
                      ,
                    </div>
                    <div className="pl-6 text-gray-400">
                      <span className="text-blue-300">title</span>:{' '}
                      <span className="text-emerald-300">
                        &quot;Ship v2&quot;
                      </span>
                      ,
                    </div>
                    <div className="pl-6 text-gray-400">
                      <span className="text-blue-300">owner</span>: {'{ '}
                      <span className="text-blue-300">name</span>:{' '}
                      <span className="text-emerald-300">
                        &quot;Alice&quot;
                      </span>
                      {' }'}
                    </div>
                    <div className="pl-4 text-gray-400">{'} ]'}</div>
                    <div className="text-gray-400">{'}'}</div>
                  </div>
                </div>
              </div>

              {/* 3. Datalog on the frontend */}
              <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-12">
                <div>
                  <h3 className="text-xl font-semibold">
                    Datalog on the frontend
                  </h3>
                  <p className="mt-3 leading-relaxed text-gray-600">
                    On the client, InstaQL queries compile to Datalog, a
                    logic-based query language that runs in a lightweight engine
                    right in the browser. This local datalog engine is what
                    makes optimistic updates possible. When you mutate data, the
                    change applies to the local triple store instantly. The
                    engine re-evaluates affected queries and your UI updates
                    before the server even responds.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                  <div className="flex flex-col gap-3">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-center">
                      <div className="text-sm font-medium">InstaQL</div>
                      <div className="text-[10px] text-gray-400">
                        your query
                      </div>
                    </div>
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
                    <div className="rounded-lg border-2 border-orange-200 bg-orange-50 px-4 py-2.5 text-center">
                      <div className="text-sm font-medium text-orange-600">
                        Datalog Engine
                      </div>
                      <div className="text-[10px]">runs in the browser</div>
                    </div>
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
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-center">
                      <div className="text-sm font-medium">
                        Local Triple Store
                      </div>
                      <div className="text-[10px] text-gray-400">
                        instant updates, no round-trip
                      </div>
                    </div>
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
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-center">
                      <div className="text-sm font-medium">UI</div>
                      <div className="text-[10px] text-gray-400">
                        re-renders reactively
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. SQL on the server */}
              <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-12">
                <div>
                  <h3 className="text-xl font-semibold">SQL on the server</h3>
                  <p className="mt-3 leading-relaxed text-gray-600">
                    On the server, the same InstaQL queries take a different
                    path. They&apos;re translated into SQL and executed against
                    Postgres Aurora. You get the performance and reliability of
                    a battle-tested database. One query language, two execution
                    paths: datalog locally for speed, SQL on the server for
                    truth.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                  <div className="flex flex-col gap-3">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-center">
                      <div className="text-sm font-medium">InstaQL</div>
                      <div className="text-[10px] text-gray-400">
                        same query as the frontend
                      </div>
                    </div>
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
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-center">
                      <div className="text-sm font-medium">SQL Translation</div>
                      <div className="text-[10px] text-gray-400">
                        InstaQL compiles to SQL
                      </div>
                    </div>
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
                    <div className="rounded-lg border-2 border-blue-200 bg-blue-50 px-4 py-2.5 text-center">
                      <div className="text-sm font-medium text-blue-600">
                        Postgres Aurora
                      </div>
                      <div className="text-[10px]">source of truth</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. InstaML */}
              <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-12">
                <div>
                  <h3 className="text-xl font-semibold">
                    InstaML: writing data
                  </h3>
                  <p className="mt-3 leading-relaxed text-gray-600">
                    For writes, developers use InstaML, a simple API for
                    creating, updating, deleting, and linking data. Write
                    operations optimistically modify the client-side triple
                    store for instant feedback, then send transactions to the
                    server as the source of truth. If the server rejects a
                    write, the local store rolls back automatically.
                  </p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950 p-4 font-mono text-xs sm:text-sm">
                  <div className="mb-2">
                    {'// '}Create, update, link in one transaction
                  </div>
                  <div>
                    <span className="text-yellow-300">transact</span>
                    <span className="text-gray-400">([</span>
                  </div>
                  <div className="pl-2">
                    <span className="text-orange-300">tx</span>
                    <span className="text-gray-400">.</span>
                    <span className="text-blue-300">goals</span>
                    <span className="text-gray-400">[</span>
                    <span className="text-blue-300">id</span>
                    <span className="text-gray-400">]</span>
                  </div>
                  <div className="pl-4">
                    <span className="text-gray-400">.</span>
                    <span className="text-yellow-300">update</span>
                    <span className="text-gray-400">({'{ '}</span>
                    <span className="text-blue-300">title</span>
                    <span className="text-gray-400">: </span>
                    <span className="text-emerald-300">
                      &quot;Ship v2&quot;
                    </span>
                    <span className="text-gray-400">{' }'})</span>
                  </div>
                  <div className="pl-4">
                    <span className="text-gray-400">.</span>
                    <span className="text-yellow-300">link</span>
                    <span className="text-gray-400">({'{ '}</span>
                    <span className="text-blue-300">owner</span>
                    <span className="text-gray-400">: </span>
                    <span className="text-blue-300">userId</span>
                    <span className="text-gray-400">{' }'})</span>
                  </div>
                  <div>
                    <span className="text-gray-400">])</span>
                  </div>
                  <div className="mt-4 border-t border-gray-800 pt-3 text-[10px] sm:text-xs">
                    Applies instantly on the client. Confirmed by the server.
                  </div>
                </div>
              </div>

              {/* 6. Permissions */}
              <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-12">
                <div>
                  <h3 className="text-xl font-semibold">
                    Permissions: access control
                  </h3>
                  <p className="mt-3 leading-relaxed text-gray-600">
                    Every read and every write passes through a permission layer
                    based on Google&apos;s Common Expression Language (CEL).
                    Permissions are expressive enough to handle complex rules
                    like role-based access, row-level filtering, and field-level
                    visibility, but readable enough that you can reason about
                    them at a glance.
                  </p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950 p-4 font-mono text-xs sm:text-sm">
                  <div className="mb-2">{'// '}instant.perms.ts</div>
                  <div>
                    <span className="text-gray-400">{'{ '}</span>
                    <span className="text-blue-300">goals</span>
                    <span className="text-gray-400">: {'{'}</span>
                  </div>
                  <div className="pl-4">
                    <span className="text-blue-300">allow</span>
                    <span className="text-gray-400">: {'{'}</span>
                  </div>
                  <div className="pl-8">
                    <span className="text-blue-300">view</span>
                    <span className="text-gray-400">: </span>
                    <span className="text-emerald-300">
                      &quot;auth.id in data.ref(&apos;owner.id&apos;)&quot;
                    </span>
                    <span className="text-gray-400">,</span>
                  </div>
                  <div className="pl-8">
                    <span className="text-blue-300">create</span>
                    <span className="text-gray-400">: </span>
                    <span className="text-emerald-300">
                      &quot;isOwner&quot;
                    </span>
                    <span className="text-gray-400">,</span>
                  </div>
                  <div className="pl-8">
                    <span className="text-blue-300">update</span>
                    <span className="text-gray-400">: </span>
                    <span className="text-emerald-300">
                      &quot;isOwner&quot;
                    </span>
                    <span className="text-gray-400">,</span>
                  </div>
                  <div className="pl-8">
                    <span className="text-blue-300">delete</span>
                    <span className="text-gray-400">: </span>
                    <span className="text-emerald-300">
                      &quot;isOwner&quot;
                    </span>
                  </div>
                  <div className="pl-4">
                    <span className="text-gray-400">{'}'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">{'}  }'}</span>
                  </div>
                  <div className="mt-4 border-t border-gray-800 pt-3 text-[10px] sm:text-xs">
                    Every query and transaction is validated against these
                    rules.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 sm:py-24">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Come build with us
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg">
              We&apos;re always looking for exceptional hackers who want to work
              on hard problems at the intersection of databases, sync, and AI.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href="https://instantdb.com/dash"
                className="inline-flex items-center justify-center rounded-lg bg-orange-600 px-6 py-3 text-base font-medium text-white shadow-[0_0_20px_rgba(234,88,12,0.3)] transition-all hover:bg-orange-700 hover:shadow-[0_0_30px_rgba(234,88,12,0.45)]"
              >
                Get started
              </a>
              <a
                href="mailto:founders@instantdb.com"
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-6 py-3 text-base font-medium transition-all hover:bg-gray-50"
              >
                Get in touch
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
