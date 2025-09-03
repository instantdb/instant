[**@instantdb/react**](../README.md)

***

[@instantdb/react](../packages.md) / InstantReactWebDatabase

# Class: InstantReactWebDatabase\<Schema, Config\>

Defined in: [react/src/InstantReactWebDatabase.ts:4](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactWebDatabase.ts#L4)

## Extends

- [`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md)\<`Schema`, `Config`\>

## Type Parameters

### Schema

`Schema` *extends* [`InstantSchemaDef`](../interfaces/InstantSchemaDef.md)\<`any`, `any`, `any`\>

### Config

`Config` *extends* [`InstantConfig`](../type-aliases/InstantConfig.md)\<`Schema`, `boolean`\> = [`InstantConfig`](../type-aliases/InstantConfig.md)\<`Schema`, `false`\>

## Constructors

### Constructor

```ts
new InstantReactWebDatabase<Schema, Config>(config, versions?): InstantReactWebDatabase<Schema, Config>;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:58](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L58)

#### Parameters

##### config

`Config`

##### versions?

#### Returns

`InstantReactWebDatabase`\<`Schema`, `Config`\>

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`constructor`](InstantReactAbstractDatabase.md#constructor)

## Properties

### \_core

```ts
_core: InstantCoreDatabase<Schema, Config["useDateObjects"]>;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:53](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L53)

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`_core`](InstantReactAbstractDatabase.md#_core)

***

### auth

```ts
auth: Auth;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:51](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L51)

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`auth`](InstantReactAbstractDatabase.md#auth)

***

### rooms

```ts
rooms: object;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:142](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L142)

Hooks for working with rooms

#### usePresence()

```ts
usePresence: <RoomSchema, RoomType, Keys>(room, opts) => PresenceHandle<RoomSchema[RoomType]["presence"], Keys>;
```

Listen for peer's presence data in a room, and publish the current user's presence.

##### Type Parameters

###### RoomSchema

`RoomSchema` *extends* `RoomSchemaShape`

###### RoomType

`RoomType` *extends* `string` \| `number` \| `symbol`

###### Keys

`Keys` *extends* `string` \| `number` \| `symbol`

##### Parameters

###### room

`InstantReactRoom`\<`any`, `RoomSchema`, `RoomType`\>

###### opts

`PresenceOpts`\<`RoomSchema`\[`RoomType`\]\[`"presence"`\], `Keys`\> = `{}`

##### Returns

`PresenceHandle`\<`RoomSchema`\[`RoomType`\]\[`"presence"`\], `Keys`\>

##### See

https://instantdb.com/docs/presence-and-topics

##### Example

```ts
function App({ roomId }) {
   const {
     peers,
     publishPresence
   } = db.room(roomType, roomId).usePresence({ keys: ["name", "avatar"] });

   // ...
 }
```

#### usePublishTopic()

```ts
usePublishTopic: <RoomSchema, RoomType, TopicType>(room, topic) => (data) => void;
```

Broadcast an event to a room.

##### Type Parameters

###### RoomSchema

`RoomSchema` *extends* `RoomSchemaShape`

###### RoomType

`RoomType` *extends* `string` \| `number` \| `symbol`

###### TopicType

`TopicType` *extends* `string` \| `number` \| `symbol`

##### Parameters

###### room

`InstantReactRoom`\<`any`, `RoomSchema`, `RoomType`\>

###### topic

`TopicType`

##### Returns

```ts
(data): void;
```

###### Parameters

###### data

`RoomSchema`\[`RoomType`\]\[`"topics"`\]\[`TopicType`\]

###### Returns

`void`

##### See

https://instantdb.com/docs/presence-and-topics

##### Example

```ts
function App({ roomId }) {
  const room = db.room('chat', roomId);
  const publishTopic = db.rooms.usePublishTopic(room, "emoji");

  return (
    <button onClick={() => publishTopic({ emoji: "🔥" })}>Send emoji</button>
  );
}
```

#### useSyncPresence()

```ts
useSyncPresence: <RoomSchema, RoomType>(room, data, deps?) => void;
```

Publishes presence data to a room

##### Type Parameters

###### RoomSchema

`RoomSchema` *extends* `RoomSchemaShape`

###### RoomType

`RoomType` *extends* `string` \| `number` \| `symbol`

##### Parameters

###### room

`InstantReactRoom`\<`any`, `RoomSchema`, `RoomType`\>

###### data

`Partial`\<`RoomSchema`\[`RoomType`\]\[`"presence"`\]\>

###### deps?

`any`[]

##### Returns

`void`

##### See

https://instantdb.com/docs/presence-and-topics

##### Example

```ts
function App({ roomId, nickname }) {
   const room = db.room('chat', roomId);
   db.rooms.useSyncPresence(room, { nickname });
 }
```

#### useTopicEffect()

```ts
useTopicEffect: <RoomSchema, RoomType, TopicType>(room, topic, onEvent) => void;
```

Listen for broadcasted events given a room and topic.

##### Type Parameters

###### RoomSchema

`RoomSchema` *extends* `RoomSchemaShape`

###### RoomType

`RoomType` *extends* `string` \| `number` \| `symbol`

###### TopicType

`TopicType` *extends* `string` \| `number` \| `symbol`

##### Parameters

###### room

`InstantReactRoom`\<`any`, `RoomSchema`, `RoomType`\>

###### topic

`TopicType`

###### onEvent

(`event`, `peer`) => `any`

##### Returns

`void`

##### See

https://instantdb.com/docs/presence-and-topics

##### Example

```ts
function App({ roomId }) {
   const room = db.room('chats', roomId);
   db.rooms.useTopicEffect(room, 'emoji', (message, peer) => {
     console.log(peer.name, 'sent', message);
   });
   // ...
 }
```

#### useTypingIndicator()

```ts
useTypingIndicator: <RoomSchema, RoomType>(room, inputName, opts) => TypingIndicatorHandle<RoomSchema[RoomType]["presence"]>;
```

Manage typing indicator state

##### Type Parameters

###### RoomSchema

`RoomSchema` *extends* `RoomSchemaShape`

###### RoomType

`RoomType` *extends* `string` \| `number` \| `symbol`

##### Parameters

###### room

`InstantReactRoom`\<`any`, `RoomSchema`, `RoomType`\>

###### inputName

`string`

###### opts

`TypingIndicatorOpts` = `{}`

##### Returns

`TypingIndicatorHandle`\<`RoomSchema`\[`RoomType`\]\[`"presence"`\]\>

##### See

https://instantdb.com/docs/presence-and-topics

##### Example

```ts
function App({ roomId }) {
   const room = db.room('chat', roomId);
   const {
     active,
     setActive,
     inputProps,
   } = db.rooms.useTypingIndicator(room, "chat-input");

   return <input {...inputProps} />;
 }
```

#### See

https://instantdb.com/docs/presence-and-topics

#### Example

```ts
const room = db.room('chat', roomId);
 const { peers } = db.rooms.usePresence(room);
 const publish = db.rooms.usePublishTopic(room, 'emoji');
 // ...
```

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`rooms`](InstantReactAbstractDatabase.md#rooms-1)

***

### SignedIn

```ts
SignedIn: FC<{
  children: ReactNode;
}>;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:388](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L388)

