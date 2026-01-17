---
title: 'Database in the Browser, a Spec'
date: '2021-04-29'
authors: stopachka
---

How will we build web applications in the future?

If progress follows it's usual strategy, then whatever is difficult and valuable to do today will become easy and normal tomorrow. I imagine we'll discover new abstractions, which will make writing Google Docs as easy as the average web app is today.

This begs the question — what will those abstractions look like? Can we discover them today? One way to find out, is to look at all the schleps we have to go through in building web applications, and see what we can do about it.

Dear reader, this essay is my attempt to follow that plan. We’ll take a tour of what it's like to build a web application today: we'll go over the problems we face, assess solutions like Firebase, Supabase, Hasura and friends, and see what's left to do. I think by the end, you'll agree with me that one of the most useful abstractions looks like a database in the browser. I'm getting ahead of myself though, let's start at the beginning:

# Client

The journey begins with Javascript in the browser

## A. Data Plumbing

The first job we have is to fetch information and display it in different places. For example, we may display a friends list, a friends count, a modal with a specific group of friends, etc

The problem we face, is that all components need to see consistent information. If one component sees different data for friends, it’s possible that you’ll get the wrong "count" showing up, or a different nickname in one view versus another.

To solve for this, we need to have a central source of truth. So, whenever we fetch anything, we normalize it and plop it in one place (often a _store_). Then, each component reads and transforms the data it needs (using a _selector_), It’s not uncommon to see something like:

```javascript
// normalise [posts] -> {[id]: post}
fetchRelevantPostsFor(user).then((posts) => {
  posts.forEach((post) => {
    store.addPost(post);
  });
});

// see all posts by author:
store.posts.values().reduce((res, post) => {
  res[post.authorId] = res[post.authorId] || [];
  res[post.authorId].push(post);
  return res;
}, {});
```

The question here is, _why_ should we need to do all this work? We write custom code to massage this data, while databases have solved this problem for a long time now. We should be able to _query_ for our data. Why can’t we just do:

```SQL
SELECT posts WHERE post.author_id = ?;
```

on the information that we have _inside_ the browser?

## B. Change

The next problem is keeping data up to date. Say we remove a friend — what should happen?

We send an API request, wait for it to complete, and write some logic to "remove" all the information we have about that friend. Something like this:

```javascript
deleteFriend(user, friend.id).then((res) => {
  userStore.remove(friend.id);
  postStore.removeUserPosts(friend.id);
});
```

But, this can get hairy to deal with quick: we have to remember every place in our store that could possibly be affected by this change. It’s like playing garbage collector in our heads. Our heads are not good at this.

One way folks avoid it, is to skip the problem and just re-fetch the whole world:

```javascript
deleteFriend(user, id).then((res) => {
  fetchFriends(user);
  fetchPostsRelevantToTheUser(user);
});
```

Neither solutions are very good. In both cases, there are implicit invariants we need to be aware of (based on this change, what other changes do we need to be aware of?) and we introduce lag in our application.

The rub is, whenever we make a change to the database, it does it’s job without us having to be so prescriptive. Why can’t this just happen automatically for us in the browser?

```SQL
DELETE FROM friendships WHERE friend_one_id = ? AND friend_two_id = ?
-- Browser magically updates with all the friend and post information removed
```

## C. Optimistic Updates

The problem you may have noticed with B., was that we had to _wait_ for friendship removal to update our browser state.

In most cases, we can make the experience snappier with an optimistic update — after all, we know that the call will likely be a success. To do this, we do something like:

```javascript
friendPosts = userStore.getFriendPosts(friend);
userStore.remove(friend.id);
postStore.removeUserPosts(friend.id);
deleteFriend(user, id).catch((e) => {
  // undo
  userStore.addFriend(friend);
  postStore.addPosts(friendPosts);
});
```

This is even more annoying. Now we need to manually update the success operation, _and_ the failure operation.

Why is that? On the backend, a database is able to do optimistic updates [^1] — why can’t we do that in the browser?

