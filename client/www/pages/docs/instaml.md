---
title: Writing data
---

Instant uses a **Firebase-inspired** interface for mutations. We call our mutation language **InstaML**

## Update data

We use the `update` action to create entities.

```javascript
db.transact([tx.goals[id()].update({ title: 'eat' })]);
```

This creates a new `goal` with the following properties:

- It's identified by a randomly generated id via the `id()` function.
- It has an attribute `title` with value `eat`.

Similar to NoSQL, you don't need to use the same schema for each entity in a namespace. After creating the previous goal you can run the following:

```javascript
db.transact([
  tx.goals[id()].update({
    priority: 'none',
    isSecret: true,
    value: 10,
    aList: [1, 2, 3],
    anObject: { foo: 'bar' },
  }),
]);
```

You can store `strings`, `numbers`, `booleans`, `arrays`, and `objects` as values. You can also generate values via functions. Below is an example for picking a random goal title.

```javascript
db.transact([
  tx.goals[id()].update({
    title: ['eat', 'sleep', 'hack', 'repeat'][Math.floor(Math.random() * 4)],
  }),
]);
```

---

The `update` action is also used for updating entities. Suppose we had created the following goal

```javascript
const eatId = id();
db.transact([
  tx.goals[eatId].update({ priority: 'top', lastTimeEaten: 'Yesterday' }),
]);
```

We eat some food and decide to update the goal. We can do that like so:

```javascript
db.transact([tx.goals[eatId].update({ lastTimeEaten: 'Today' })]);
```

This will only update the value of the `lastTimeEaten` attribute for entity `eat`.

## Merge data

When you use `update`, you overwrite the entire entity. This is fine for updating
values of strings, numbers, and booleans. But if you use `update` to overwrite
json objects you may encounter two problems:

1. You lose any data you didn't specify.
2. You risk clobbering over changes made by other clients.