Only render children if the user is signed in.

#### See

https://instantdb.com/docs/auth

#### Example

```ts
<db.SignedIn>
   <MyComponent />
 </db.SignedIn>
```

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`SignedIn`](InstantReactAbstractDatabase.md#signedin)

***

### SignedOut

```ts
SignedOut: FC<{
  children: ReactNode;
}>;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:407](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L407)

Only render children if the user is signed out.

#### See

https://instantdb.com/docs/auth

#### Example

```ts
<db.SignedOut>
   <MyComponent />
 </db.SignedOut>
```

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`SignedOut`](InstantReactAbstractDatabase.md#signedout)

***

### storage

```ts
storage: Storage;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:52](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L52)

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`storage`](InstantReactAbstractDatabase.md#storage)

***

### tx

```ts
tx: TxChunk<Schema>;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:49](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L49)

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`tx`](InstantReactAbstractDatabase.md#tx)

***

### NetworkListener?

```ts
static optional NetworkListener: any;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:56](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L56)

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`NetworkListener`](InstantReactAbstractDatabase.md#networklistener)

***

### Storage?

```ts
static optional Storage: any;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:55](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L55)

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`Storage`](InstantReactAbstractDatabase.md#storage-1)

## Methods

### getAuth()

```ts
getAuth(): Promise<User>;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:303](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L303)

