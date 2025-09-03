[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / InstantQuery

# ~~Type Alias: InstantQuery\<DB\>~~

```ts
type InstantQuery<DB> = DB extends IInstantDatabase<infer Schema> ? InstaQLParams<Schema> : never;
```

Defined in: core/dist/esm/helperTypes.d.ts:18

## Type Parameters

### DB

`DB` *extends* [`IInstantDatabase`](../interfaces/IInstantDatabase.md)\<`any`\>

## Deprecated

`InstantQuery` is deprecated. Use `InstaQLParams` instead.

## Example

```ts
// Before
 const db = init_experimental({ ...config, schema });
 type DB = typeof db;
 const myQuery = { ... } satisfies InstantQuery<DB>;

 // After
 type Schema = typeof schema;
 const myQuery = { ... } satisfies InstaQLParams<Schema>;
```
