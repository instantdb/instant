<p align="center">
  <a href="https://instantdb.com/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://instantdb.com/readmes/logo_with_text_dark_mode.svg">
      <img alt="Shows the Instant logo" src="https://instantdb.com/readmes/logo_with_text_light_mode.svg">
    </picture>
  </a>
</p>

<p align="center">
  <a 
    href="https://discord.com/invite/VU53p7uQcE" >
    <img height=20 src="https://img.shields.io/discord/1031957483243188235" />
  </a>
  <a href="#">
    <img src="https://img.shields.io/github/stars/instantdb/instant" alt="stars">
  </a>
</p>

<p align="center">
   <a href="https://instantdb.com/docs">Get Started</a> · 
   <a href="https://instantdb.com/examples">Examples</a> · 
   <a href="https://instantdb.com/tutorial">Try the Demo</a> · 
   <a href="https://instantdb.com/docs">Docs</a> · 
   <a href="https://discord.com/invite/VU53p7uQcE">Discord</a>
<p>

Instant is a modern Firebase. We make you productive by giving your frontend a real-time database.

You write [relational queries](https://www.instantdb.com/docs/instaql) in the shape of the data you want and Instant handles all the data fetching, permission checking, and offline caching. When you [change data](https://www.instantdb.com/docs/instaml), optimistic updates and rollbacks are handled for you as well. Plus, every query is multiplayer by default.

We also support [ephemeral](https://www.instantdb.com/docs/presence-and-topics) updates, like cursors, or who's online. Currently we have SDKs for [Javascript](https://www.instantdb.com/docs/start-vanilla), [React](https://www.instantdb.com/docs/), and [React Native](https://www.instantdb.com/docs/start-rn).

How does it look? Here's a barebones chat app in about 12 lines:

```javascript
// ༼ つ ◕_◕ ༽つ Real-time Chat
// ----------------------------------
// * Updates instantly
// * Multiplayer
// * Works offline

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
}
```

Want to see for yourself? <a href="https://instantdb.com/tutorial">try a demo in your browser.</a>

## Motivation

Writing modern apps are full of schleps. Most of the time you start with the server: stand up databases, caches, ORMs, and endpoints. Then you write client-side code: stores, selectors, mutators. Finally you paint a screen. If you add multiplayer you need to think about stateful servers, and if you support offline mode, you need to think about IndexedDB and transaction queues.

To make things worse, whenever you add a new feature, you go through the same song and dance over and over again: add models, write endpoints, stores, selectors, and finally the UI.

Could it be better?

In 2021, **we realized that most of the schleps we face as UI engineers are actually database problems in disguise.** (We got into greater detail [in this essay](https://instantdb.com/essays/next_firebase))

<p align="center">
  <a href="#">
    <img alt="Shows how Instant compresses schleps" src="https://instantdb.com/readmes/compression.svg">
  </a>
</p>

If you had a database on the client, you wouldn't need to think about stores, selectors, endpoints, or local caches: just write queries. If these queries were multiplayer by default, you wouldn't have to worry about stateful servers. And if your database supported rollback, you'd get optimistic updates for free.

So we built Instant. Instant gives you a database you can use in the client, so you can focus on what’s important: building a great UX for your users, and doing it quickly.

## Architectural Overview

Here's how Instant works at a high level:

<p align="center">
  <a href="#">
    <img alt="Shows how Instant compresses schleps" src="https://instantdb.com/readmes/architecture.svg">
  </a>
</p>

Under the hood, we store all user data as triples in one big Postgres database. A multi-tenant setup lets us offer a free tier that never pauses.

A sync server written in Clojure talks to Postgres. We wrote a query engine that understands datalog and [InstaQL](https://www.instantdb.com/docs/instaql), a relational language that looks a lot like GraphQL:

```javascript
// give me all users, their posts and comments
{
  users: {
    posts: {
      comments: {
      }
    }
  }
}
```

Taking inspiration from [Asana’s WorldStore](https://asana.com/inside-asana/worldstore-distributed-caching-reactivity-part-1) and [Figma’s LiveGraph](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/#syncing-object-properties), we tail postgres’ WAL to detect novelty and invalidate relevant queries.

For the frontend, we wrote a client-side triple store. The SDK handles persisting a cache of recent queries to IndexedDB on web, and AsyncStorage in React Native.

All data goes through a permission system powered by Google's [CEL library](https://github.com/google/cel-java).

## Getting Started

The easiest way to get started with Instant is by signing up on [instantdb.com](https://instantdb.com). [You can create a functional app in 5 minutes or less](https://instantdb.com/docs).

If you have any questions, you can jump in on our [discord](https://discord.com/invite/VU53p7uQcE).

## Contributing

You can start by joining our [discord](https://discord.com/invite/VU53p7uQcE) and introducing yourself. Even if you don't contribute code, we always love feedback.

If you want to make changes, start by reading the [`client`](./client/) and [`server`](./server/) READMEs. There you'll find instructions to start Instant locally.

## YourKit

We're using YourKit to help us debug Instant. They are kindly supporting Instant and other open source projects with their [full-featured Java Profiler](https://www.yourkit.com/java/profiler/index.jsp).

![yklogo](https://github.com/user-attachments/assets/64788da3-1dc4-4aa6-84cd-e051fd059fd0)
