[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / RoomHandle

# Type Alias: RoomHandle\<PresenceShape, TopicsByKey\>

```ts
type RoomHandle<PresenceShape, TopicsByKey> = object;
```

Defined in: core/dist/esm/index.d.ts:55

## Type Parameters

### PresenceShape

`PresenceShape`

### TopicsByKey

`TopicsByKey`

## Properties

### getPresence

```ts
getPresence: GetPresence<PresenceShape>;
```

Defined in: core/dist/esm/index.d.ts:60

***

### leaveRoom()

```ts
leaveRoom: () => void;
```

Defined in: core/dist/esm/index.d.ts:56

#### Returns

`void`

***

### publishPresence()

```ts
publishPresence: (data) => void;
```

Defined in: core/dist/esm/index.d.ts:59

#### Parameters

##### data

`Partial`\<`PresenceShape`\>

#### Returns

`void`

***

### publishTopic

```ts
publishTopic: PublishTopic<TopicsByKey>;
```

Defined in: core/dist/esm/index.d.ts:57

***

### subscribePresence

```ts
subscribePresence: SubscribePresence<PresenceShape>;
```

Defined in: core/dist/esm/index.d.ts:61

***

### subscribeTopic

```ts
subscribeTopic: SubscribeTopic<PresenceShape, TopicsByKey>;
```

Defined in: core/dist/esm/index.d.ts:58
