---
title: A backend for AI-coded apps
date: '2026-03-26'
authors: nezaj, stopachka, dww, drew
thumbnail: /img/essays/architecture.jpg
summary: Instant 1.0 is out! This essay shows a bunch of demos, to explain why we think Instant is the best backend for AI coded apps. We also cover the architecture that makes all of it work.
---

After 4 years, we’re releasing Instant 1.0! 

Instant turns your favorite coding agent into a full-stack app builder. And we’re fully open source. [^]

Our claim is that Instant is the best backend you could use for AI-coded apps. 

In this post we’ll do two things. First we’ll show you a series of [demos](#demos), so you can judge for yourself. Second, we’ll cover the [architecture](#architecture). 

The constraints behind a real-time, relational, and multi-tenant backend pushed us towards some interesting design choices. We built a multi-tenant database on top of Postgres, and a sync engine in Clojure. We’ll cover how all this works and what we’ve learned so far. 

Let’s get into it.

<a name="demos"></a>

# Demos

When you choose Instant you get three benefits:

You can make unlimited apps and they’re never frozen. 

You get a sync engine, so your apps work offline, are real-time, and feel fast. 

And when you need more features you have built-in services: auth, file storage, presence, and streams.

To get a sense of what we mean, I’ll dive into each point and show you how they look.

## Unlimited Apps

Traditionally, when you want to host apps online you either pay for VMs, or you’re limited. Many services cap how many free apps you can make, and freeze them when they’re idle. Unfreezing can often take more than 30 seconds and sometimes a few whole minutes.

We thought this sucked. So with Instant, you can spin up as many projects as you like and we’ll never freeze them. 

We can do this because Instant is designed to be multi-tenant. When you create a new project, we don’t spin up a VM. We just insert a few database rows in a multi-tenant instance. 

If your app is inactive, there's no compute or memory costs at all. And when it is active, it’s only a few kilobytes of extra RAM in overhead — as opposed to the many hundreds of megabytes required for VMs.

This means you can truly create unlimited apps. In fact, the process is so efficient that we can create an app for you right inside this essay. No sign up required.

If you click the button that follows, you’ll get an isolated backend:


![](https://paper-attachments.dropboxusercontent.com/s_331134A1AB81F48C9BB3AF9F0C08F3485C408CA845F0A79093D4B651B8B202E3_1775599160595_image.png)


And with that we have our backend. When you include the round-trip to your computer, this should take about a few hundred milliseconds (actual time: Click to see). 

You get a public App ID to identify your backend, and a private Admin Token that lets you make privileged changes. This gives you a relational database, sync engine, and the additional services we mentioned, like auth and storage. 

Combine limitless apps with agents, and you’ll start building differently. Today you can already use agents to make lots of apps. With Instant you’ll never be blocked from pushing them to production.

## Sync Engine

But once you create an app, how do you make it good? 

It’s easy to build a traditional CRUD app. Just get an agent to wire up some database migrations, backend endpoints, and client-side stores. But it’s hard to make these apps *delightful*.

Compare a traditional CRUD app to modern apps like Linear, Notion, and Figma. Modern apps are multiplayer, they work offline, and they feel fast. If you change a todo in Linear, it changes everywhere. If you go offline in Notion, you can still mark up your docs. When you color a shape in Figma, it doesn’t wait for a server, you just see it.

These kind of apps need custom infrastructure. For real-time you add stateful websocket servers. For offline mode you store caches in IndexedDB. And for optimistic updates, you figure out how to apply and undo mutations in the client.

Linear, Notion, and Figma all built custom infra to handle this. As an industry we’ve called their infra sync engines [^]. Developers write UIs and query their data as though it was locally available. The sync engine handles all the data management under the hood.

If modern apps need sync engines, then you shouldn’t have to build them from scratch each time. 

So we built a generalized sync engine in Instant. Every app comes with multiplayer, offline mode, and optimistic updates by default.

You can try it yourself. Since we’ve created our isolated backend, let’s go ahead and use it:

![](https://paper-attachments.dropboxusercontent.com/s_331134A1AB81F48C9BB3AF9F0C08F3485C408CA845F0A79093D4B651B8B202E3_1775599300716_image.png)


What you’re seeing are two iframes that render a todo app. They’re powered by the backend you just created (we passed the iframes your App ID).

Now if you add a todo in one iframe, it will show up in the other. If you go offline, you can make changes and they will sync together. You can try degrading your network, and changes will still feel fast.

And here’s what the todo app’s backend code is like:

![](https://paper-attachments.dropboxusercontent.com/s_331134A1AB81F48C9BB3AF9F0C08F3485C408CA845F0A79093D4B651B8B202E3_1775599502627_image.png)


That’s about N lines. This is even more concise then if you had built a traditional CRUD app. You would have needed to write backend endpoints and frontend stores. Instead you just make queries and transactions directly in your frontend.

`db.useQuery` lets you write relational queries and they stay in sync. `db.transact` lets you make changes and it works offline.

This is better for you as a builder: the code is understandable and it’s easy to maintain. It’s better for your users: they get a delightful app. And it’s better for your agents. Sync engines are a tight abstraction [^], so agents can use them to write more concise code with less tokens and less mistakes.

## Additional Services

You saw data sync, but it doesn’t stop there. Apps often need more then data sync. 

For example, right now every person who opens our demo app sees the same set of todos. What if we want to add auth or permissions? We may also want to support file uploads, or a “who’s online” section. Or heck maybe we add an AI assistant, and would need infra to stream tokens to the client. 

These are common features that most apps need. But often we have to string together different services to get them. Not only is that annoying, but it introduces a new level of complexity. When you manage multiple services, you manage multiple sources of truth. 

So to make it easier to enhance your apps, we baked in a bunch of common services inside Instant. Each service is built to work together as a single, integrated system. 

To get a sense of these services, let’s look at our todo app again, but this time we’ll add support for file uploads: 

![](https://paper-attachments.dropboxusercontent.com/s_331134A1AB81F48C9BB3AF9F0C08F3485C408CA845F0A79093D4B651B8B202E3_1775600526256_image.png)


What would be the traditional way to do this? We would first create a `files` table in our transactional database, and link it to `todos`. But then we would need to store the actual file blobs, so we’d probably add S3.

Once we add S3, we have multiple sources of truth to deal with. If we delete a todo for example, we’d need to run a background worker get rid of the corresponding blob in S3. 

With Instant, all of this is a non-issue. 

You get File Storage by default, and file objects are just rows in your database. They’re just like any other entity: you can create them, link them to other data, and run real-time queries against them. 

This means you can even create CASCADE delete rules, so you can say “when you delete todos, delete files”. So if we wanted to delete a todo this is the code we’d write:

![](https://paper-attachments.dropboxusercontent.com/s_331134A1AB81F48C9BB3AF9F0C08F3485C408CA845F0A79093D4B651B8B202E3_1775600488569_image.png)


CASCADE delete just deletes our files for us. There’s no need for background workers. 

Instead of multiple sources of truth, you get one integrated database. The shared infra handles all the edge cases under the hood [^].

And this is just Instant Storage. You also get Auth. You can use Magic Codes, OAuth, and Guest Auth out of the box. Plus when your users sign up, they’re just rows in your database too. 

If you want to share cursors, typing indicators, or ‘who’s online’ markers, you can use Instant Presence. 

And if you need to share durable streams, you get, well, Instant Streams.

If you’re curious, we have a bunch of real examples you can play with in the recipes page. You’ll notice that most of these services require little setup and little code. Both you and your agents can move faster and make your apps feature rich. You don’t have to scour for different providers and deal with bi-directional data sync.

## Bonus: What you can do, your agent can do

Throughout this essay, you may have wondered, how do the all these demos work?

Well, Instant is completely programmatic. You can create apps, push schemas and update permissions either through an API or a CLI. This essay uses the API, but likely your agents will use the CLI. 

Most of the time you don’t have to click any dashboards. Your agents can just make actions on your behalf. 

At this point, we hope you’re excited enough to sign up. ****(You technically don’t even need to sign up to play around, but we do notice that if you do, you’re more likely to stick around. So we really encourage you too!)

And with that, we can dive into the architecture that powers of all of this.

<a name="architecture"></a>

# Architecture

There’s three unique things about how Instant works. We have the Client SDK, the Clojure Backend, and the Multi-Tenant Database.


![](https://paper-attachments.dropboxusercontent.com/s_331134A1AB81F48C9BB3AF9F0C08F3485C408CA845F0A79093D4B651B8B202E3_1775735518061_CleanShot+2026-04-09+at+04.51.412x.png)


Your app sends queries and transactions directly to the Client SDK. It’s responsible for resolving your queries offline, and for applying transactions as soon you make them.

The Client SDK then talks to The Clojure Backend. The Clojure Backend keeps queries real-time. It takes transactions and figures out which clients need to know about them. It also implements all the additional services: permissions, auth, presence, storage, and streams. 

Finally, The Clojure Backend sends queries and transactions to a single Postgres Instance. We treat Postgres as a multi-tenant Triple store, and logically separate every database by App ID.

That’s the sketch of our system. Now let’s get deeper.

# The Client SDK

The design behind the Client SDK is motivated by two constraints: we needed a system that works offline, and we need it to support optimistic updates. 

Here’s roughly where we ended up: 


![](https://paper-attachments.dropboxusercontent.com/s_331134A1AB81F48C9BB3AF9F0C08F3485C408CA845F0A79093D4B651B8B202E3_1775710460513_image.png)

## IndexedDB

Let’s start with the most obvious box. If we want to show the app offline, we need a place for data to live across refreshes. 

For the web you don’t have too many choices. IndexedDB is the best candidate. You can store many megabytes of data, and you even have some limited querying capabilities. 

So we chose IndexedDB [^]. The next question was, what kind data would we store there? 

## Triple store

Consider a query like “Show me all the open todos and their attachments”. This is how you would write it in Instant:

```typescript
{ 
  todos: { 
    $: { where: { done: false } }, 
    attachments: { },
}
```
If we just wanted a read-only cache, we could store whatever the server returns to us. But we don’t just want a read-only cache. 

We need the client to respond **to actions before the server acknowledges them. If a user adds a new todo for example, our query should just update right away. 

That means the client needs to understand queries. So then what our client really needs is a database itself. A database that can handle where clauses (i.e ‘done is false’), and relations (‘todos *and* their attachments’). 

One option would have been to use SQLLite. We could store normalized tables there — like `todos`, and `files` — and run SQL over them. But this was too heavy. SQLLite is about 300 KBs GZipped. For most apps it wouldn’t make sense to add such a heavy dependency. 

After some sleuthing though we discovered Triple stores and Datalog. 

Triple stores let you store data as `[entity, attribute, value]` tuples.  Here’s how todos would look like inside a Triple store:


![](https://paper-attachments.dropboxusercontent.com/s_331134A1AB81F48C9BB3AF9F0C08F3485C408CA845F0A79093D4B651B8B202E3_1775710215628_CleanShot+2026-04-08+at+21.49.582x.png)


This uniform structure can model both attributes and relationships. Once data is stored in this way, you can use Datalog to make queries against it. 

Datalog is a logic-based query engine. Here’s what that looks like:


![](https://paper-attachments.dropboxusercontent.com/s_331134A1AB81F48C9BB3AF9F0C08F3485C408CA845F0A79093D4B651B8B202E3_1775710238085_CleanShot+2026-04-08+at+21.50.262x.png)


The syntax looks weird, but Datalog is powerful. It can support where clauses and relations just as well as SQL. And it’s simple to implement. In fact, you can write a basic Datalog engine in less than hundred lines of code [^]. 

So we built a Triple store and a Datalog engine. This lets us evaluate queries completely in the client, without having to wait for the server. 

If a user creates a new todo, we have what need to re-run the query and observe the change right away. Well, almost. We need a way to apply changes to our query.

## Pending Queue

We can’t just mutated our the result in place. We have to be mindful of the server too. 

For example, what would happen if the server rejects our transaction? If we mutated the query result, there would be no way for us to undo the change. [^] 

That’s where the Pending Queue comes in. When a user makes a change, we don’t apply it directly to the Triple store. Instead we track the change in a separate queue. 

To satisfy any query, we can merge apply pending changes to our triple store, and see the result:

![](https://paper-attachments.dropboxusercontent.com/s_331134A1AB81F48C9BB3AF9F0C08F3485C408CA845F0A79093D4B651B8B202E3_1775710903881_image.png)


This choice pushes us to make our Triple store immutable. This way we can apply the change and produce a new Triple store, rather than mutating the commited one. To make this work, we wrap the transact API with mutative, a library for immutable changes in Javascript [^].

With that we have undo. If the server returns a failure, we simply remove the change from the pending queue and undo works out of the box. 

## Bonus: InstaQL

You may have noticed that Instant queries don’t look like Datalog though. Instead they’re written in a language we call InstaQL:

```typescript
{ 
  todos: { 
    $: { where: { done: false } }, 
    attachments: { },
}
```

We made this because we thought that the most ergonomic way for apps to query for data was describe the shape of the response they were looking for. 

This idea was heavily inspired by GraphQL. The main difference with our implementation is syntax sugar. Instead of introducing a specific grammar, InstaQL is built on top of plain javascript objects. This choice lets users skip a build step, and it lets them generate queries programmatically [^]. 

## Reactor 

With that, we have a somewhat full view of the Client SDK! 

Users write InstaQL queries, which get turned into Datalog. Those queries are satisfied by Triple stores, which combine changes from a pending queue. Data gets cached to IndexedDB. 

That’s a lot of interesting choices generated from just two constraints! 

The final question on the client is this: how do all these boxes tie together? 

That’s where the Reactor comes in. It’s the main state machine that coordinates all these different processes. When an app wants a query, the Reactor is responsible for looking at IndexedDB, and for communicating with the server. It handles when the internet goes offline or pending changes fail.

The Reactor communicates to the server through websockets. It sends requests for queries and transactions, and the server sends results and novelty from the database. 

Which brings us to the server.

# Clojure Backend

The design behind the backend is motivated by two constraints: we need to make queries reactive, and we need to be fair about multi-tenant resources.

Here’s roughly how the system looks:

![](https://paper-attachments.dropboxusercontent.com/s_331134A1AB81F48C9BB3AF9F0C08F3485C408CA845F0A79093D4B651B8B202E3_1775737048834_image.png)

<TODO, WRITING THE REST>
