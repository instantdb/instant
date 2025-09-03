[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / BackwardsCompatibleSchema

# Type Alias: BackwardsCompatibleSchema\<Shape, RoomSchema\>

```ts
type BackwardsCompatibleSchema<Shape, RoomSchema> = InstantSchemaDef<{ [K in keyof Shape]: EntityDefFromShape<Shape, K> }, UnknownLinks<EntitiesDef>, RoomDefFromShape<RoomSchema>>;
```

Defined in: core/dist/esm/schemaTypes.d.ts:196

If you were using the old `schema` types, you can use this to help you
migrate.

## Type Parameters

### Shape

`Shape` *extends* `object`

### RoomSchema

`RoomSchema` *extends* `RoomSchemaShape` = \{
\}

## Example

```ts
// Before
const db = init<Schema, Rooms>({...})

// After
const db = init<BackwardsCompatibleSchema<Schema, Rooms>>({...})
```
