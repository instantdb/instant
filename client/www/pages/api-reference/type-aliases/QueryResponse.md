[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / QueryResponse

# Type Alias: QueryResponse\<Q, Schema, WithCardinalityInference, UseDates\>

```ts
type QueryResponse<Q, Schema, WithCardinalityInference, UseDates> = Schema extends InstantGraph<infer E, any> ? InstaQLQueryResult<E, Q, WithCardinalityInference, UseDates> : ResponseOf<{ [K in keyof Q]: Remove$<Q[K]> }, Schema>;
```

Defined in: core/dist/esm/queryTypes.d.ts:104

## Type Parameters

### Q

`Q`

### Schema

`Schema`

### WithCardinalityInference

`WithCardinalityInference` *extends* `boolean` = `false`

### UseDates

`UseDates` *extends* `boolean` = `false`
