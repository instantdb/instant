[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / InstantUnknownSchemaDef

# Interface: InstantUnknownSchemaDef

Defined in: core/dist/esm/schemaTypes.d.ts:221

## Extends

- [`InstantSchemaDef`](InstantSchemaDef.md)\<`UnknownEntities`, `UnknownLinks`\<`UnknownEntities`\>, `UnknownRooms`\>

## Properties

### entities

```ts
entities: UnknownEntities;
```

Defined in: core/dist/esm/schemaTypes.d.ts:130

#### Inherited from

[`InstantSchemaDef`](InstantSchemaDef.md).[`entities`](InstantSchemaDef.md#entities-1)

***

### links

```ts
links: UnknownLinks;
```

Defined in: core/dist/esm/schemaTypes.d.ts:131

#### Inherited from

[`InstantSchemaDef`](InstantSchemaDef.md).[`links`](InstantSchemaDef.md#links-1)

***

### rooms

```ts
rooms: UnknownRooms;
```

Defined in: core/dist/esm/schemaTypes.d.ts:132

#### Inherited from

[`InstantSchemaDef`](InstantSchemaDef.md).[`rooms`](InstantSchemaDef.md#rooms-1)

## Methods

### ~~withRoomSchema()~~

```ts
withRoomSchema<_RoomSchema>(): InstantSchemaDef<UnknownEntities, UnknownLinks<UnknownEntities>, RoomDefFromShape<_RoomSchema>>;
```

Defined in: core/dist/esm/schemaTypes.d.ts:153

#### Type Parameters

##### _RoomSchema

`_RoomSchema` *extends* `RoomSchemaShape`

#### Returns

[`InstantSchemaDef`](InstantSchemaDef.md)\<`UnknownEntities`, `UnknownLinks`\<`UnknownEntities`\>, `RoomDefFromShape`\<`_RoomSchema`\>\>

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

#### Inherited from

[`InstantSchemaDef`](InstantSchemaDef.md).[`withRoomSchema`](InstantSchemaDef.md#withroomschema)
