import Head from 'next/head';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
} from '@/components/marketingUi';
import { Button } from '@/components/ui';
import clsx from 'clsx';
import * as og from '@/lib/og';

function HiringContent() {
  return (
    <div className="prose prose-h1:mt-8 prose-h1:mb-4 prose-h2:mt-4 prose-h2:mb-2 prose-pre:bg-gray-100">
      <h1 id="instantdb-founding-full-stack-engineer">
        InstantDB: Founding Full-Stack Engineer
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
        We're looking for a founding full-stack engineer to join our team in San
        Francisco. We're looking for someone who:
      </p>
      <ol>
        <li>
          Wants to build front-end tech (read: a sync engine!) to enable devs to
          build delightful applications
        </li>
        <li>Enjoys crafting UIs that people use for hours</li>
        <li>
          Has an interest in learning or working in Clojure (we're happy to
          induct you into the cult!)
        </li>
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
        Inside the SDK there's a client-side database which can run queries just
        the like the server does. The client-side DB is what makes it possible
        for Instant to work offline, and to get optimistic updates out of the
        box. And it's full of problems that make computer science textbooks come
        alive. Here are some opportunities for improvements we'd love your help
        on.
      </p>
      <p>
        <strong>Better joins:</strong> the client runs a{' '}
        <a href="https://github.com/instantdb/instant/blob/main/client/packages/core/src/datalog.js">
          nested loop
        </a>{' '}
        to implement joins. But as we increase how much we cache, nested loops
        could become a problem. Perhaps it's time to add hash joins!
      </p>
      <p>
        <strong>Better indexes:</strong> we use a{' '}
        <a href="https://github.com/instantdb/instant/blob/main/client/packages/core/src/store.js#L50-L70">
          map of maps
        </a>{' '}
        for our indexes. This works, but comparison queries will be less
        efficient then they have to be. Perhaps it's time to consider writing an
        OrderedSet
      </p>
      <p>
        <strong>Better introspection:</strong> we built a{' '}
        <a href="https://github.com/instantdb/instant/blob/main/client/packages/core/src/Reactor.js">
          state machine
        </a>{' '}
        to manage how different events interact: websocket updates, connection
        changes, client / server changes. But it's quite hairy and hard to
        reason about. Can we make it easier to observe events and replay them?
        Perhaps we could look into the actor model or structured concurrency for
        inspiration.
      </p>
      <p>
        <strong>Better local storage:</strong> we treat IndexedDB as a key
        values store and serialize large chunks of state. Can we serialize in
        smaller chunks instead?
      </p>
      <p>
        <strong>Less re-renders:</strong> Right now queries can change more than
        is needed. We want every update to be finer-grained, so users have less
        re-renders.
      </p>
      <p>
        There's also new surfaces to be built. Right now we have a GUI{' '}
        <a href="https://www.instantdb.com/dash?s=main&t=sandbox">sandbox</a>{' '}
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
  const title = 'Founding Full-Stack Engineer | InstantDB';

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
