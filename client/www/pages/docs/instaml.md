---
title: Writing data
description: How to write data with Instant using InstaML.
---

Instant uses a **Firebase-inspired** interface for mutations. We call our mutation language **InstaML**

## Creating data

We use the `create` action to create entities:

```typescript
import { init, id } from '@instantdb/react';

// Instant app
const APP_ID = '__APP_ID__';
const db = init({ appID: APP_ID });

// transact! 🔥
db.transact(db.tx.goals[id()].create({ title: 'eat' }));
```

This creates a new `goal` with the following properties:

- It's identified by a randomly generated id via the `id()` function.
- It has an attribute `title` with value `eat`.

You can store `strings`, `numbers`, `booleans`, `arrays`, and `objects` as values. You can also generate values via functions. Below is an example for picking a random goal title.

```javascript
db.transact(
  db.tx.goals[id()].create({
    title: ['eat', 'sleep', 'hack', 'repeat'][Math.floor(Math.random() * 4)],
  }),
);
```

## Update data

The `update` action is used for updating entities. Suppose we had created the following goal

```javascript
const eatId = id();
db.transact(
  db.tx.goals[eatId].update({ priority: 'top', lastTimeEaten: 'Yesterday' }),
);
```

We eat some food and decide to update the goal. We can do that like so:

```javascript
db.transact(db.tx.goals[eatId].update({ lastTimeEaten: 'Today' }));
```

This will only update the value of the `lastTimeEaten` attribute for entity `eat`.

Similar to NoSQL, you don't need to use the same schema for each entity in a namespace. After creating the previous goal you can run the following:

```javascript
db.transact(
  db.tx.goals[id()].update({
    priority: 'none',
    isSecret: true,
    value: 10,
    aList: [1, 2, 3],
    anObject: { foo: 'bar' },
  }),
);
```

`update` function works as create or update depending of whether the entity already exists or not (so called “upsert” mode). If entity doesn’t exist yet, calling `update` will create it, otherwise it will update.

To force “strict update” mode, pass `{ upsert: false }` option:

```javascript
db.transact(
  db.tx.goals[eatId].update({ lastTimeEaten: 'Today' }, { upsert: false }),
);
```

## Merge data

When you `update` an attribute, you overwrite it. This is fine for updating
values of strings, numbers, and booleans. But if you use `update` to overwrite
json objects you may encounter two problems:

1. You lose any data you didn't specify.
2. You risk clobbering over changes made by other clients.

For example, imagine we had a `game` entity, that stored a `state` of favorite colors:

```javascript
// User 1 saves {'0-0': 'red'}
db.transact(db.tx.games[gameId].update({ state: { '0-0': 'red' } }));

// User 2 saves {'0-1': 'blue'}
db.transact(db.tx.games[gameId].update({ state: { '0-1': 'blue' } }));

// 🤔 Uh oh! User 2 overwrite User 1:
// Final State: {'0-1': 'blue' }
```

