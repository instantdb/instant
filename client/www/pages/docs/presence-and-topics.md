---
title: Presence, Cursors, and Activity
---

Sometimes you want to show real-time updates to users without persisting the
data to your database. Common scenarios include:

- Shared cursors in a collaborative whiteboard like Figma
- Who's online in a document editor like Google Docs
- Typing indicators in chat apps like Discord
- Live reactions in a video streaming app like Twitch

Instant provides three primitives for quickly building these ephemeral experiences: rooms, presence, and topics.

**Rooms**

A room represents a temporary context for realtime events. Users in the same room will receive updates from every other user in that room.

**Presence**

Presence is an object that each peer shares with every other peer. When a user updates their presence, it's instantly replicated to all users in that room. Presence persists throughout the remainder of a user's connection, and is automatically cleaned up when a user leaves the room

You can use presence to build features like "who's online." Instant's cursor and typing indicator are both built on top of the presence API.

**Topics**

Topics have "fire and forget" semantics, and are better suited for data that don't need any sort of persistence. When a user publishes a topic, a callback is fired for every other user in the room listening for that topic.

You can use topics to build features like "live reactions." The real-time emoji button panel on Instant's homepage is built using the topics API.

**Transact vs. Ephemeral**

You may be thinking when would I use `transact` vs `presence` vs `topics`? Here's a simple breakdown:

- Use `transact` when you need to persist data to the db. For example, when a user sends a message in a chat app.
- Use `presence` when you need to persist data in a room but not to the db. For example, showing
  who's currently viewing a document.
- Use `topics` when you need to broadcast data to a room, but don't need to persist it. For example, sending a live reaction to a video stream.

## Setup

To obtain a room reference, call `db.room(roomType, roomId)`

```typescript
import { init } from '@instantdb/react';

// Instant app
const APP_ID = '__APP_ID__';

// db will export all the presence hooks you need!
const db = init({ appId: APP_ID });

// Specifying a room type and room id gives you the power to
// restrict sharing to a specific room. However you can also just use
// `db.room()` to share presence and topics to an Instant generated default room
const roomId = 'hacker-chat-room-id';
const room = db.room('chat', roomId);
```

## Typesafety

By default rooms accept any kind of data. However, you can enforce typesafety with a schema:

```typescript
import { init } from '@instantdb/react';
import schema from '../instant.schema.ts';

// Instant app
const APP_ID = '__APP_ID__';

const db = init({ appId: APP_ID, schema });

const roomId = 'hacker-chat-room-id';
// The `room` chat is typed automatically from schema!
const room = db.room('chat', roomId);
```

Here's how we could add typesafety to our `chat` rooms:

```typescript
// instant.schema.ts

import { i } from '@instantdb/core';

const _schema = i.schema({
  // ...
  rooms: {
    // 1. `chat` is the `roomType`
    chat: {
      // 2. Choose what presence looks like here
      presence: i.entity({
        name: i.string(),
        status: i.string(),
      }),
      topics: {
        // 3. You can define payloads for different topics here
        sendEmoji: i.entity({
          emoji: i.string(),
        }),
      },
    },
  },
});

// This helps Typescript display better intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
```

Once you've updated your schema, you'll start seeing types in your intellisense:

{% screenshot src="/img/docs/presence-intellisence.png" /%}

## Presence

One common use case for presence is to show who's online.

Instant's `usePresence` is similar in feel to `useState`. It returns an object containing the current user's presence state, the presence state of every other user in the room, and a function (`publishPresence`) to update the current user's presence. `publishPresence` is similar to React's `setState`, and will merge the current and new presence objects.

```typescript
import { init } from '@instantdb/react';

// Instant app
const APP_ID = "__APP_ID__";
const db = init({ appId: APP_ID });

const room = db.room('chat', 'main');
const randomId = Math.random().toString(36).slice(2, 6);
const user = {
  name: `User#${randomId}`,
};

