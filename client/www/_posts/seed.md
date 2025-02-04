---
title: 'Instant raises $3.4M seed to build a modern Firebase'
date: '2024-10-01'
authors: nezaj
---

![Instant raises $3.4M seed to build a modern
Firebase](https://paper-attachments.dropboxusercontent.com/s_B8A06116D3803694CDA0C13F9F97E92EA0220D4E377317F0F00D7831E3E41E9E_1727988124731_image.png)

One month ago we open sourced Instant and had one of the [largest Show HN’s](https://news.ycombinator.com/item?id=41322281) for a YC company. Today we’re [announcing our $3.4M seed](https://techcrunch.com/2024/10/02/instant-harkens-back-to-a-pre-google-firebase/). We’re backed by YCombinator, SV Angel, and a number of technical angels, including James Tamplin, the original CEO of Firebase, Paul Graham, Co-founder of YCombinator, Greg Brockman, Co-founder of OpenAI, and Jeff Dean, chief scientist of Google DeepMind.

## What is Instant?

In two sentences: Instant is a modern Firebase. We make you productive by giving your frontend a real-time database.

What does that actually mean?

Imagine you’re a hacker who loves building apps. You have an exciting idea, and are ready to **make something people want.** You want to build an MVP fast, that doesn’t completely suck. So how do you do it?

Most of the time we make a three-tier architecture with client, server, and a database. On the server side we write endpoints to glue our frontend with our database. We might use an ORM to make it easier to work with our db, and add a cache to serve requests faster. On the client we need to reify json from the server and paint a screen. We add stores to manage state, and write mutations to handle updates. This is just for basic functionality.

If we want our UIs to feel fast, we write optimistic updates so we don’t need to wait for the server. If we want live updates without refreshing we either poll or add websockets. And if we want to support offline mode, we need to integrate IndexedDB and pending transaction queues.

That’s a lot of work!

To make things worse, whenever we add a new feature, we go through the same song and dance over and over again: add models to our DB, write endpoints on our server, create stores in our frontend, write mutations, optimistic updates, etc.

Could it be better? We think so!

![Instant compresses the schleps!](https://camo.githubusercontent.com/b537dcbe3a35bd6a079205031660ac85bb966a6a48265e6d3c4a603e3c5584f9/68747470733a2f2f696e7374616e7464622e636f6d2f726561646d65732f636f6d7072657373696f6e2e737667)

If you had a database on the client, you wouldn’t need to manage stores, selectors, endpoints, caches, etc. You could just write queries to fetch the data you want. If these queries were reactive, you wouldn’t have to write extra logic to re-fetch whenever new data appears. Similarly you could just make transactions to apply mutations. These transactions could apply changes optimistically and be persisted locally. Putting this all together, you can build delightful applications without the normal schleps.

So we built Instant. Instant gives you a database you can use in the client, so you can focus on what’s important: **building a great UX for your users, and doing it quickly**.

## How is Instant different from Firebase or Supabase?

![](https://user-images.githubusercontent.com/984574/186711681-28b224cc-46df-437a-b37b-69520da40ae3.png)

You may be wondering, what makes Instant so modern compared to Firebase, and how is it different from Supabase?

Both Firebase and Supabase provide a database on the client as well. Firebase comes with realtime, optimistic updates, and offline mode, but does not support relations. Supabase is relational at it’s core, but optimistic updates and offline mode need to be hand-rolled for every feature. If you could have Firebase with relations, you’d have an infrastructure capable of building some of the best apps today like Figma, Notion, or Linear.

Our architecture is inspired by [Figma’s LiveGraph](https://www.figma.com/blog/livegraph-real-time-data-fetching-at-figma/) and [Asana’s LunaDB](https://blog.asana.com/2020/09/worldstore-distributed-caching-reactivity-part-2/). We also built Instant to be multi-tenant and don’t need to spin up an actual database for users. This enables us to give users a database in <10ms with a click of a button. And unlike our competitors, we can offer a free tier to users where their projects are never paused and there is no limit to the number of active projects they can have.

To learn more about how Instant works under the hood, check out our essay [A Graph-Based Firebase](https://www.instantdb.com/essays/next_firebase)

## Who is Instant?

We’re [Joe](https://linkedin.com/in/joeaverbukh) and [Stopa](https://x.com/stopachka), engineers, best friends, and co-founders. We first met in San Francisco in 2014 and worked together as senior and staff engineers at Facebook and Airbnb.

![](https://paper-attachments.dropboxusercontent.com/s_B8A06116D3803694CDA0C13F9F97E92EA0220D4E377317F0F00D7831E3E41E9E_1727878507415_joe_stopa.png)

When we worked at Facebook, most designers used Sketch. At that time no one thought there could be something better. Figma came out and changed the game. Similarly, in the 2010s, Evernote was one of the best note taking apps. In 2024 most people use Notion instead.

Features like multiplayer, optimistic updates, and offline mode are what differentiate the best apps. As app users grow accustomed to instant experiences, reactivity will become table stakes for modern applications. Today delivering these features is difficult and requires a bespoke solution from a team of engineers at top tech companies. In the future, there will be infrastructure that all developers use to get these features for free.

That’s what we’re building with Instant, a platform to build applications of the future.

## Instant is growing

After being heads down for two years, Instant [open sourced](https://github.com/instantdb/instant) at the end of August 2024. On the same day we announced on Hacker News, amassed over 1k points, and [hit #1 for several hours](https://hnrankings.info/41322281/). It’s been a whirlwind since.

We’re getting a new office in San Francisco and looking for founding engineers to grow Instant. If you want to be part of a small team solving some of the hardest problems in web development [check out our hiring page!](/hiring)
