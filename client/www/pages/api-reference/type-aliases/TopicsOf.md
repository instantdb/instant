[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / TopicsOf

# Type Alias: TopicsOf\<S, RoomType\>

```ts
type TopicsOf<S, RoomType> = RoomsOf<S>[RoomType] extends object ? T : object;
```

Defined in: core/dist/esm/schemaTypes.d.ts:116

## Type Parameters

### S

`S`

### RoomType

`RoomType` *extends* keyof [`RoomsOf`](RoomsOf.md)\<`S`\>
