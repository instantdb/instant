import Head from 'next/head';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
} from '@/components/marketingUi';
import { Button } from '@/components/ui';
import * as og from '@/lib/og';

function HiringContent() {
  return (
    <div className="prose prose-h1:mt-8 prose-h1:mb-4 prose-h2:mt-4 prose-h2:mb-2 prose-pre:bg-gray-100">
      <h1 id="instantdb-founding-backend-engineer">
        InstantDB: Founding Backend Engineer
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
        We're looking for a founding backend engineer to join our team in San
        Francisco. We're looking for someone who:
      </p>
      <ol>
        <li>
          Enjoys working on hard problems (we're building a database company!)
        </li>
        <li>Wants large scope and plenty of agency</li>
        <li>Has experience working in Clojure or JVM-based languages</li>
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
          We offer client SDKs, a CLI tool, and web GUI to interact with
          Instant. All written in Typescript
        </li>
        <li>
          We have a server written in Clojure for managing websocket
          connections, parsing queries, running permissions, and broadcasting
          novelty.
        </li>
        <li>All of which sits on top AWS Aurora Postgres</li>
      </ul>
      <p>
        Here are the kinds of problems on the back-end we want to solve next:
      </p>
      <p>
        We're regularly handling {`>10k`} connections but will need to improve
        our infra across our query, transactions, permissions, and reactive
        layers to handle 100k connections and more.
      </p>
      <p>
        Upgrade our permissions system. Right now Instant's permission system is
        based on Google CEL, similar to Firebase. This has worked for now but we
        think we can do better.{' '}
        <a href="https://www.figma.com/blog/how-we-rolled-out-our-own-permissions-dsl-at-figma/">
          Figma
        </a>{' '}
        created their own DSL for writing permissions and we're thinking of
        doing something similar.
      </p>
      <p>
        Enable BYOP (Bring your own Postgres). Today users can only use Instant
        via our hosted or self-hosted solution. Our vision though is that folks
        could bring their existing database and plug it into Instant's sync
        engine. This would enable existing companies to readily adopt Instant.
      </p>
      <p>
        These are all bigger projects, but there are a lot of quicker wins we
        can deliver too, like giving observability to our developers so they can
        identify and tune problematic queries.
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
  const title = 'Founding Backend Engineer | InstantDB';

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
