[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / TransactionChunk

# Interface: TransactionChunk\<Schema, EntityName\>

Defined in: core/dist/esm/instatx.d.ts:10

## Type Parameters

### Schema

`Schema` *extends* `IContainEntitiesAndLinks`\<`any`, `any`\>

### EntityName

`EntityName` *extends* keyof `Schema`\[`"entities"`\]

## Properties

### \_\_etype

```ts
__etype: EntityName;
```

Defined in: core/dist/esm/instatx.d.ts:12

***

### \_\_ops

```ts
__ops: Op[];
```

Defined in: core/dist/esm/instatx.d.ts:11

***

### create()

```ts
create: (args) => TransactionChunk<Schema, EntityName>;
```

Defined in: core/dist/esm/instatx.d.ts:17

Create objects. Throws an error if the object with the provided ID already
exists.

#### Parameters

##### args

`CreateParams`\<`Schema`, `EntityName`\>

#### Returns

`TransactionChunk`\<`Schema`, `EntityName`\>

***

### delete()

```ts
delete: () => TransactionChunk<Schema, EntityName>;
```

Defined in: core/dist/esm/instatx.d.ts:64

Delete an object, alongside all of its links.

#### Returns

`TransactionChunk`\<`Schema`, `EntityName`\>

#### Example

```ts
db.tx.goals[goalId].delete()
```

***

### link()

```ts
link: (args) => TransactionChunk<Schema, EntityName>;
```

Defined in: core/dist/esm/instatx.d.ts:50

Link two objects together

#### Parameters

##### args

[`LinkParams`](../type-aliases/LinkParams.md)\<`Schema`, `EntityName`\>

#### Returns

`TransactionChunk`\<`Schema`, `EntityName`\>

#### Example

```ts
const goalId = id();
const todoId = id();
db.transact([
  db.tx.goals[goalId].update({title: "Get fit"}),
  db.tx.todos[todoId].update({title: "Go on a run"}),
  db.tx.goals[goalId].link({todos: todoId}),
])

// Now, if you query:
useQuery({ goals: { todos: {} } })
// You'll get back:

// { goals: [{ title: "Get fit", todos: [{ title: "Go on a run" }]}
```

***

### merge()

```ts
merge: (args, opts?) => TransactionChunk<Schema, EntityName>;
```

Defined in: core/dist/esm/instatx.d.ts:93

Similar to `update`, but instead of overwriting the current value, it will merge the provided values into the current value.

This is useful for deeply nested, document-style values, or for updating a single attribute at an arbitrary depth without overwriting the rest of the object.

For example, if you have a goal with a nested `metrics` object:

```js
goal = { name: "Get fit", metrics: { progress: 0.3 } }
```

You can update the `progress` attribute like so:

```js
db.tx.goals[goalId].merge({ metrics: { progress: 0.5 }, category: "Fitness" })
```

And the resulting object will be:

```js
goal = { name: "Get fit", metrics: { progress: 0.5 }, category: "Fitness"  }
 ```

#### Parameters

##### args

##### opts?

`UpdateOpts`

#### Returns

`TransactionChunk`\<`Schema`, `EntityName`\>

#### Example

```ts
const goalId = id();
 db.tx.goals[goalId].merge({title: "Get fitter"})
```

***

### ruleParams()

```ts
ruleParams: (args) => TransactionChunk<Schema, EntityName>;
```

Defined in: core/dist/esm/instatx.d.ts:96

#### Parameters

##### args

`RuleParams`

#### Returns

`TransactionChunk`\<`Schema`, `EntityName`\>

***

### unlink()

```ts
unlink: (args) => TransactionChunk<Schema, EntityName>;
```

Defined in: core/dist/esm/instatx.d.ts:57

Unlink two objects

#### Parameters

##### args

[`LinkParams`](../type-aliases/LinkParams.md)\<`Schema`, `EntityName`\>

#### Returns

`TransactionChunk`\<`Schema`, `EntityName`\>

#### Example

```ts
// to "unlink" a todo from a goal:
 db.tx.goals[goalId].unlink({todos: todoId})
```

***

### update()

```ts
update: (args, opts?) => TransactionChunk<Schema, EntityName>;
```

Defined in: core/dist/esm/instatx.d.ts:31

Create and update objects. By default works in upsert mode (will create
entity if that doesn't exist). Can be optionally put into "strict update"
mode by providing { upsert: false } option as second argument:

#### Parameters

##### args

[`UpdateParams`](../type-aliases/UpdateParams.md)\<`Schema`, `EntityName`\>

##### opts?

`UpdateOpts`

#### Returns

`TransactionChunk`\<`Schema`, `EntityName`\>

#### Example

```ts
const goalId = id();
 // upsert
 db.tx.goals[goalId].update({title: "Get fit", difficulty: 5})

 // strict update
 db.tx.goals[goalId].update({title: "Get fit"}, {upsert: false})
```