```SQL
DELETE friendship WHERE friend_one_id = ? AND friend_two_id = ?
-- local store optimistically updated, if operation fails we undo
```

## D. Reactivity

And data doesn’t just change from our own actions. Sometimes we need to connect to changes that other users make. For example, someone could unfriend us, or someone could send us a message.

To make this work, we need to do the same work that we did in our API endpoints, but this time on our websocket connection:

```javascript
ws.listen(`${user.id}/friends-removed`, friend => {
  userStore.remove(friend.id);
  postStore.removeUserPosts(friend.id);
}
```

But, this introduces two problems. First, we need to play garbage collector again, and remember every place that could be affected by an event.

Second, if we do optimistic updates, we have race conditions. Imagine you run an optimistic update, setting the color of a shape to `blue`, while a stale reactive update comes in, saying it’s `red`.

```
1. Optimistic Update: `Blue`
2. Stale reactive update: `Red`
3. Successful Update, comes in through socket: `Blue`
```

Now, you’ll see a flicker. The optimistic update will come in to `blue`, a reactive update will change it to `red`, but once the optimistic update succeeds, a new reactive update will turn it back to blue again. [^2]

Solving stuff like this has you dealing with consistency issues, scouring literature on…databases.

It doesn’t have to be that way though. What if each query was _reactive_?

```SQL
SELECT friends.* FROM users as friends JOIN friendships on friendship.user_one_id ...
```

Now, any change in friendships would automatically update the view subscribed to this query. You wouldn’t have to manage what changes, and your local database could figure out what the "most recent update" is, removing much of the complexity.

# Server

It only gets harder on the server.

## E. Endpoints

Much of backend development ends up being a sort of glue between the database and the frontend.

```javascript
// db.js
function getRelevantPostsFor(userId) {
  db.exec('SELECT * FROM posts WHERE ...');
}

// api.js
app.get('relevantPosts', (req, res) => {
  res.status(200).send(getRelevantPosts(req.userId));
});
```

This is so repetitive that we end up creating scripts to generate these files. But why do we need to do this at all? They are often coupled very closely to the client anyways. Why can’t we just expose the database to the client?

## F. Permissions

Well, the reason we don’t, is because we need to make sure permissions are correctly set. You should only see posts by your friends, for example. To do this, we add middleware to our API endpoints:

```javascript
app.put("user", auth, (req, res) => {
  ...
}
```

But, this ends up getting more and more confusing. What about websockets? New code changes sometimes introduce ways to update database objects that you didn’t expect. All of a sudden, you’re in trouble.

The question to ask here, is why is authentication at the API level? Ideally, we should have something _very close_ to the database, making sure any data access passes permission checks. There’s row-level security on databases like Postgres, but that can get hairy quick [^3]. What if you could "describe" entities near the database?

```javascript
User {
  view: [
    IAllowIfAdmin(),
    IAllowIfFriend(),
    IAllowIfSameUser(),
  ]
  write: [
    IAllowIfAdmin(),
    IAllowIfSameUser(),
  ]
}
```

Here we compose authentication rules, and make sure that _any_ way you try to write too and update a user entity, you are guaranteed to that you are permitted. All of a sudden, instead of most code changes affecting permissions, only a few do.

## G. Audits, Undo / Redo

And at some point, we get requirements that blow up complexity for us.

For example, say we need to support "undo / redo", for friendship actions. A user deletes a friend, and then they press "undo" — how could we support this?

We can’t just delete the friendship relation, because if we did, then we wouldn’t know if this person was "already friends", or was just asking now to become friends. In the latter case we may need to send a friend request.

To solve this, we’d evolve our data model. Instead of a single friendship relation, we’d have "friendship facts"

```javascript
[
  { status: 'friends', friend_one_id: 1, friend_two_id: 2, at: 1000 },
  { status: 'disconnected', friend_one_id: 1, friend_two_id: 2, at: 10001 },
];
```

Then the "latest fact" would represent whether there is a friendship or not.

