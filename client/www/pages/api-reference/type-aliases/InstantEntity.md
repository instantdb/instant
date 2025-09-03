[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / InstantEntity

# ~~Type Alias: InstantEntity\<DB, EntityName, Query\>~~

```ts
type InstantEntity<DB, EntityName, Query> = DB extends IInstantDatabase<infer Schema> ? InstaQLEntity<Schema, EntityName, Query> : never;
```

Defined in: core/dist/esm/helperTypes.d.ts:60

## Type Parameters

### DB

`DB` *extends* [`IInstantDatabase`](../interfaces/IInstantDatabase.md)\<`any`\>

### EntityName

`EntityName` *extends* `DB` *extends* [`IInstantDatabase`](../interfaces/IInstantDatabase.md)\<infer Schema\> ? `Schema` *extends* `IContainEntitiesAndLinks`\<infer Entities, `any`\> ? keyof `Entities` : `never` : `never`

### Query

`Query` *extends* 
  \| `DB` *extends* [`IInstantDatabase`](../interfaces/IInstantDatabase.md)\<infer Schema\> ? `Schema` *extends* `IContainEntitiesAndLinks`\<infer Entities, `any`\> ? `{ [QueryPropName in keyof Entities[EntityName]["links"]]?: any }` : `never` : `never`
  \| \{
\} = \{
\}

## Deprecated

`InstantEntity` is deprecated. Use `InstaQLEntity` instead.

## Example

```ts
// Before
const db = init_experimental({ ...config, schema });
type DB = typeof db;
type MyEntity = InstantEntity<DB, "myEntityName">;

// After
type Schema = typeof schema;
type MyEntity = InstaQLEntity<Schema, "myEntityName">;
```
