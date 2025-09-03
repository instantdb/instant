[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / InstaQLResult

# Type Alias: InstaQLResult\<Schema, Query, UseDates\>

```ts
type InstaQLResult<Schema, Query, UseDates> = Expand<{ [QueryPropName in keyof Query]: QueryPropName extends keyof Schema["entities"] ? InstaQLEntity<Schema, QueryPropName, Remove$NonRecursive<Query[QueryPropName]>, Query[QueryPropName]["$"]["fields"], UseDates>[] : never }>;
```

Defined in: core/dist/esm/queryTypes.d.ts:164

## Type Parameters

### Schema

`Schema` *extends* `IContainEntitiesAndLinks`\<[`EntitiesDef`](EntitiesDef.md), `any`\>

### Query

`Query` *extends* [`InstaQLParams`](InstaQLParams.md)\<`Schema`\>

### UseDates

`UseDates` *extends* `boolean` = `false`