This works, but most databases weren’t designed for it: the queries don’t work as we expect, optimizations are harder than we expect. We end up having to be _very_ careful about how we do updates, in case we end up accidentally deleting records.

All of a sudden, we become "sort of database engineers", devouring literature on query optimization.

This kind of requirement seems unique, but it’s getting more common. If you deal with financial transactions, you need something like this for auditing purposes. Undo / Redo is a necessity in lots of apps.

And god forbid an error happens and we accidentally delete data. In a world of facts there would be no such thing — you can just undo the deletions. But alas, this is not the world most of us live in.

There _are_ models that treat facts as a first class citizen (Datomic, which we’ll talk about soon), but right now they’re so foreign that it’s rarely what engineers reach too. What if it wasn't so foreign?

## H. Offline Mode

There’s more examples of difficulty. What about offline mode? Many apps are long-running and can go for periods without internet connection. How can we support this?

We would have to evolve our data model again, but this time _really_ keep just about everything as a "fact", and have a client-side database that evolve it’s internal state based on them. Once a connection is made, we should be able to reconcile changes.

This gets extremely hard to do. In essence, anyone who implements this becomes a database engineer full-stop. But, if we had a database in the browser, and it acted like a "node" in a distributed database, wouldn’t this just happen automatically for us?

Turns out, fact-based systems in fact make this much, much easier. Many think we need to resort to operational transforms to do stuff like this, but as figma showed, as long as we’re okay with having a single leader, and are fine with last-write-wins kind of semantics, we can drastically simplify this and just facts are enough. When time for even more serious resolution comes, you can open up the OT rabbit hole.

Imagine…offline mode off the bat. What would the most applications feel like after this?

## I. Reactivity

We talked about reactivity from the client. On the server it’s worrying too. We have to ensure that _all_ the relevant clients are updated when data changes. For example, if a "post" is added, we _need_ to make sure that all possible subscriptions related to this post are notified.

```javascript
function addPost(post) {
  db.addPost(post);
  getAllFriends(post).forEach(notifyNewPost);
}
```

This can get hairy. It’s hard to know _all_ the topics that could be related. It could also be easy to miss: if a database is updated with a query outside of `addPost`, we’d never know. This work is up to the developer to figure out. It starts off easy, but gets ever more complex.

Yet, the database _could_ be aware of all these subscriptions too, and _could_ just handle updating the relevant queries. But most don’t. RethinkDB is the shining example that did this well. What if this was possible with the query language of your choice?

## J. Derived Data

Eventually, we end up needing to put our data in different places: either caches (Redis), search indexes (ElasticSearch), or analytics engines (Hive). Doing this becomes pretty daunting. You may need to introduce some sort of a queue (Kafka), so all of these derived sources are kept up to date. Much of this involves provisioning machines, introducing service discovery, and the whole shebang.

Why is this so complicated though? In a normal database you can do something like:

```SQL
CREATE INDEX ...
```

Why can’t we do that, for other services? Martin Kleppman, in his Data Intensive Applications, suggests a language like this:

```javascript
db |> ElasticSearch;
db |> Analytics;
db.user |> Redis;
// Bam, we've connected elastic search, analytics, and redis to our db
```

# Monkey Wrenches

Wow, we’ve gone up to **J.** But these are only issues you start to face once you start building your application. What about before?

## K. TTP — Time to Prototype

Perhaps the most restrictive problem for developers today is how hard it is to get started. If you want to store user information and display a page, what do you do?

Before, it was a matter of `index.html` and FTP. Now, it’s webpack, typescript, build processes galore, often multiple services. There are so many moving pieces that it’s hard to take a step.

This can seem like a problem only inexperienced people need to contend with, and if they just spent some time they’ll get faster. I think it’s more important than that. Most projects live on the fringe — they aren’t stuff you do as a day job. This means that even a few minutes delay in prototyping could kill a magnitude more projects.

Making this step easier would dramatically increase the number of applications we get to use. What if it was _easier_ than `index.html` and `FTP`?

# Current Solutions

