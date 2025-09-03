[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / ResolveAttrs

# Type Alias: ResolveAttrs\<Entities, EntityName, UseDates\>

```ts
type ResolveAttrs<Entities, EntityName, UseDates> = ResolveEntityAttrs<Entities[EntityName], UseDates>;
```

Defined in: core/dist/esm/schemaTypes.d.ts:103

## Type Parameters

### Entities

`Entities` *extends* [`EntitiesDef`](EntitiesDef.md)

### EntityName

`EntityName` *extends* keyof `Entities`

### UseDates

`UseDates` *extends* `boolean`
