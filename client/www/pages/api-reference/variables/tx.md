[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / tx

# Variable: tx

```ts
const tx: TxChunk<IContainEntitiesAndLinks<any, any>>;
```

Defined in: core/dist/esm/instatx.d.ts:123

A handy builder for changes.

You must start with the `namespace` you want to change:

## Example

```ts
db.tx.goals[goalId].update({title: "Get fit"})
  // Note: you don't need to create `goals` ahead of time.
```