Wow, that’s a lot of problems. It may seem bleak, but if you just look a few years back, it’s surprising how much has improved. After all, we don’t need to roll our own racks anymore. Many great folks are working on solutions to these problems. What are some of them?

## 1) Firebase

I think Firebase has done some of the most innovative work in moving web application development forward. The most important thing they got right, was a **database on the browser.**

With firebase, you query your data the same way you would on the server. By creating this abstraction, they solved **A-E.** Firebase handles optimistic updates, and is reactive by default. It obviates the need for endpoints by providing support for permissions.

They’re strength also stems for **K:** I think it still has the _best_ time-to-prototype in the market. You can just start with index.html!

However, it has two problems:

First, query strength. Firebase’s choice of a document model makes the abstraction simpler to manage, but it destroys your query capability. Very often you’ll fall into a place where you have to de-normalize data, or querying for it becomes tricky. For example, to record a many-to-many relationship like a friendship, you’d need to do something like this:

```javascript
userA: friends: userBId: true;
userB: friends: userAId: true;
```

You de-normalize friendships across two different paths (userA/friends/userBId) and (userB/friends/userAId). Grabbing the full data requires you to manually replicate a join:

```javascript
1. get `userA/friends`
2. for each id, get `/${id}`
```

These kind of relationships sprout up very quickly in your application. It would be great if a solution helped you handle it.

Second, permissions. Firebase lets you write permissions using a limited language. In practice, these rules get hairy quickly — to the point that folks resort to writing some higher-level language themselves and compiling down to Firebase rules.

We experimented a lot on this at Facebook, and came to the conclusion that you need a _real language_ to express permissions. If Firebase had that, it would be much more powerful.

With the remaining items (audits, Undo / Redo, Derived Data) — Firebase hasn’t tackled them yet.

## 2) Supabase

Supabase is trying to do what Firebase did for Mongo, but for Postgres. If they did this, it would be quite an attractive option, as it would solve Firebase’s biggest problem: query strength.

Supabase has some great wins so far. Their auth abstraction is great, which makes it one of the few platforms that are as easy to get started with as firebase was.

Their realtime option allows you to subscribe to row-level updates. For example, if we wanted to know whenever a friendship gets created, updated, or changed, we could write this:

```javascript
const friendsChange = supabase
  .from('friendships:friend_one_id=eq.200')
  .on('*', handleFriendshipChange)
  .subscribe();
```

This in practice can get you far. It can get hairy though. For example, if a friend is created, we may not have the user information and we’d have to fetch it.

```javascript
function handleFriendshipChange(friendship) {
  if (!userStore.get(friendship.friend_two_id)) {
      fetchUser(...)
  }
}
```

This points to Supabase’s main weakness: it doesn’t have a "database on the browser" abstraction. Though you can make queries, you are responsible for normalizing and massaging data. This means that they can’t do optimistic updates automatically, reactive queries, etc.

Their permission model is also similar to Firebase, in that they defer to Postgres’ row-level security. This can be great to start out, like Firebase gets hairy quickly. Often these rules can slow down the query optimizer, and the SQL itself gets harder and harder to reason about.

## 3) GraphQL + Hasura

GraphQL is an excellent way to declaratively define data you want from the client. services like Hasura can take a database like Postgres, and do smart things like give you a GraphQL API out of it.

Hasura is very compelling for reads. They do a smart job of figuring joins, and can get you a good view for your data. With a flip, you can turn any query into a subscription. When I first tried turning a query into a subscription, it certainly felt magical.

The big issue today with GraphQL tools in general, is their time-to-prototype. You often need multiple different libraries and build steps. Their write-story is less compelling too. Optimistic Updates don’t just happen automatically — you have to bust caches yourself.

## Lay of the Land

We’ve looked at the three most promising solutions. Right now, Firebase solves the most problems off the bat. Supabase gives you query strength at the expense of more client-side support. Hasura gives you more powerful subscriptions and more powerful local state, at the expense of time-to-prototype. As far as I can see, none are handling conflict resolution, undo / redo, powerful reactive queries on the client yet.

