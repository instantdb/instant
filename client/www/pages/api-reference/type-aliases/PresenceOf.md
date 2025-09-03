[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / PresenceOf

# Type Alias: PresenceOf\<S, RoomType\>

```ts
type PresenceOf<S, RoomType> = RoomsOf<S>[RoomType] extends object ? P : object;
```

Defined in: core/dist/esm/schemaTypes.d.ts:113

## Type Parameters

### S

`S`

### RoomType

`RoomType` *extends* keyof [`RoomsOf`](RoomsOf.md)\<`S`\>
