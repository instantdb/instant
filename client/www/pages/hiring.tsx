import Head from 'next/head';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
} from '@/components/marketingUi';
import MuxPlayer from '@mux/mux-player-react';
import { walkthrough } from '@/lib/muxVideos';

function HiringContent() {
  return (
    <div
      className="prose prose-h1:mt-8 prose-h1:mb-4 prose-h2:mt-4 prose-h2:mb-2 prose-pre:bg-gray-100">
      <h1 id="instantdb-founding-engineer">InstantDB Founding Engineer</h1>
      <p>Hey there! <a href="https://www.instantdb.com/">InstantDB (YC S22)</a>
        {' '}is looking to hire our founding engineering team! We think we’re a
        rocket-ship that’s going to power applications of the future 🚀</p>
      <p>We’ve put together a page explaining what is Instant, who we are,
        who we’re looking for, and what we can accomplish together 💪</p>
      <p>By the end of this page we hope you’re motivated to apply or send
        over this page to your favorite hackers 🧑‍💻</p>
      <h2 id="what-is-instant-">What is Instant?</h2>
      <p>In two sentences: We’re building the next Firebase. We want to make it
        easy for developers to build best-in-class applications like Figma,
        Notion, and Linear.</p>
      <p>What does that actually mean?</p>
      <p>Imagine you’re a hacker who loves building apps. You’ve read all the PG
        essays, came up with an exciting idea, and are ready to <strong>make
          something people want.</strong> You want to build an MVP fast, that
        doesn’t completely suck. So how do you do it?</p>
      <p>Most of the time we make three-tier architecture with client, server,
        and database. On the server side we write endpoints to glue our frontend
        with our database. We might use an ORM to make it easier to work with
        our db, and add a cache to serve requests faster. On the client we need
        to reify json from the server and paint a screen. We add stores to
        manage state, and write mutations to handle updates. This is just for
        basic functionality.</p>
      <p>If we want our UI’s to feel fast, we write optimistic updates so we
        don’t need to wait for the server. If we want live updates without
        refreshing we either poll or add websockets. And if we want to support
        offline mode, we need to integrate IndexedDB and pending transaction
        queues. </p>
      <p>That’s a lot of work!</p>
      <p>To make things worse, whenever we add a new feature, we go through the
        same song and dance over and over again: add models to our DB, write
        endpoints on our server, create stores in our frontend, write mutations,
        optimistic updates, etc.</p>
      <p>Could it be better? We think so!</p>
      <p><img
        src="https://camo.githubusercontent.com/b537dcbe3a35bd6a079205031660ac85bb966a6a48265e6d3c4a603e3c5584f9/68747470733a2f2f696e7374616e7464622e636f6d2f726561646d65732f636f6d7072657373696f6e2e737667"
        alt="Instant compresses the schleps!" /></p>
      <p>If you had a database on the client, you wouldn’t need to manage
        stores, selectors, endpoints, caches, etc. You could just write queries
        to fetch the data you want. If these queries were reactive, you wouldn’t
        have to write extra logic to re-fetch whenever new data appears.
        Similarly you could just make transactions to apply mutations. These
        transactions could apply changes optimistically and be persisted
        locally. Putting this all together, you can build delightful
        applications without the normal schleps.</p>
      <p>So we built Instant. Instant gives you a database you can use in the
        client, so you can focus on what’s important: <strong>building a great
          UX for your users, and doing it quickly</strong>.</p>
      <p>To see Instant in action, check out this video below:</p>
      <MuxPlayer {...walkthrough} />

      <p>To learn more about our architecture, check out our essay <a
        href="https://www.instantdb.com/essays/next_firebase">A Graph-Based
        Firebase</a></p>
      <h2 id="who-is-instant-">Who is Instant?</h2>
      <p>We’re <a href="https://linkedin.com/in/joeaverbukh">Joe</a> and <a
        href="https://x.com/stopachka">Stopa</a>, engineers, best friends, and
        co-founders. We first met in San Francisco in 2014 and worked together
        as senior and staff engineers at Facebook and Airbnb.</p>
      <p><img
        src="https://paper-attachments.dropboxusercontent.com/s_B8A06116D3803694CDA0C13F9F97E92EA0220D4E377317F0F00D7831E3E41E9E_1727878507415_joe_stopa.png"
        alt="" /></p>
      <p>When we worked at Facebook, most designers used Sketch. At that time no
        one thought there could be something better. Figma came out and changed
        the game. Similarly, in the 2010s, Evernote was one of the best note
        taking apps. In 2024 most people use Notion instead.</p>
      <p>In 2022 we went through YCombinator to build Instant and raised from
        top investors like Paul Graham, Greg Brockman, and James Tamplin, the
        original CEO of Firebase.</p>
      <p>After being heads down for 2 years, we <a
        href="https://github.com/instantdb/instant">open-sourced</a> and had a
        <a href="https://news.ycombinator.com/item?id=41322281">massive
          reception on Hacker News</a>. We are one of the top Show HN launches
        of all time.</p>
      <h2 id="who-are-we-looking-for-">Who are we looking for?</h2>
      <p>First and foremost, we want to work with people who we will be friends
        with for a life time. We love high-integrity, optimistic, and
        principle-oriented people. Taking inspiration from Facebook, Airbnb, and
        YCombinator we deeply resonate with these three core values</p>
      <ul>
        <li>Move fast</li>
        <li>Be a host</li>
        <li>Make something people want</li>
      </ul>
      <p>This is the hacker mentality we strive for — building quickly, being
        kind to each other, and honing in on delivering value.</p>
      <p>On the technical-side, here are two example projects we plan to take on
        soon and would love help on.</p>
      <p><strong>Load testing strategy for our sync engine.</strong> We want to
        build a suite to 1) stress test different scenarios and 2) establish
        metrics to track perf and have visibility on improvements/degradation.
        Even something akin to the <a href="https://www.figma.com/blog/keeping-figma-fast/">one-laptop solution</a>
        {' '}Figma had up to 2020 would be a big win for us for situations like:</p>
      <ul>
        <li>Many clients connect and subscribe to large amounts of data
          (thundering herd)</li>
        <li>Local experience for client making writes when there is a lot of
          subscribed data</li>
        <li>Local experience for clients when another client for the same app is
          blasting transactions (e.g. streaming updates for a stock app)</li>
        <li>Local experience for clients when another client for different app
          is blasting transactions (noisy neighbor)</li>
        <li>Local/Server experience when many clients from many apps make many
          transactions</li>
      </ul>
      <p>… and many more</p>
      <p><strong>Rebuild our client-side reactive-layer.</strong> It’s currently
        a state machine that is hard to introspect and follow simple chains of
        changes like “what happens when a transaction is made?” or answer “what
        is the size of the pending transaction queue?” We want to re-build this
        in a way that makes it easy to 1) test chains of changes and 2) have dev
        tooling for introspecting client-side state.</p>
      <p>There’s a lot of opportunity to contribute to Instant’s architecture.
        If either of these sound like something you’d enjoy working on we’d love
        to talk!</p>
      <h2 id="additional-stats">Additional Stats</h2>
      <ul>
        <li>Location: We’re based in San Francisco, CA!</li>
        <li>In-person only: Not open to remote at this time — we want to hack together!</li>
        <li>Compensation: Sliding scale between 0.5%-2.5% equity and 150k - 210k
          base + medical/dental/vision benefits</li>
        <li>Tech Stack: Typescript + React on the frontend, Clojure on the
          backend, Aurora Postgres</li>
      </ul>
      <h2 id="want-to-apply">Want to apply?</h2>
      <p>Woohoo! Please send us an email at founders@instantdb.com and include a side-project you've worked on (if it comes with a GitHub, that's a huge plus!)</p>
    </div>
  );
}

export default function Page() {
  return (
    <LandingContainer>
      <Head>
        <title>Hiring</title>
        <meta name="description" content="A Graph Database on the Client" />
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