# Future

Now the question: what will the evolution of these tools look like?

In some ways, the future is happening now. I think Figma, for example, is an app from the future: it handles handle offline-mode, undo / redo and multiplayer beautifully.

If we wanted to make an app like that, what would an ideal abstraction for data look like?

## Requirements

### 1) A database on the client, with a _powerful_ query language

From the browser, this abstraction would have to be like firebase, _but with a strong query language._

You should be able to query your local data, and it should be as powerful as SQL. Your queries should be reactive, and update automatically if there are changes. It should handle optimistic updates for you too.

```javascript
user = useQuery('SELECT * FROM users WHERE id = ?', 10);
```

### 2) A real permission language

Next up, we’d need a composable permission language. FB’s EntFramework is the example I keep going back too, because of how powerful it was. We should be able to define rules on entities, and should just be guaranteed that we won’t accidentally see something we’re not allowed to see.

```javascript
User {
  view: [
    IAllowIfAdmin(),
    IAllowIfFriend(),
    IAllowIfSameUser(),
  ]
  write: [
    IAllowIfAdmin(),
    IAllowIfFriend(),
  ]
}
```

### 3) Offline Mode & Undo / Redo

Finally, this abstraction should make it easy for us to implement offline mode, or undo redo. If a local write happens, and there’s a conflicting write on the server, there should be a reconciler which does the right thing most of the time. If there are issues, we should be able to nudge it along in the right direction.

Whatever abstraction we choose, it should give us the ability to run writes while we’re offline.

### 4) The Next Cloud

Finally, we should be able to express data dependencies without having to spin anything up. With a simple

```javascript
db.user |> Redis;
```

all queries to users would magically be cached by Redis.

## Sketch of an Implementation

Okay, those requirements sound magical. What would an implementation look like today?

### Datomic & Datascript

In the Clojure world, folks have long been fans of Datomic, a facts-based database that lets you "see every change over time". Nikita Tonsky also implemented datascript, _a client-side database and query engine_ with the same semantics as Datomic!

They’ve been used to build offline-enabled applications like Roam, or collaborative applications like Precursor. If we were to package up a Datomic-like database on the backend, and datascript-like database on the frontend, it _could_ become "database on the client with a powerful query language"!

### Reactivity

Datomic makes it easy for you to subscribe to new committed facts to the database. What if we made a service on top if, which kept queries and listened to these facts. From a change, we would update the relevant query. All of a sudden, our database becomes realtime!

### Permission Language

Our server could accept code fragments, which it runs when fetching data. These fragments would be responsible for permissions, giving us a powerful permission language!

### Pipe

Finally, we can write up some DSL, which lets you pipe data to Elastic Search, Redis, etc, all according to the user’s preferences.

With that, we have a compelling offering.

## Considerations

So, why doesn’t this exist yet? Well...

### Datalog is unfamiliar

If we were to use a Datomic-like database, we wouldn’t use SQL anymore. Datomic uses a logic-based query language called Datalog. Now, it is just as, if not more, powerful than SQL. The only gotcha is that for the uninitiated it looks very daunting:

```clojure
[:find [(pull ?c [:conversation/user :conversation/message]) ...]
 :where [?e :session/thread ?thread-id]
        [?c :conversation/thread ?thread-id]]
```

This query would find all messages, alongside with the user information, for the active thread in this current "session". Not bad!

Once you get to know it, it’s an unbelievably elegant language. However, I don’t think that’s enough. Time-to-prototype needs to be blazing fast, and having to learn this may be too much.