One time query for the logged in state. This is useful
for scenarios where you want to know the current auth
state without subscribing to changes.

#### Returns

`Promise`\<[`User`](../type-aliases/User.md)\>

#### See

https://instantdb.com/docs/auth

#### Example

```ts
const user = await db.getAuth();
  console.log('logged in as', user.email)
```

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`getAuth`](InstantReactAbstractDatabase.md#getauth)

***

### getLocalId()

```ts
getLocalId(name): Promise<string>;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:80](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L80)

Returns a unique ID for a given `name`. It's stored in local storage,
so you will get the same ID across sessions.

This is useful for generating IDs that could identify a local device or user.

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`string`\>

#### Example

```ts
const deviceId = await db.getLocalId('device');
```

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`getLocalId`](InstantReactAbstractDatabase.md#getlocalid)

***

### queryOnce()

```ts
queryOnce<Q>(query, opts?): Promise<{
  data: InstaQLResponse<Schema, Q, Config["useDateObjects"]>;
  pageInfo: PageInfoResponse<Q>;
}>;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:368](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L368)

Use this for one-off queries.
Returns local data if available, otherwise fetches from the server.
Because we want to avoid stale data, this method will throw an error
if the user is offline or there is no active connection to the server.

#### Type Parameters

##### Q

`Q` *extends* [`InstaQLParams`](../type-aliases/InstaQLParams.md)\<[`InstantSchemaDef`](../interfaces/InstantSchemaDef.md)\<`any`, `any`, `any`\>\>

#### Parameters

##### query

`Q`

##### opts?

`InstaQLOptions`

#### Returns

`Promise`\<\{
  `data`: `InstaQLResponse`\<`Schema`, `Q`, `Config`\[`"useDateObjects"`\]\>;
  `pageInfo`: `PageInfoResponse`\<`Q`\>;
\}\>

#### See

https://instantdb.com/docs/instaql

#### Example

```ts
const resp = await db.queryOnce({ goals: {} });
 console.log(resp.data.goals)
```

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`queryOnce`](InstantReactAbstractDatabase.md#queryonce)

***

### room()

```ts
room<RoomType>(type, id): InstantReactRoom<Schema, RoomsOf<Schema>, RoomType>;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:124](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L124)

Obtain a handle to a room, which allows you to listen to topics and presence data

If you don't provide a `type` or `id`, Instant will default to `_defaultRoomType` and `_defaultRoomId`
as the room type and id, respectively.

#### Type Parameters

##### RoomType

`RoomType` *extends* `string` \| `number` \| `symbol`

#### Parameters

##### type

`RoomType` = `...`

##### id

`string` = `'_defaultRoomId'`

#### Returns

`InstantReactRoom`\<`Schema`, [`RoomsOf`](../type-aliases/RoomsOf.md)\<`Schema`\>, `RoomType`\>

#### See

https://instantdb.com/docs/presence-and-topics

#### Example

```ts
const room = db.room('chat', roomId);
 const { peers } = db.rooms.usePresence(room);
```

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`room`](InstantReactAbstractDatabase.md#room)

***

### transact()

```ts
transact(chunks): Promise<TransactionResult>;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:167](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L167)

Use this to write data! You can create, update, delete, and link objects

#### Parameters

##### chunks

[`TransactionChunk`](../interfaces/TransactionChunk.md)\<`any`, `any`\> | [`TransactionChunk`](../interfaces/TransactionChunk.md)\<`any`, `any`\>[]

#### Returns

`Promise`\<`TransactionResult`\>

#### See

https://instantdb.com/docs/instaml

#### Example

```ts
// Create a new object in the `goals` namespace
  const goalId = id();
  db.transact(db.tx.goals[goalId].update({title: "Get fit"}))

  // Update the title
  db.transact(db.tx.goals[goalId].update({title: "Get super fit"}))

  // Delete it
  db.transact(db.tx.goals[goalId].delete())

  // Or create an association:
  todoId = id();
  db.transact([
   db.tx.todos[todoId].update({ title: 'Go on a run' }),
   db.tx.goals[goalId].link({todos: todoId}),
 ])
```

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`transact`](InstantReactAbstractDatabase.md#transact)

***

### useAuth()

```ts
useAuth(): AuthState;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:235](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L235)

Listen for the logged in state. This is useful
for deciding when to show a login screen.

Check out the docs for an example `Login` component too!

#### Returns

[`AuthState`](../type-aliases/AuthState.md)

#### See

https://instantdb.com/docs/auth

#### Example

```ts
function App() {
   const { isLoading, user, error } = db.useAuth()
   if (isLoading) {
     return <div>Loading...</div>
   }
   if (error) {
     return <div>Uh oh! {error.message}</div>
   }
   if (user) {
     return <Main user={user} />
   }
   return <Login />
 }
```

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`useAuth`](InstantReactAbstractDatabase.md#useauth)

***

### useConnectionStatus()

```ts
useConnectionStatus(): ConnectionStatus;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:329](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L329)

