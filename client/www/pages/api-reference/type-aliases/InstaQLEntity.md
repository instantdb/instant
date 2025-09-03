[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / InstaQLEntity

# Type Alias: InstaQLEntity\<Schema, EntityName, Subquery, Fields, UseDates\>

```ts
type InstaQLEntity<Schema, EntityName, Subquery, Fields, UseDates> = Expand<object & Extract<Fields[number], string> extends undefined ? ResolveEntityAttrs<Schema["entities"][EntityName], UseDates> : DistributePick<ResolveEntityAttrs<Schema["entities"][EntityName], UseDates>, Exclude<Fields[number], "id">> & InstaQLEntitySubqueryResult<Schema, EntityName, Subquery, UseDates>>;
```

Defined in: core/dist/esm/queryTypes.d.ts:153

## Type Parameters

### Schema

`Schema` *extends* `IContainEntitiesAndLinks`\<[`EntitiesDef`](EntitiesDef.md), `any`\>

### EntityName

`EntityName` *extends* keyof `Schema`\[`"entities"`\]

### Subquery

`Subquery` *extends* [`InstaQLEntitySubquery`](InstaQLEntitySubquery.md)\<`Schema`, `EntityName`\> = \{
\}

### Fields

`Fields` *extends* 
  \| [`InstaQLFields`](InstaQLFields.md)\<`Schema`, `EntityName`\>
  \| `undefined` = `undefined`

### UseDates

`UseDates` *extends* `boolean` = `false`