To make working with deeply-nested, document-style JSON values a breeze, we created `merge`.
Similar to [lodash's `merge` function](https://lodash.com/docs/4.17.15#merge),
`merge` allows you to specify the slice of data you want to update:

```javascript
// User 1 saves {'0-0': 'red'}
db.transact(db.tx.games[gameId].merge({ state: { '0-0': 'red' } }));

// User 2 saves {'0-1': 'blue'}
db.transact(db.tx.games[gameId].merge({ state: { '0-1': 'blue' } }));

// ✅ Wohoo! Both states are merged!
// Final State: {'0-0': 'red', '0-1': 'blue' }
```

`merge` only merges objects. Calling `merge` on **arrays, numbers, or booleans** will overwrite the values.

Sometimes you may want to remove keys from a nested object. You can do so by calling `merge` with a key set to `null` or `undefined`. This will remove the corresponding property from the object.

```javascript
// State: {'0-0': 'red', '0-1': 'blue' }
db.transact(db.tx.games[gameId].merge({ state: { '0-1': null } }));
// New State! {'0-0': 'red' }
```

## Delete data

The `delete` action is used for deleting entities.

```javascript
db.transact(db.tx.goals[eatId].delete());
```

You can generate an array of `delete` txs to delete all entities in a namespace

```javascript
const { isLoading, error, data } = db.useQuery({ goals: {} });
const { goals } = data;
// ...

db.transact(goals.map((g) => db.tx.goals[g.id].delete()));
```

Calling `delete` on an entity also deletes its associations. So no need to worry about cleaning up previously created links.

## Link data

`link` is used to create associations.

Suppose we create a `goal` and a `todo`.

```javascript
db.transact([
  db.tx.todos[workoutId].update({ title: 'Go on a run' }),
  db.tx.goals[healthId].update({ title: 'Get fit!' }),
]);
```

We can associate `healthId` with `workoutId` like so:

```javascript
db.transact(db.tx.goals[healthId].link({ todos: workoutId }));
```

We could have done all this in one `transact` too via chaining transaction chunks.

```javascript
db.transact([
  db.tx.todos[workoutId].update({ title: 'Go on a run' }),
  db.tx.goals[healthId]
    .update({ title: 'Get fit!' })
    .link({ todos: workoutId }),
]);
```

You can specify multiple ids in one `link` as well:

```javascript
db.transact([
  db.tx.todos[workoutId].update({ title: 'Go on a run' }),
  db.tx.todos[proteinId].update({ title: 'Drink protein' }),
  db.tx.todos[sleepId].update({ title: 'Go to bed early' }),
  db.tx.goals[healthId]
    .update({ title: 'Get fit!' })
    .link({ todos: [workoutId, proteinId, sleepId] }),
]);
```

Links are bi-directional. Say we link `healthId` to `workoutId`

```javascript
db.transact(db.tx.goals[healthId].link({ todos: workoutId }));
```

We can query associations in both directions

```javascript
const { isLoading, error, data } = db.useQuery({
  goals: { todos: {} },
  todos: { goals: {} },
});

const { goals, todos } = data;
console.log('goals with nested todos', goals);
console.log('todos with nested goals', todos);
```

## Unlink data

Links can be removed via `unlink.`

```javascript
db.transact(db.tx.goals[healthId].unlink({ todos: workoutId }));
```

This removes links in both directions. Unlinking can be done in either direction so unlinking `workoutId` from `healthId` would have the same effect.

```javascript
db.transact([db.tx.todos[workoutId].unlink({ goals: healthId })]);
```

We can `unlink` multiple ids too:

```javascript
db.transact([
  db.tx.goals[healthId].unlink({ todos: [workoutId, proteinId, sleepId] }),
  db.tx.goals[workId].unlink({ todos: [standupId, reviewPRsId, focusId] }),
]);
```

## Lookup by unique attribute

If your entity has a unique attribute, you can use `lookup` in place of the id to perform updates.

```javascript
import { lookup } from '@instantdb/react';

db.transact(
  db.tx.profiles[lookup('email', 'eva_lu_ator@instantdb.com')].update({
    name: 'Eva Lu Ator',
  }),
);
```

The `lookup` function takes the attribute as its first argument and the unique attribute value as its second argument.

When it is used in a transaction, the updates will be applied to the entity that has the unique value. If no entity has the value, then a new entity with a random id will be created with the value.

It can be used with `update`, `delete`, `merge`, `link`, and `unlink`.

## Lookups in links

When used with links, it can also be used in place of the linked entity's id.

```javascript
db.transact(
  db.tx.users[lookup('email', 'eva_lu_ator@instantdb.com')].link({
    posts: lookup('number', 15), // using a lookup in place of the id
  }),
);
```

## Transacts are atomic

When you call `db.transact`, all the transactions are committed atomically. If
any of the transactions fail, none of them will be committed.

## Typesafety

By default, `db.transact` is permissive. When you save data, we'll create missing attributes for you:

```typescript
db.tx.todos[workoutId].update({
  // Instant will automatically create this attribute
  dueDate: Date.now() + 60 * 1000,
});
```

As your app grows, you may want to start enforcing types. When you're ready, you can start using a [schema](/docs/modeling-data). If your schema includes a `todos.dueDate` for example:

```typescript
// instant.schema.ts
const _schema = i.schema({
  entities: {
    todos: i.entity({
      // ...
      dueDate: i.date(),
    }),
  },
  // ...
});
// ...
```

Instant will enforce that `todos.dueDate` are actually dates, and you'll get some nice intellisense to boot:

{% screenshot src="/img/docs/instaml-due-date.png" /%}

Instant also comes with a few utility types, which can help you write abstractions over `transact`. For example, say you wanted to write a custom `update` function:

```typescript
// Goal
myCustomUpdate('todos', { dueDate: Date.now() });
```

You can use the `UpdateParams` utility to make sure arguments follow the schema:

```typescript
import { UpdateParams } from '@instantdb/react';
import { AppSchema } from '../instant.schema.ts';

type EntityTypes = keyof AppSchema['entities'];

function myCustomUpdate<EType extends EntityTypes>(
  etype: EType,
  args: UpdateParams<AppSchema, EType>,
) {
  // ..
}
```

And the `LinkParams` utility do the same for links:

```typescript
import { LinkParams } from '@instantdb/react';
import { AppSchema } from '../instant.schema.ts';

type EntityTypes = keyof AppSchema['entities'];

function myCustomLink<EType extends EntityTypes>(
  etype: EType,
  args: LinkParams<AppSchema, EType>,
) {
  // ..
}
```

To learn more about writing schemas, check out the [Modeling Data](/docs/modeling-data) section.

## Batching transactions

If you have a large number of transactions to commit, you'll want to batch them
to avoid hitting transaction limits and time outs.

Suppose we want to create 3000 goals. Here's how we can batch them into 30 transactions of 100 goals each.

```javascript
const batchSize = 100; // doing 100 txs should be pretty safe
const createGoals = async (total) => {
  let goals = [];
  const batches = [];

  // iterate through all your goals and create batches
  for (let i = 0; i < total; i++) {
    const goalNumber = i + 1;
    goals.push(
      db.tx.goals[id()].update({ goalNumber, title: `Goal ${goalNumber}` }),
    );

    // We have enough goals to create a batch
    if (goals.length >= batchSize) {
      batches.push(goals);
      goals = []; // reset goals for the next batch
    }
  }

  // Add any remaining goals to the last batch
  if (goals.length) {
    batches.push(goals);
  }

  // Now that you have your batches, transact them
  for (const batch of batches) {
    await db.transact(batch);
  }
};
```

## Using the tx proxy object

`db.tx` is a [proxy object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) which creates transaction chunks to be committed via `db.transact`. It follows the format

```
db.tx.NAMESPACE_LABEL[ENTITY_IDENTIFIER].ACTION(ACTION_SPECIFIC_DATA)
```

- `NAMESPACE_LABEL` refers to the namespace to commit (e.g. `goals`, `todos`)
- `ENTITY_IDENTIFIER` is the id to look up in the namespace. This id must be a uuid and unique to the namespace. You can use the `id()` function to generate a uuid for convenience.
- `ACTION` is one of `create`, `update`, `merge`, `delete`, `link`, `unlink`
- `ACTION_SPECIFIC_DATA` depends on the action
  - `create` and `update` take in an object of information to commit
  - `merge` takes in an object to deep merge with the existing data
  - `delete` is the only action that doesn't take in any data,
  - `link` and `unlink` takes an object of label-entity pairs to create/delete associations