Listen for connection status changes to Instant. Use this for things like
showing connection state to users

#### Returns

[`ConnectionStatus`](../type-aliases/ConnectionStatus.md)

#### See

https://www.instantdb.com/docs/patterns#connection-status

#### Example

```ts
function App() {
   const status = db.useConnectionStatus()
   const connectionState =
     status === 'connecting' || status === 'opened'
       ? 'authenticating'
     : status === 'authenticated'
       ? 'connected'
     : status === 'closed'
       ? 'closed'
     : status === 'errored'
       ? 'errored'
     : 'unexpected state';

   return <div>Connection state: {connectionState}</div>
 }
```

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`useConnectionStatus`](InstantReactAbstractDatabase.md#useconnectionstatus)

***

### useLocalId()

```ts
useLocalId(name): string;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:95](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L95)

A hook that returns a unique ID for a given `name`. localIds are
stored in local storage, so you will get the same ID across sessions.

Initially returns `null`, and then loads the localId.

#### Parameters

##### name

`string`

#### Returns

`string`

#### Example

```ts
const deviceId = db.useLocalId('device');
if (!deviceId) return null; // loading
console.log('Device ID:', deviceId)
```

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`useLocalId`](InstantReactAbstractDatabase.md#uselocalid)

***

### useQuery()

```ts
useQuery<Q>(query, opts?): InstaQLLifecycleState<Schema, Q, Config["useDateObjects"]>;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:197](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L197)

Use this to query your data!

#### Type Parameters

##### Q

`Q` *extends* [`InstaQLParams`](../type-aliases/InstaQLParams.md)\<[`InstantSchemaDef`](../interfaces/InstantSchemaDef.md)\<`any`, `any`, `any`\>\>

#### Parameters

##### query

`Q`

##### opts?

`InstaQLOptions`

#### Returns

`InstaQLLifecycleState`\<`Schema`, `Q`, `Config`\[`"useDateObjects"`\]\>

#### See

https://instantdb.com/docs/instaql

#### Example

```ts
// listen to all goals
  const { isLoading, error, data } = db.useQuery({ goals: {} });

  // goals where the title is "Get Fit"
  const { isLoading, error, data } = db.useQuery({
    goals: { $: { where: { title: 'Get Fit' } } },
  });

  // all goals, _alongside_ their todos
  const { isLoading, error, data } = db.useQuery({
    goals: { todos: {} },
  });

  // skip if `user` is not logged in
  const { isLoading, error, data } = db.useQuery(
    auth.user ? { goals: {} } : null,
  );
```

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`useQuery`](InstantReactAbstractDatabase.md#usequery)

***

### useUser()

```ts
useUser(): User;
```

Defined in: [react/src/InstantReactAbstractDatabase.tsx:283](https://github.com/instantdb/instant/blob/08c469b2e32b424ee675d98f809302a6adacee95/client/packages/react/src/InstantReactAbstractDatabase.tsx#L283)

Subscribe to the currently logged in user.
If the user is not logged in, this hook with throw an Error.
You will want to protect any calls of this hook with a
<db.SignedIn> component, or your own logic based on db.useAuth()

#### Returns

[`User`](../type-aliases/User.md)

#### See

https://instantdb.com/docs/auth

#### Throws

Error indicating user not signed in

#### Example

```ts
function UserDisplay() {
   const user = db.useUser()
   return <div>Logged in as: {user.email}</div>
 }

 <db.SignedIn>
   <UserDisplay />
 </db.SignedIn>
```

#### Inherited from

[`InstantReactAbstractDatabase`](InstantReactAbstractDatabase.md).[`useUser`](InstantReactAbstractDatabase.md#useuser)
