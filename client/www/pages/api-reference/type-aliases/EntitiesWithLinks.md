[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / EntitiesWithLinks

# Type Alias: EntitiesWithLinks\<Entities, Links\>

```ts
type EntitiesWithLinks<Entities, Links> = { [EntityName in keyof Entities]: EntityDef<Entities[EntityName]["attrs"], EntityForwardLinksMap<EntityName, Entities, Links> & EntityReverseLinksMap<EntityName, Entities, Links>, Entities[EntityName] extends EntityDef<any, any, infer O> ? O extends void ? void : O : void> };
```

Defined in: core/dist/esm/schemaTypes.d.ts:66

## Type Parameters

### Entities

`Entities` *extends* [`EntitiesDef`](EntitiesDef.md)

### Links

`Links` *extends* [`LinksDef`](LinksDef.md)\<`Entities`\>