function App() {
  const { user: myPresence, peers, publishPresence } = room.usePresence();

  // Publish your presence to the room
  useEffect(() => {
    publishPresence({ name: user.name });
  }, []);

  if (!myPresence) {
    return <p>App loading...</p>;
  }

  return (
    <div>
      <h1>Who's online?</h1>
      <p>You are: {myPresence.name}</p>
      <h2>Others:</h2>
      <ul>
      {/* Loop through all peers and render their names. Peers will have the
          same properties as what you publish to the room. In this case, `name`
          is the only property we're publishing. Use RoomSchema to get type
          safety for your presence object.
      */}
        {Object.entries(peers).map(([peerId, peer]) => (
          <li key={peerId}>{peer.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

`usePresence` accepts a second parameter to select specific slices of user's presence object.

```typescript
const room = db.room('chat', 'hacker-chat-room-id');

// We only return the `status` value for each peer
// We will _only_ trigger an update when a user's `status` value changes
const { user, peers, publishPresence } = room.usePresence({
  keys: ['status'],
});
```

You may also specify an array of `peers` and a `user` flag to further constrain the output. If you wanted a "write-only" hook, it would look like this:

```typescript
// Will not trigger re-renders on presence changes
const room = db.room('chat', 'chatRoomId');

const { publishPresence } = room.usePresence({
  peers: [],
  user: false,
});
```

## Topics

Instant provides 2 hooks for sending and handling events for a given topic. `usePublishTopic` returns a function you can call to publish an event, and `useTopicEffect` will be called each time a peer in the same room publishes a topic event.

Here's a live reaction feature using topics. You can also play with it live on [our examples page](https://www.instantdb.com/examples?#5-reactions)

```typescript {% showCopy=true %}
'use client';

import { init } from '@instantdb/react';
import { RefObject, createRef, useRef } from 'react';

// Instant app
const APP_ID = "__APP_ID__";

// Set up room schema
const emoji = {
  fire: '🔥',
  wave: '👋',
  confetti: '🎉',
  heart: '❤️',
} as const;

type EmojiName = keyof typeof emoji;

const db = init({
  appId: APP_ID,
});

const room = db.room('main');

export default function InstantTopics() {
  // Use publishEmoji to broadcast to peers listening to `emoji` events.
  const publishEmoji = room.usePublishTopic('emoji');

  // Use useTopicEffect to listen for `emoji` events from peers
  // and animate their emojis on the screen.
  room.useTopicEffect('emoji', ({ name, directionAngle, rotationAngle }) => {
    if (!emoji[name]) return;

    animateEmoji(
      { emoji: emoji[name], directionAngle, rotationAngle },
      elRefsRef.current[name].current
    );
  });

  const elRefsRef = useRef<{
    [k: string]: RefObject<HTMLDivElement>;
  }>(refsInit);

  return (
    <div className={containerClassNames}>
      <div className="flex gap-4">
        {emojiNames.map((name) => (
          <div className="relative" key={name} ref={elRefsRef.current[name]}>
            <button
              className={emojiButtonClassNames}
              /* We sent an emoji! Let's animate and broadcast it! */
              onClick={() => {
                const params = {
                  name,
                  rotationAngle: Math.random() * 360,
                  directionAngle: Math.random() * 360,
                };

                /* Animate the emoji on our screen */
                animateEmoji(
                  {
                    emoji: emoji[name],
                    rotationAngle: params.rotationAngle,
                    directionAngle: params.directionAngle,
                  },
                  elRefsRef.current[name].current
                );

                /* Broadcast our emoji to our peers! */
                publishEmoji(params);
              }}
            >
              {emoji[name]}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Below are helper functions and styles used to animate the emojis

const emojiNames = Object.keys(emoji) as EmojiName[];

const refsInit = Object.fromEntries(
  emojiNames.map((name) => [name, createRef<HTMLDivElement>()])
);

const containerClassNames =
  'flex h-screen w-screen items-center justify-center overflow-hidden bg-gray-200 select-none';

const emojiButtonClassNames =
  'rounded-lg bg-white p-3 text-3xl shadow-lg transition duration-200 ease-in-out hover:-translate-y-1 hover:shadow-xl';

function animateEmoji(
  config: { emoji: string; directionAngle: number; rotationAngle: number },
  target: HTMLDivElement | null
) {
  if (!target) return;

  const rootEl = document.createElement('div');
  const directionEl = document.createElement('div');
  const spinEl = document.createElement('div');

  spinEl.innerText = config.emoji;
  directionEl.appendChild(spinEl);
  rootEl.appendChild(directionEl);
  target.appendChild(rootEl);

  style(rootEl, {
    transform: `rotate(${config.directionAngle * 360}deg)`,
    position: 'absolute',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    margin: 'auto',
    zIndex: '9999',
    pointerEvents: 'none',
  });

  style(spinEl, {
    transform: `rotateZ(${config.rotationAngle * 400}deg)`,
    fontSize: `40px`,
  });

  setTimeout(() => {
    style(directionEl, {
      transform: `translateY(40vh) scale(2)`,
      transition: 'all 400ms',
      opacity: '0',
    });
  }, 20);

  setTimeout(() => rootEl.remove(), 800);
}

function style(el: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
  Object.assign(el.style, styles);
}
```

## Cursors and Typing Indicators (React only)

We wanted to make adding real-time features to your apps as simple as possible, so we shipped our React library with 2 drop-in utilities: `Cursors` and `useTypingIndicator`.

### Cursors

Adding multiplayer cursors to your app is as simple as importing our `<Cursors>` component!

```typescript {% showCopy=true %}
'use client';

import { init, Cursors } from '@instantdb/react';

// Instant app
const APP_ID = "__APP_ID__";

const db = init({ appId: APP_ID });

const room = db.room("chat", "main");

export default function App() {
  return (
    <Cursors room={room} className="h-full w-full" userCursorColor="tomato">
      <div style={{ width: "100vw", height: "100vh" }}>
        Open two tabs, and move your cursor around!
      </div>
    </Cursors>
  );
}
```

You can provide a `renderCursor` function to return your own custom cursor component.

```typescript
<Cursors
  room={room}
  className="cursors"
  userCursorColor="papayawhip"
  renderCursor={renderCoolCustomCursor}
/>
```

You can render multiple cursor spaces. For instance, imagine you're building a screen with multiple tabs. You want to only show cursors on the same tab as the current user. You can provide each `<Cursors />` element with their own `spaceId`.

```typescript
<Tabs>
  {tabs.map((tab) => (
    <Tab>
      <Cursors room={room} spaceId={`tab-${tab.id}`} className="tab-cursor">
        {/* ... */}
      </Cursors>
    </Tab>
  ))}
</Tabs>
```

### Typing indicators

`useTypingIndicator` is a small utility useful for building inputs for chat-style apps. You can use this hook to show things like "<user> is typing..." in your chat app.

```javascript {% showCopy=true %}
"use client";

import { init } from "@instantdb/react";

// Instant app
const APP_ID = "__APP_ID__";

const db = init({ appId: APP_ID });

const randomId = Math.random().toString(36).slice(2, 6);
const user = {
  name: `User#${randomId}`,
};

const room = db.room("chat", "main");

export default function InstantTypingIndicator() {
  // 1. Publish your presence in the room.
  room.useSyncPresence(user);

  // 2. Use the typing indicator hook
  const typing = room.useTypingIndicator("chat");

  const onKeyDown = (e) => {
    // 3. Render typing indicator
    typing.inputProps.onKeyDown(e);

    // 4. Optionally run your own onKeyDown logic
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      console.log("Message sent:", e.target.value);
    }
  };

  return (
    <div className="flex h-screen gap-3 p-2">
      <div key="main" className="flex flex-1 flex-col justify-end">
        <textarea
          onBlur={typing.inputProps.onBlur}
          onKeyDown={onKeyDown}
          placeholder="Open two tabs and start typing..."
          className="w-full rounded-md border-gray-300 p-2 text-sm"
        />
        <div className="truncate text-xs text-gray-500">
          {typing.active.length ? typingInfo(typing.active) : <>&nbsp;</>}
        </div>
      </div>
    </div>
  );
}

function typingInfo(users) {
  if (users.length === 0) return null;
  if (users.length === 1) return `${users[0].name} is typing...`;
  if (users.length === 2)
    return `${users[0].name} and ${users[1].name} are typing...`;

  return `${users[0].name} and ${users.length - 1} others are typing...`;
}
```
