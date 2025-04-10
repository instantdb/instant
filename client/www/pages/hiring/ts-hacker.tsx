import Head from 'next/head';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
} from '@/components/marketingUi';
import { Fence } from '@/components/ui';
import clsx from 'clsx';
import * as og from '@/lib/og';

function NumberedHeading(props: {
  id: string;
  number: number;
  children: React.ReactNode;
}) {
  return (
    <h2 id={props.id}>
      {props.number}. {props.children}
    </h2>
  );
}

function HiringContent() {
  return (
    <div
      className={clsx(
        'prose max-w-none',
        // headings
        'prose-headings:scroll-mt-28 prose-headings:font-normal lg:prose-headings:scroll-mt-[8.5rem]',
        'prose-h1:mt-8 prose-h1:mb-4 prose-h2:mt-4 prose-h2:mb-4 prose-h3:mt-4 prose-h3:mb-4',
        // lead
        'prose-lead:text-slate-500 dark:prose-lead:text-slate-400',
        // links
        'prose-a:font-normal prose-a:text-blue-500 dark:prose-a:text-sky-400',
        // hr
        'dark:prose-hr:border-slate-800 prose-hr:mt-4 prose-hr:mb-4',
        // code
        'before:prose-code:content-none after:prose-code:content-none prose-code:bg-white prose-code:bg-opacity-50 prose-code:p-0.5',
      )}
    >
      <h1 id="founding-typescript-engineer" className="font-mono font-bold">
        Founding Typescript Engineer
      </h1>
      <div className="font-medium italic">
        <p>
          Instant is a real-time database you can use on the frontend. We give
          you the best of both Firebase and Supabase, a sync-engine with support
          for relations. This is the kind of tech that companies like Figma,
          Notion, and Linear build internally to power their products (
          <a
            href="https://www.instantdb.com/tutorial"
            className="font-medium italic"
          >
            Try out the demo
          </a>
          )
        </p>
      </div>
      <p>
        We're looking for a founding Typescript Engineer to join our team of 4
        in San Francisco. If you:
      </p>
      <ol>
        <li>
          Are obsessive about type ergonomics (even with how types show up in
          intellisense)
        </li>
        <li>Enjoy crafting UIs that people use for hours</li>
        <li>Want to build a sync engine to enable the next Figma or Notion</li>
      </ol>
      <p>
        Then we want to talk to you! So, why those three points? Let us explain:
      </p>
      <NumberedHeading id="type-ergo" number={1}>
        You are obsessive about type ergonomics
      </NumberedHeading>
      <p>
        One of the benefits about using typescript in a library is the developer
        experience you can offer your users. Types can do so much more than just
        catch typos. Types are a tool. They give you autocomplete and good
        feedback; shown in the right moment they can make someone's day. We
        don't just want to build a great database. We want people to enjoy using
        it.
      </p>
      <p>
        Instant is{' '}
        <a
          href="https://www.instantdb.com/docs/instaql#typesafety"
          target="_blank"
        >
          typed
        </a>
        . It took some serious{' '}
        <a
          href="https://github.com/instantdb/instant/blob/main/client/packages/core/src/queryTypes.ts#L201-L238"
          target="_blank"
        >
          type fu
        </a>
        , but the upshot is the users get autocomplete and typesafety as a
        result. And right now types are a first cut. Here's some of what's
        ahead:
      </p>
      <div className="pl-4">
        <h3 id="where-clauses">Type where clauses</h3>
        <p>
          Imagine you are building a goodreads alternative. You want to write a
          query like:{' '}
          <em>
            Give me profiles that have "Count of Monte Cristo" in their
            bookshelves
          </em>
          . This is how it would look in Instant:
        </p>
        <Fence
          code={`
{
  profiles: {
    $: { where: { "bookshelves.books.title": "Count of Monte Cristo" } },
  }
};
        `.trim()}
          language="javascript"
        ></Fence>
        <p>
          And with it you'd get those profiles. But{' '}
          <code>bookshelves.books.title</code> is typed too broadly: any string
          is allowed. This means users could have typos, or forget which
          relationships exist on <code>profiles</code>.
        </p>
        <p>
          Well, we already have access to the schema. We <em>could</em> type the
          where clause. This way, when a user starts writing "booksh", we could
          autocomplete with all the relationships that live on{' '}
          <code>profiles</code>!
        </p>
        <p>
          This is tricky (there's{' '}
          <a href="https://www.instantdb.com/docs/instaql" target="_blank">
            a lot
          </a>{' '}
          you can do in a query), but it would be a huge benefit to users.
        </p>
        <h3 id="intellisense">Improve intellisense</h3>
        <p>
          Or speaking of{' '}
          <a
            href="https://www.instantdb.com/docs/modeling-data#schema-as-code"
            target="_blank"
          >
            schemas
          </a>
          : this is what you'll see in Typescript when you hover over one:
        </p>
        <Fence
          language="typescript"
          code={`
const schema: InstantSchemaDef<EntitiesWithLinks<{
  profiles: EntityDef<{
    name: DataAttrDef<string, true>;
  }, {}, void>;
  bookshelves: EntityDef<{
    title: DataAttrDef<string, true>;
  }, {}, void>;
}, {
  ...;
}>, LinksDef<...>, RoomsDef>
          `.trim()}
        />
        <p>
          Now, complex types can look notoriously daunting in intellisense. Some
          of the complexity is unavoidable, but there's a <em>lot</em> that can
          be done to improve it. For example, is it really necessary that the
          hover includes <code>EntitiesWithLinks</code>, <code>EntityDef</code>,{' '}
          <code>DataAttrDef</code>?
        </p>
        <p>
          Some may think it's not worth fretting over intellisense output. But
          you know this differentiates the best libraries. Great types reap
          great benefits.
        </p>
        <h3 id="1-more">Performance, utility types...</h3>
        <p>
          And the list goes on. We want to add more tests for type outputs (one
          project we're considering is to write a library that tests{' '}
          <em>intellisense</em> output). We want to write benchmarks to see how
          types perform in larger codebases. We want to improve how you define
          schemas and how you write transactions. We want to add more utility
          types, so users can build their own libraries on top of Instant.
        </p>
      </div>
      <NumberedHeading id="crafting-uis" number={2}>
        You enjoy crafting UIs that people use for hours
      </NumberedHeading>
      <p>
        Today Instant ships with a{' '}
        <a href="https://www.instantdb.com/docs/cli" target="_blank">
          CLI tool
        </a>{' '}
        and a{' '}
        <a href="https://instantdb.com/dash" target="_blank">
          Dashboard
        </a>
        .
      </p>
      <p>
        Since Instant is a core part of our user's infra, they end up spending
        hours every day interacting with it. The onus is on us to make their
        experience as delightful as possible. UIs make a real difference here.
        People may not consciously notice it, but every detail adds up. There's
        a lot of work to do:
      </p>
      <div className="pl-4">
        <h3 id="cli-migrations">Migrations in the CLI</h3>
        <p>
          Right now, you can push your schema with the{' '}
          <a href="https://www.instantdb.com/docs/cli" target="_blank">
            CLI
          </a>
          , but we don't support any destructive actions. You can add a column,
          but you can't delete it (You can do this manually). We held off on
          destructive actions in the CLI, because we wanted to make the right
          kind of UX: something that feels natural, but doesn't let you shoot
          yourself in the foot. Can you help design it and implement it? Maybe
          it's time we add migrations, or take inspiration from terraform.
        </p>
        <h3 id="better-sandbox">Better Sandbox</h3>
        <p>
          In the dashboard, we have a{' '}
          <a
            href="https://www.instantdb.com/dash?s=main&t=sandbox"
            target="_blank"
          >
            sandbox
          </a>{' '}
          that lets you run queries and transactions:
        </p>
        <p>
          <img src="/img/hiring/sandbox.png" alt="Sandbox" />
        </p>
        <p>
          You can dry-run transactions, make queries, and see how your
          permissions work. Users live in this tool for hours. But there's a lot
          missing here. For example, could you save snippets, or have a history
          of the changes you've made to your sandbox?
        </p>
        <h3 id="explorer">Better Explorer</h3>
        <p>
          Or take a look at the{' '}
          <a
            href="https://www.instantdb.com/dash?s=main&t=explorer"
            target="_blank"
          >
            Explorer
          </a>
          . It lets you visually query and change data. This often replaces
          custom code users would have needed to write for an admin panel. You
          can already make queries, create rows, link objects, and upload files:
        </p>
        <p>
          <img src="/img/hiring/explorer.png" alt="Sandbox" />
        </p>
        <p>
          But this is just the beginning. What else do users use an admin panel
          for, and how can we just give it to them? We want to make an editing
          experience on level of Airtable, available to every dev before they
          even start building their app.
        </p>
        <h3 id="2-more">Rules, Examples...</h3>
        <p>
          And there's so much more. We want to improve our{' '}
          <a href="https://www.instantdb.com/docs/permissions" target="_blank">
            permissions
          </a>{' '}
          language, and make it easier to introspect. Our{' '}
          <a href="https://www.instantdb.com/examples" target="_blank">
            examples
          </a>{' '}
          page shows a few ways you can use Instant, but what if instead it had
          hundreds of examples and was searchable? The list goes on!
        </p>
      </div>
      <NumberedHeading id="sync-engine" number={3}>
        Want to build a sync engine to enable the next Figma or Notion
      </NumberedHeading>
      <p>Instant's client SDK implements a sync engine:</p>
      <p>
        <img src="/img/hiring/sync_engine.png" alt="Sync Engine" />
      </p>
      <p>
        Inside the SDK there's a client-side database which can run queries just
        the like the server does. The client-side DB is what makes it possible
        for Instant to work offline, and to get optimistic updates out of the
        box. And it's full of problems that make computer science textbooks come
        alive:
      </p>
      <ul>
        <li>
          <strong>Better joins:</strong> the client runs a{' '}
          <a
            href="https://github.com/instantdb/instant/blob/main/client/packages/core/src/datalog.js"
            target="_blank"
          >
            nested loop
          </a>{' '}
          to implement joins. But as we increase how much we cache, nested loops
          could become a problem. Perhaps it's time to add hash joins!
        </li>
        <li>
          <strong>Better indexes:</strong> we use a{' '}
          <a
            href="https://github.com/instantdb/instant/blob/main/client/packages/core/src/store.js#L50-L70"
            target="_blank"
          >
            map of maps
          </a>{' '}
          for our indexes. This works, but comparison queries will be less
          efficient then they have to be. Perhaps it's time to consider writing
          an OrderedSet
        </li>
        <li>
          <strong>Better introspection:</strong> we built a{' '}
          <a
            href="https://github.com/instantdb/instant/blob/main/client/packages/core/src/Reactor.js"
            target="_blank"
          >
            state machine
          </a>{' '}
          to manage how different events interact: websocket updates, connection
          changes, client / server changes. But it's quite hairy and hard to
          reason about. Can we make it easier to observe events and replay them?
          Perhaps we could look into the actor model or structured concurrency
          for inspiration.
        </li>
        <li>
          <strong>Better local storage:</strong> we treat IndexedDB as a key
          values store and serialize large chunks of state. Can we serialize in
          smaller chunks instead?
        </li>
        <li>
          <strong>Less re-renders:</strong> Right now queries can change more
          than is needed. We want every update to be finer-grained, so users
          have less re-renders.
        </li>
      </ul>
      <p>
        If we do this right, we have the chance to build an abstraction that is
        both <em>easy</em> — you could build any app quickly with it — but also
        scales to the complexity of apps like Figma or Notion.
      </p>
      <h2 id="backend">Aside: the Backend</h2>
      <p>
        <img src="/img/hiring/backend.png" alt="Backend" />
      </p>
      <p>
        The client SDK talks to a backend written in Clojure and Postgres.
        Sometimes, you may end up in Clojure. We don't expect you to be a
        Clojure expert, but if you are excited about hacking on the language
        too, we'd be thrilled to onboard you.
      </p>
      <h2 id="about-us">About us</h2>
      <p>
        You may be thinking to yourself...that's a lot of responsibilities. From
        typescript types, to client side databases, to UIs.
      </p>
      <p>
        We hope that excites you in the same way it does us: lots of hard
        problems are one of the reasons we love working on Instant.
      </p>
      <p>
        We're a team of 4. Three of us are in San Francisco (
        <a target="_blank" href="https://x.com/DanielWoelfel">
          Daniel
        </a>
        ,{' '}
        <a target="_blank" href="https://www.joeaverbukh.com/">
          Joe
        </a>
        ,{' '}
        <a target="_blank" href="https://stopa.io/">
          Stopa
        </a>
        ), and one of us are in Berlin (
        <a target="_blank" href="https://tonsky.me/">
          Niki
        </a>
        ). Joe &amp; Stopa (the founders) have known each other for over 10
        years, and worked across Facebook and Airbnb together. Daniel (first
        engineer) and Stopa worked together at Wit.ai and Facebook, and have
        been friends for 10 years. Niki shipped{' '}
        <a target="_blank" href="https://github.com/tonsky/datascript">
          datascript
        </a>
        , and wrote one of the first{' '}
        <a
          target="_blank"
          href="https://tonsky.me/blog/the-web-after-tomorrow/"
        >
          essays
        </a>{' '}
        about the kinds of web applications Instant wants to empower.
      </p>
      <p>
        We love working together. We aim to work with people who we will be
        friends with for a lifetime. We love high-integrity, optimistic, and
        principle-oriented hackers who love what they do. Internally we have a
        hacker mentality — we build quickly, we are kind to each other, and
        relentlessly focused on making our users happy.
      </p>
      <h2 id="additional-stats">Additional Stats</h2>

      <ul>
        <li>Location: We're based in San Francisco, CA!</li>
        <li>
          In-person or open to relocation only: We're a small team and we really
          do prefer all working together in person!
        </li>
        <li>
          Compensation: Sliding scale between 0.5%-2% equity and 150k - 200k
          base + medical/dental/vision benefits
        </li>
      </ul>

      <h2 id="Apply">Apply</h2>
      <p>
        If you've read this far and are excited, we should really talk 🙂. Send
        us an email:{' '}
        <a href="mailto:founders@instantdb.com">founders@instantdb.com</a> with
        a bit about yourself, and a project you've worked on. If you've built a
        Typescript library, that's a big plus, but not required.
      </p>
    </div>
  );
}

export default function Page() {
  const title = 'Founding Typescript Engineer';
  return (
    <LandingContainer>
      <Head>
        <title>{title}</title>
        <meta
          key="og:image"
          property="og:image"
          content={og.url({ title, section: 'hiring' })}
        />
      </Head>
      <div className="flex min-h-screen flex-col justify-between">
        <MainNav />
        <div className="mx-auto mt-6 p-4 md:max-w-2xl">
          <HiringContent />
        </div>
        <LandingFooter />
      </div>
    </LandingContainer>
  );
}
