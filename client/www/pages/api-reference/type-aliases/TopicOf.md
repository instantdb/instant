[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / TopicOf

# Type Alias: TopicOf\<S, RoomType, TopicType\>

```ts
type TopicOf<S, RoomType, TopicType> = TopicsOf<S, RoomType>[TopicType];
```

Defined in: core/dist/esm/schemaTypes.d.ts:119

## Type Parameters

### S

`S`

### RoomType

`RoomType` *extends* keyof [`RoomsOf`](RoomsOf.md)\<`S`\>

### TopicType

`TopicType` *extends* keyof [`TopicsOf`](TopicsOf.md)\<`S`, `RoomType`\>
