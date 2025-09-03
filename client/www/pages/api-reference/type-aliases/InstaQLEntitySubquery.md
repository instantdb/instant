[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / InstaQLEntitySubquery

# Type Alias: InstaQLEntitySubquery\<Schema, EntityName\>

```ts
type InstaQLEntitySubquery<Schema, EntityName> = { [QueryPropName in keyof Schema["entities"][EntityName]["links"]]?: $Option<Schema, EntityName> | $Option<Schema, EntityName> & InstaQLEntitySubquery<Schema, Schema["entities"][EntityName]["links"][QueryPropName]["entityName"]> };
```

Defined in: core/dist/esm/queryTypes.d.ts:167

## Type Parameters

### Schema

`Schema` *extends* `IContainEntitiesAndLinks`\<[`EntitiesDef`](EntitiesDef.md), `any`\>

### EntityName

`EntityName` *extends* keyof `Schema`\[`"entities"`\]
