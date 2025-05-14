import Head from 'next/head';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
} from '@/components/marketingUi';
import { Button, Fence } from '@/components/ui';
import * as og from '@/lib/og';

const queryExample = `{
  profiles: {
    $: {
      where: { "bookshelves.books.title": "Count of Monte Cristo" }
    }
  }
}`;

const schemaExample = `const schema: InstantSchemaDef<EntitiesWithLinks<{
    profiles: EntityDef<{
      name: DataAttrDef<string, true>;
    }, {}, void>;
    bookshelves: EntityDef<{
      title: DataAttrDef<string, true>;
    }, {}, void>;
  }, {
    ...;
}>, LinksDef <...>, RoomsDef > `;

function HiringContent() {
  return (
    <div className="prose prose-h1:mt-8 prose-h1:mb-4 prose-h2:mt-4 prose-h2:mb-2">
      <h1 id="instantdb-founding-typescript-engineer">
        InstantDB: Founding Typescript Engineer
      </h1>
      <p>
        <em>
          Instant is a real-time database you can use on the frontend. We give
          you the best of both Firebase and Supabase, a sync-engine with support
          for relations. This is the kind of tech that companies like Figma,
          Notion, and Linear build internally to power their products (
          <a href="https://www.instantdb.com/tutorial">Try out the demo</a>)
        </em>
      </p>
      <p>
        We're looking for a founding Typescript engineer to join our team in San
        Francisco. We're looking for someone who:
      </p>
      <ol>
        <li>
          Are obsessive about type ergonomics (Even with how types show up in
          intellisense)
        </li>
        <li>
          Wants to build front-end tech (read: a sync engine!) to enable devs to
          build delightful applications
        </li>
        <li>Enjoys crafting UIs that people use for hours</li>
      </ol>

      <h2 id="about-us">About us</h2>
      <p>
        We're looking to build the next Firebase. We want to make it easier for
        developers to build delightful applications.
      </p>
      <p>
        We were part of the summer 2022 batch in YC and raised a{' '}
        <a href="https://techcrunch.com/2024/10/02/instant-harkens-back-to-a-pre-google-firebase/">
          $3.4M seed round
        </a>{' '}
        from a slew of great angels like former Firebase CEO James Tamplin, Paul
        Graham, Greg Brockman, and Jeff Dean
      </p>
      <p>
        Internally we have a hacker mentality — we build quickly, we are kind to
        each other, and relentlessly focused on making our users happy. We also
        love sharing our ideas with the broader community, with a slew of our
        essays making the top of HN{' '}
        <a href="https://www.instantdb.com/essays/next_firebase">[1]</a>{' '}
        <a href="https://www.instantdb.com/essays/pg_upgrade">[2]</a>{' '}
        <a href="https://www.instantdb.com/essays/sync_future">[3]</a>
      </p>
      <p>
        If you like videos, you can watch Stopa, our CTO, talk about{' '}
        <a href="https://youtu.be/6FikTQf8qho?feature=shared&t=15">
          Instant at Clojure Conj
        </a>
      </p>

      <h2 id="about-the-role">About the role</h2>
      <p>Our current stack looks like so:</p>
      <ul>
        <li>
          We offer client SDKs, a CLI tool, and web GUI to interact w/ Instant.
          All written in Typescript
        </li>
        <li>
          We have a server written in Clojure for managing websocket
          connections, parsing queries, running permissions, and broadcasting
          novelty.
        </li>
        <li>All of which sits on top AWS Aurora Postgres</li>
      </ul>
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
        <a href="https://www.instantdb.com/docs/instaql#typesafety">typed</a>.
        It took some serious{' '}
        <a href="https://github.com/instantdb/instant/blob/main/client/packages/core/src/queryTypes.ts#L201-L238">
          type fu
        </a>
        , but the upshot is the users get autocomplete and typesafety as a
        result. And right now types are a first cut. Here's some of what's
        ahead:
      </p>
      <p>
        <strong>Type where clauses</strong>
        <br />
        Imagine you are building a goodreads alternative. You want to write a
        query like: "Give me all the profiles that have{' '}
        <em>Count of Monte Cristo</em> in their bookshelves". This is how it
        would look in Instant:
      </p>
      <Fence code={queryExample} language="json" />
      <p>
        And with it you'd get those profiles. But{' '}
        <code>bookshelves.books.title</code> is typed too broadly: any string is
        allowed. That's kind of sad; users could have typos, or forget which
        relationships exist on <code>profiles.</code>
      </p>
      <p>
        Well, we already have access to the schema. We <em>could</em> type the
        where clause. This way, when a user starts writing "booksh", we could
        autocomplete with all the relationships that live on{' '}
        <code>profiles</code>!
      </p>
      <p>
        This is tricky (there's <em>lot</em>{' '}
        <a href="https://www.instantdb.com/docs/instaql">you can do</a> in a
        query), but it would be a huge benefit to users.
      </p>
      <p>
        <strong>Improve intellisense</strong>
        <br />
        Or speaking of{' '}
        <a href="https://www.instantdb.com/docs/modeling-data#schema-as-code">
          schemas
        </a>
        . Users can define schemas, and we'll use it to generate types for them.
        When you hover over a schema, this is what you'll see:
      </p>
      <Fence code={schemaExample} language="typescript" />
      <p>
        Now, typescript generics can look notoriously daunting in intellisense.
        Some of the complexity is unavoidable, but there's a <em>lot</em> that
        can be done to improve it. For example, is it really necessary that the
        hover includes <code>EntitiesWithLinks</code>, <code>EntityDef</code>,{' '}
        <code>DataAttrDef</code>?
      </p>
      <p>
        Some may think it's not worth fretting over intellisense output. But you
        know this differentiates the best libraries. Great types reap great
        benefits.
      </p>
      <p>
        <strong>Performance, utility types…</strong>
        <br />
        And the list goes on. We want to add more tests for type outputs (one
        project we're considering is to write a library that tests{' '}
        <em>intellisense</em> output). We want to write benchmarks to see how
        types perform in larger codebases. We want to improve how you define
        schemas and how you write transactions. We want to add more utility
        types, so users can build their own libraries on top of Instant.
      </p>
      <p>
        Aside from improving the type experience, there is a lot of opportunity
        for improving the current surface area of Instant.
      </p>
      <p>
        <strong>Better CLI</strong>
        <br />
        Right now, you can push your schema with the{' '}
        <a href="https://www.instantdb.com/docs/cli">CLI</a>, but we don't
        support any destructive actions. You can add a column, but you can't
        delete it (You can do this manually). We held off on destructive actions
        in the CLI, because we wanted to make the right kind of UX: something
        that feels natural, but doesn't let you shoot yourself in the foot. Can
        you help design it and implement it? Maybe it's time we add migrations,
        or take inspiration from terraform.
      </p>
      <p>
        <strong>Permission REPL</strong>
        <br />
        We currently have a GUI{' '}
        <a href="https://www.instantdb.com/dash?s=main&t=sandbox">
          sandbox
        </a>{' '}
        that lets you run queries and transactions. This can be very useful for
        debugging but there's a lot missing here. One of the biggest pain points
        users have is crafting and testing permissions. It would be great if we
        had a better experience for rapidly testing permission rules against
        data.
      </p>
      <p>Sound interesting? If so here's a few more details :)</p>
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
      <h2 id="apply">Apply</h2>
      <p>
        Our vision is to be the infrastructure for all apps of the future. If
        this jives with you we should really talk 🙂. Send us an email:{' '}
        <a href="mailto:founders@instantdb.com">founders@instantdb.com</a> with
        a bit about yourself, and a project you've worked on.
      </p>
    </div>
  );
}

export default function Page() {
  const title = 'Founding Typescript Engineer | InstantDB';

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
      <MainNav />
      <div className="mx-auto mt-6 p-4 md:max-w-2xl">
        <HiringContent />
        <div className="flex justify-center mt-8 mb-4">
          <Button type="link" href="/hiring" variant="secondary">
            Back to All Positions
          </Button>
        </div>
      </div>
      <LandingFooter />
    </LandingContainer>
  );
}
