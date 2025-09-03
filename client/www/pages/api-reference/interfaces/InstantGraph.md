[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / InstantGraph

# ~~Interface: InstantGraph\<Entities, Links, RoomSchema\>~~

Defined in: core/dist/esm/schemaTypes.d.ts:161

## Deprecated

`i.graph` is deprecated. Use `i.schema` instead.

## See

https://instantdb.com/docs/modeling-data

## Type Parameters

### Entities

`Entities` *extends* [`EntitiesDef`](../type-aliases/EntitiesDef.md)

### Links

`Links` *extends* [`LinksDef`](../type-aliases/LinksDef.md)\<`Entities`\>

### RoomSchema

`RoomSchema` *extends* `RoomSchemaShape` = \{
\}

## Implements

- `IContainEntitiesAndLinks`\<`Entities`, `Links`\>

## Properties

### ~~entities~~

```ts
entities: Entities;
```

Defined in: core/dist/esm/schemaTypes.d.ts:162

#### Implementation of

```ts
IContainEntitiesAndLinks.entities
```

***

### ~~links~~

```ts
links: Links;
```

Defined in: core/dist/esm/schemaTypes.d.ts:163

#### Implementation of

```ts
IContainEntitiesAndLinks.links
```

## Methods

### ~~withRoomSchema()~~

```ts
withRoomSchema<_RoomSchema>(): InstantGraph<Entities, Links, _RoomSchema>;
```

Defined in: core/dist/esm/schemaTypes.d.ts:165

#### Type Parameters

##### _RoomSchema

`_RoomSchema` *extends* `RoomSchemaShape`

#### Returns

`InstantGraph`\<`Entities`, `Links`, `_RoomSchema`\>