There have been some fun experiments in making this easier. Dennis Heihoff tried [using natural language](https://twitter.com/denik/status/1290415892367540227) for example. This points to an interesting solution: Could we write a slightly more verbose, but more natural query language that compiles to Datalog? I think so.

The other problem, is that data modeling is also different from what people are used too. Firebase is the gold-standard, where you can write your first mutation without specifying any schema.

Though it will be hard, I think we should aim to be as close to "easy" as possible. Datascript only requires you to indicate references and multi-valued attributes. Datomic requires a schema, but perhaps if we used an open-source, datalog-based database, we could enhance it to do something similar. Either as little schema as possible, or a "magically detectable schema".

### Datalog would be hard to make reactive

A big problem with both SQL and Datalog, is that based on some new change, it’s hard to figure out _which_ queries need to be updated.

I don’t think it’s impossible though. Hasura does polling and it scaled [^4]. We _could_ try having a specific language for subscriptions as well, similar to Supabase. If we can prove certain queries can only change by some subset of facts, we can move them out of polling.

This is a hard problem, but I think it’s a tractable one.

### A permission language would slow things down

One problem with making permission checks a full-blown language, is that we’re liable to overfetch data.

I think this is a valid concern, but with a database like Datomic, we could handle it. Reads are easy to scale and cache. Because everything’s a fact, we could create an interface that guides people to only fetch the values they need.

Facebook was able to do it. It will be hard, but it’s possible.

### It may be too large of an abstraction

Frameworks often fail to generalize. For example, what if we wanted to share mouse position? This is ephemeral state and doesn’t fit in a database, but we do need to make it realtime — where would we keep it? There’s a lot of these-kinds-of-things that are going to pop up if you build an abstraction like this, and you’re likely to get it wrong.

I do think this is a problem. If someone were to tackle this, the best bet would be to go the Rails approach: Build a production app using it, and extract the internals out as a product. I think they’d have a good shot at finding the right abstraction.

### It will only be used for toys

The common issue with these kind of products, is that people will only use them for hobby projects, and there won’t be a lot of money in it. I think Heroku and Firebase point to a bright future here.

Large companies start as side-projects. Older engineers may look at Firebase like a toy, but many a successful startup now runs on it. Instead of being a just a database, perhaps it’ll become a whole new platform — the successor to AWS.

### The Market is very competitive

The market is competitive and the users are fickle. Slava’s [Why RethinkDB Failed](https://www.defmacro.org/2017/01/18/why-rethinkdb-failed.html) paints a picture for how hard it is to win in the developer tools market. I don’t think he is wrong. Doing this would require a compelling answer to how you’ll build a moat, and expand towards _The Next AWS_.

# Fin

Well, we covered the pains, covered the competitors, covered an ideal solution, and went through the considerations. Thank you for walking with me on this journey!

## Like-Minded Folks

These ideas are not new. My friends Sean Grove and Daniel Woelfel’s built [Dato](https://www.youtube.com/watch?v=BiplJ4AFwCc), a framework that integrated a bunch of these ideas. Nikita Tonsky wrote [Web After Tomorrow](https://tonsky.me/blog/the-web-after-tomorrow/) an essay with a very similar spirit.

It may require some iteration to figure out the interface, but the there’s an interesting road ahead.

## Next Up

I’m toying with some ideas in this direction. The big problem to solve here, is how important this is for people, and whether a good abstraction can work. To solve the first, I wrote this essay. Is this a hair-on-fire problem that you’re facing? If it is, to the point that you’re actively looking for solutions, please reach out to me on [Twitter](https://twitter.com/stopachka)! I’d love to learn your use case 🙂. As I create applications, I’ll certainly keep this back of mind — who knows, maybe a good abstraction can be pulled out.

_Thanks Joe Averbukh, Sean Grove, Ian Sinnott, Daniel Woelfel, Dennis Heihoff, Mark Shlick, Alex Reichert, Alex Kotliarskyi, Thomas Schranz, for reviewing drafts of this essay_

[^1]: You may not notice this as Postgres gives a consistency guarantee. However, for them to support multiple concurrent transactions, they in effect need to be able to keep "temporary alterations"

[^2]: Figma mentions this problem in [their multiplayer essay](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)

[^3]: Plain SQL and boolean logic is hard to reuse, and can slow down the query planner. Many folks who have medium-sized apps experience this quickly.

[^4]: Take a look at Hasura’s [notes](https://github.com/hasura/graphql-engine/blob/master/architecture/live-queries.md)
