[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / InstantSchemaDef

# Interface: InstantSchemaDef\<Entities, Links, Rooms\>

Defined in: core/dist/esm/schemaTypes.d.ts:129

## Extended by

- [`InstantUnknownSchemaDef`](InstantUnknownSchemaDef.md)

## Type Parameters

### Entities

`Entities` *extends* [`EntitiesDef`](../type-aliases/EntitiesDef.md)

### Links

`Links` *extends* [`LinksDef`](../type-aliases/LinksDef.md)\<`Entities`\>

### Rooms

`Rooms` *extends* [`RoomsDef`](RoomsDef.md)

## Implements

- `IContainEntitiesAndLinks`\<`Entities`, `Links`\>

## Properties

### entities

```ts
entities: Entities;
```

Defined in: core/dist/esm/schemaTypes.d.ts:130

#### Implementation of

```ts
IContainEntitiesAndLinks.entities
```

***

### links

```ts
links: Links;
```

Defined in: core/dist/esm/schemaTypes.d.ts:131

#### Implementation of

```ts
IContainEntitiesAndLinks.links
```

***

### rooms

```ts
rooms: Rooms;
```

Defined in: core/dist/esm/schemaTypes.d.ts:132

## Methods

### ~~withRoomSchema()~~

```ts
withRoomSchema<_RoomSchema>(): InstantSchemaDef<Entities, Links, RoomDefFromShape<_RoomSchema>>;
```

Defined in: core/dist/esm/schemaTypes.d.ts:153

#### Type Parameters

##### _RoomSchema

`_RoomSchema` *extends* `RoomSchemaShape`

#### Returns

`InstantSchemaDef`\<`Entities`, `Links`, `RoomDefFromShape`\<`_RoomSchema`\>\>

#### Deprecated

`withRoomSchema` is deprecated. Define your schema in `rooms` directly:

#### Example

```ts
// Before:
const schema = i.schema({
  // ...
}).withRoomSchema<RoomSchema>()

// After
const schema = i.schema({
 rooms: {
   // ...
 }
})
```

#### See

https://instantdb.com/docs/presence-and-topics#typesafety
