---
title: 'Sync Engines are the Future'
date: '2025-03-17'
authors: nikitonsky
---

_Hi! Niki here, also known as @nikitonsky. You might know me for [DataScript](https://github.com/tonsky/datascript), [The Web After Tomorrow](https://tonsky.me/blog/the-web-after-tomorrow/) or [Your frontend needs a database](https://www.hytradboi.com/2022/your-frontend-needs-a-database/). Last December, I joined Instant to continue my journey of bringing databases into the browser. Here’s my mission:_

The modern browser is an OS. Modern web app is a distributed app. So any web app developer is facing a well-known, well-understood, notoriously hard problem: syncing data.

Look, I’ve been around. I’ve seen trends come and go. I’ve seen data sync treated as a non-existent problem for two decades now. You’ve got XHR. You’ve got fetch. You’ve got REST and GraphQL. What else might you want?

The problem is, all these tools are low-level. They solve the problem of getting data once. But getting data is a continuous process: data changes over time and becomes stale, requests fail, updates arrive later than you might’ve wanted, or out of order. Errors will happen. Occasional `if (!response.ok)` will not get you very far.

```js
fetch(new Request('/user/update', { method: 'POST' })).then((response) => {
  if (!response.ok) {
    // Do what? Pretend it never happened?
    // Stop the entire application?
    // Retry? What if user already issued another update that invalidates this one?
    // What if update actually got through?
  }
});
```

And you can’t just give up and declare everything invalid. You have to keep working. You need a system. _You can’t solve this problem at the level of single request._

It’s also ill-advised to try to solve data sync _while also working on a product_. These problems require patience, thoroughness, and extensive testing. They can’t be rushed. And you already have a problem on your hands you don’t know how to solve: your product. Try solving both, fail at both [^1].

Funny enough, edge cases aren’t that unique from project to project. Everyone wants their data synced. Everyone wants their data correct and delivered exactly once. Everyone wants it fast, compact, and in time. A perfect case for a library.

Such a library would be called a database. But we’re used to thinking of a database as something server-related, a big box that runs in a data center. It doesn’t have to be like that! Databases have two parts: a place where data is stored and a place where data is delivered. That second part is usually missing.

Think about it: we want two computers to talk and coordinate how to sync data. It’s obvious that both computers will need to run some code, and that code will need to be compatible. In short, we want to run a database on the frontend. It’s not enough to “just fetch data” over some simple JSON protocol or a generic JDBC driver. As data changes on both sides on completely independent timelines, you need to push, pull, coordinate, negotiate, validate, retry, guard against. Data sync is a complex problem, and the client needs to be as sophisticated as the backend. _They need to work together._

But once you do that, you’re free. You’ll get your data synced for you—more reliably and efficiently than you could ever do by hand. You’ll be able to work with your data as if it’s all local and forget about sync most of the time.

In a perfect world, where everything is solved, what would programming look like? 99% business logic, 1% setup, right? Pure data and operations on data. People don’t want quarter-inch drill bits, they want quarter-inch holes. Paraphrasing that for programming: people don’t want databases. They want data.

Well, that’s what sync engines are supposed to solve—pure, clean, functional business code, decoupled from the horrors of an unreliable network. The best time of my life was when I was working with local data and _something else_ synced it in the background.

You’d get a database on your hands, too. It might sound controversial, but databases can be good at managing data. Queries are more concise, access is faster, and data is more organized. I’m a minimalist myself, but some things are simply better when queried from a (local) database. Would be faster, too.

```js
for (id of ids) {
  const user = users[id];
  for (const post_id of user.post_ids) {
    const post = posts[post_id];
    for (const comment_id of post.comment_ids) {
      const comment = comments[comment_id];
      if (comment.author_id === id) {
        // there must be a better way...
      }
    }
  }
}
```

Quick: what’s the data structure for when you want to query both posts by authors and authors by posts? Or: I’ve yet to see a code base that has maintained a separate in-memory index for data they are querying. Or does a hash join, for that matter. Usually it’s some form of four nested loops over an uncontrollable mix of maps and arrays. Not judging—I’ve been there—but there are tools that do it better and faster for you. Easier to read, too.

Then there’s SQL. It’s the best, and it’s the worst. I took a break from it for a few years, and I completely forgot what crazy things it can do—but also how crazy some simple things are. Something as simple as

```js
const query = {
  goals: {
    todos: {},
  },
};
```

turns into

```sql
SELECT g.*, gt.todos
FROM goals g
JOIN (
  SELECT g.id, json_agg(t.*) as todos
  FROM goals g
  LEFT JOIN todos t on g.id = t.goal_id
  GROUP BY 1
) gt on g.id = gt.id
```

when queried through SQL.

Of course, there’s legacy, there’s existing tooling, and there are all the teaching materials. It’s hard to replace SQL, and it’s twice as hard to beat it. All I’m saying is: if you don’t like databases because of SQL, I get you. Really. I understand. You are not alone.

What I know for a fact is that you can get where you going without SQL. I worked with Datalog for a while, and did all the same things without ever touching SQL. I know it’s possible—I’ve seen it myself. There are other, equally powerful query languages that can get real work done with (possibly) better ergonomics. SQL is not the end of the road.

So, what’s the significance of sync engines? I have a theory that every major technology shift happened when one part of the stack collapsed with another. For example:

- Web apps collapsed cross-platform development. Instead of developing two or three versions of your app, you now develop one, available everywhere!
- Node.js collapsed client and server development. You get one language instead of two! You can share code between them!
- Docker collapsed the distinction between dev and prod.
- React collapsed HTML and JS, Tailwind collapsed JS and CSS.

So where does that leave sync engines? They collapse the database and the server. If your database is smart enough and capable enough, why would you even need a server? Hosted database saves you from the horrors of hosting and lets your data flow freely to the frontend.

I never thought this was possible in practice, but then Roam Research proved me wrong. For the first few years after public release, they didn’t have a single server. Everything was synced to and served from Firebase. Living the dream.

That more or less covers it. We are building a sync engine because syncing data ad hoc, situationally is both hard and error-prone. We are also building it because we believe it simplifies the stack in a meaningful way. After all, we want our AI overlords to have a good time programming, too.

[Discussion on HN](https://news.ycombinator.com/item?id=43397640)

_Thanks Stepan Parunashvili, Joe Averbukh, and Kevin Lynagh for reviewing drafts of this essay._

[^1]: Unless you have unlimited time and resources. Yes, Figma and Linear both built their sync engines while also building their product. Exceptions happen.