To make working with deeply-nested, document-style JSON values a breeze, we created `merge`.
Similar to [lodash's `merge` function](https://lodash.com/docs/4.17.15#merge),
`merge` allows you to specify the slice of data you want to update.

```javascript
// We have a 4x4 tile clicking game with different colors
// and we want to update a specific cell in the game
// from blue to red
const game = {
  '0-0': 'red',
  '0-1': 'blue',
  '0-2': 'green',
  '0-3': 'green',
  '1-0': 'green',
  '1-1': 'red',
  '1-2': 'blue',
  '1-3': 'green',
  '2-0': 'green',
  '2-1': 'green',
  '2-2': 'red',
  '2-3': 'blue',
  '3-0': 'blue',
  '3-1': 'blue',
  '3-2': 'green',
  '3-3': 'red',
};

const boardId = '83c059e2-ed47-42e5-bdd9-6de88d26c521';
const row = 0;
const col = 1;
const myColor = 'red';

// ✅✅ Use `merge`
// With `merge` we can specify the exact cell we want to update
// and only send that data to the server. This way we don't risk
// overwriting other changes made by other clients.
transact([
  tx.boards[boardId].merge({
    state: {
      [`${row}-${col}`]: myColor,
    },
  }),
]);
```

`merge` only merges objects. Calling `merge` on **arrays, numbers, or booleans** will overwrite the values.

```javascript
// Initial state:  {num: 1, arr: [1, 2, 3], bool: true, text: 'hello', obj: {a: 1, b: 2}}
const randomId = '83c059e2-ed47-42e5-bdd9-6de88d26c521';
transact([
  tx.keys[randomId].merge({ state: { num: 2 } }), // will overwrite num from 1 -> 2
  tx.keys[randomId].merge({ state: { arr: [4] }), // will overwrite arr from [1, 2, 3] -> [4]
  tx.keys[randomId].merge({ state: { bool: false } }), // will overwrite bool from true -> false
  tx.keys[randomId].merge({ state: { text: 'world' } }), // will overwrite text from 'hello' -> 'world'
  tx.keys[randomId].merge({ state: { obj: { c: 3 } } }), // will merge obj from {a: 1, b: 2} -> {a: 1, b: 2, c: 3}
]);
```

Sometimes you may want to remove keys from a nested object. You can do so by calling `merge` with a key set to `null` or `undefined`. This will remove the corresponding property from the object.

```javascript
// Initial state: { obj: { a: 1, b: 2 } }
const randomId = '83c059e2-ed47-42e5-bdd9-6de88d26c521';
transact([
  tx.keys[randomId].merge({ state: { obj: { a: null } } }), // will delete key `a` from `state.obj`
]);
// End state: { obj: { b: 2 } }
// `state.obj.a` has been removed
```

## Delete data

The `delete` action is used for deleting entities.

```javascript
db.transact([tx.goals[eatId].delete()]);
```

You can generate an array of `delete` txs to delete all entities in a namespace

```javascript
const { isLoading, error, data } = db.useQuery({goals: {}}
const { goals } = data;
...
db.transact(goals.map(g => tx.goals[g.id].delete()));
```

Calling `delete` on an entity also deletes its associations. So no need to worry about cleaning up previously created links.

## Link data

`link` is used to create associations.

Suppose we create a `goal` and a `todo`.

```javascript
db.transact([
  tx.todos[workoutId].update({ title: 'Go on a run' }),
  tx.goals[healthId].update({ title: 'Get fit!' }),
]);
```

We can associate `healthId` with `workoutId` like so:

```javascript
db.transact([tx.goals[healthId].link({ todos: workoutId })]);
```

We could have done all this in one `transact` too via chaining transaction chunks.

```javascript
db.transact([
  tx.todos[workoutId].update({ title: 'Go on a run' }),
  tx.goals[healthId].update({ title: 'Get fit!' }).link({ todos: workoutId }),
]);
```

You can specify multiple ids in one `link` as well:

```javascript
db.transact([
  tx.todos[workoutId].update({ title: 'Go on a run' }),
  tx.todos[proteinId].update({ title: 'Drink protein' }),
  tx.todos[sleepId].update({ title: 'Go to bed early' }),
  tx.goals[healthId]
    .update({ title: 'Get fit!' })
    .link({ todos: [workoutId, proteinId, sleepId] }),
]);
```

Links are bi-directional. Say we link `healthId` to `workoutId`

```javascript
db.transact([tx.goals[healthId].link({ todos: workoutId })]);
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
db.transact([tx.goals[healthId].unlink({ todos: workoutId })]);
```

This removes links in both directions. Unlinking can be done in either direction so unlinking `workoutId` from `healthId`
would have the same effect.

```javascript
db.transact([tx.todos[workoutId].unlink({ goals: healthId })]);
```

We can `unlink` multiple ids too:

```javascript
db.transact([
  tx.goals[healthId].unlink({ todos: [workoutId, proteinId, sleepId] }),
  tx.goals[workId].unlink({ todos: [standupId, reviewPRsId, focusId] }),
]);
```

## Lookup by unique attribute

If your entity has a unique attribute, you can use `lookup` in place of the id to perform updates.

```javascript
import { lookup } from '@instantdb/core';

db.transact([
  tx.users[lookup('email', 'max@example.com')].update({ name: 'Max' }),
]);
```

The `lookup` function takes the attribute as its first argument and the unique attribute value as its second argument.

When it is used in a transaction, the updates will be applied to the entity that has the unique value. If no entity has the value, then a new entity with a random id will be created with the value.

It can be used with `update`, `delete`, `merge`, `link`, and `unlink`.

When used with links, it can also be used in place of the linked entity's id.

```javascript
db.transact([
  tx.users[lookup('email', 'max@example.com')].link({
    posts: lookup('number', 15),
  }),
]);
```

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
    goals.push(tx.goals[id()].update({goalNumber, title: `Goal ${goalNumber}`}));

    // We have enough goals to create a batch
    if (goals.length >= batchSize) {
      batches.push(goals);
      goals = []; // reset goals for the next batch
    }
  }

  // Now that you have your batches, transact them
  for (const batch of batches) {
    await transact(batch);
  }
}
```

## Using the tx proxy object

`tx` is a [proxy object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) which creates transaction chunks to be committed via `db.transact`. It follows the format

```
tx.NAMESPACE_LABEL[ENTITY_IDENTIFIER].ACTION(ACTION_SPECIFIC_DATA)
```

- `NAMESPACE_LABEL` refers to the namespace to commit (e.g. `goals`, `todos`)
- `ENTITY_IDENTIFIER` is the id to look up in the namespace. This id must be a uuid and unique to the namespace. You can use the `id()` function to generate a uuid for convenience.
- `ACTION` is one of `update`, `delete`, `link`, `unlink`
- `ACTION_SPECIFIC_DATA` depends on the action
  - `update` takes in an object of information to commit
  - `delete` is the only action that doesn't take in any data,
  - `link` and `unlink` takes an object of label-entity pairs to create/delete associations
