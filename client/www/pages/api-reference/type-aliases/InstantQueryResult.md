[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / InstantQueryResult

# ~~Type Alias: InstantQueryResult\<DB, Q\>~~

```ts
type InstantQueryResult<DB, Q> = DB extends IInstantDatabase<infer Schema> ? InstaQLResult<Schema, Remove$<Q>> : never;
```

Defined in: core/dist/esm/helperTypes.d.ts:33

## Type Parameters

### DB

`DB` *extends* [`IInstantDatabase`](../interfaces/IInstantDatabase.md)\<`any`\>

### Q

`Q`

## Deprecated

`InstantQueryResult` is deprecated. Use `InstaQLResult` instead.

## Example

```ts
// Before
const db = init_experimental({ ...config, schema });
type DB = typeof db;
type MyQueryResult = InstantQueryResult<DB, typeof myQuery>;

// After
type Schema = typeof schema;
type MyQueryResult = InstaQLResult<Schema, typeof myQuery>;
```
