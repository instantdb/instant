import {
  id,
  init as core_init,
  init_experimental as _a,
  BackwardsCompatibleSchema,
} from '@instantdb/core';
import { init as react_init, init_experimental as _b } from '@instantdb/react';
import {
  init as react_native_init,
  init_experimental as _c,
} from '@instantdb/react-native';
import { init as admin_init, init_experimental as _d } from '@instantdb/admin';

type Message = {
  content: string;
};

type User = {
  email: string;
};

type Schema = {
  messages: Message;
  creator: User;
};

type EmojiName = 'fire' | 'wave' | 'confetti' | 'heart';

type Rooms = {
  chat: {
    presence: {
      name: string;
      avatarURI: string;
    };
    topics: {
      emoji: {
        name: EmojiName;
        rotationAngle: number;
        directionAngle: number;
      };
    };
  };
};

type SchemaDef = BackwardsCompatibleSchema<Schema, Rooms>;

// ----
// Core

const coreDB = core_init<SchemaDef>({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
});

// rooms
const coreRoom = coreDB.joinRoom('chat');
coreRoom.getPresence({});
coreRoom.publishTopic('emoji', {
  name: 'confetti',
  rotationAngle: 0,
  directionAngle: 0,
});

// queries
coreDB.subscribeQuery({ messages: { creator: {} } }, (result) => {
  if (result.error) {
    return;
  }
  const { messages } = result.data;
  messages[0].content;
});

// transactions
coreDB.tx.messages[id()]
  .update({ content: 'Hello world' })
  .link({ creator: 'foo' });

// ----
// React

const reactDB = react_init<SchemaDef>({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
});

function ReactNormalApp() {
  // rooms
  const reactRoom = reactDB.room('chat');
  const reactPresence = reactRoom.usePresence({ keys: ['name'] });
  const _reactPublishEmoji = reactRoom.usePublishTopic('emoji');
  const _reactPresenceUser = reactPresence.user!;
  const _reactPresencePeers = reactPresence.peers!;
  _reactPresenceUser.name;
  _reactPresencePeers[0].name;

  const reactPresenceNew = reactDB.rooms.usePresence(reactRoom, {
    keys: ['name'],
  });
  const _reactPublishEmojiNew = reactDB.rooms.usePublishTopic(
    reactRoom,
    'emoji',
  );
  const _reactPresenceUserNew = reactPresenceNew.user!;
  const _reactPresencePeersNew = reactPresenceNew.peers!;
  _reactPresenceUserNew.name;
  _reactPresencePeersNew[0].name;

  // queries
  const { isLoading, error, data } = reactDB.useQuery({ messages: {} });
  if (isLoading || error) {
    return null;
  }
  const { messages } = data;
  messages[0].content;
  // transactions
  reactDB.transact(
    reactDB.tx.messages[id()]
      .update({ content: 'Hello world' })
      .link({ creator: 'foo' }),
  );

  // to silence ts warnings
  _reactPublishEmoji;
  _reactPresenceUser;
  _reactPresencePeersNew;
  _reactPublishEmojiNew;
  _reactPresenceUserNew;
  _reactPresencePeersNew;
  messages;
}

// ----
// React-Native

const reactNativeDB = react_native_init<SchemaDef>({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
});

function ReactNativeNormalApp() {
  // rooms
  const reactRoom = reactNativeDB.room('chat');
  const reactPresence = reactRoom.usePresence({ keys: ['name'] });
  const _reactPublishEmoji = reactRoom.usePublishTopic('emoji');
  const _reactPresenceUser = reactPresence.user!;
  const _reactPresencePeers = reactPresence.peers!;
  _reactPresenceUser.name;
  _reactPresencePeers[0].name;

  const reactPresenceNew = reactNativeDB.rooms.usePresence(reactRoom, {
    keys: ['name'],
  });
  const _reactPublishEmojiNew = reactNativeDB.rooms.usePublishTopic(
    reactRoom,
    'emoji',
  );
  const _reactPresenceUserNew = reactPresenceNew.user!;
  const _reactPresencePeersNew = reactPresenceNew.peers!;
  _reactPresenceUserNew.name;
  _reactPresencePeersNew[0].name;

  // queries
  const { isLoading, error, data } = reactNativeDB.useQuery({
    messages: {},
  });
  if (isLoading || error) {
    return null;
  }
  const { messages } = data;
  messages[0].content;
  // to silence ts warnings
  _reactPublishEmoji;
  _reactPresenceUser;
  _reactPresencePeers;
  _reactPublishEmojiNew;
  _reactPresenceUserNew;
  _reactPresencePeersNew;
  messages;
}

// ----
// Admin

const adminDB = admin_init<SchemaDef>({
  appId: import.meta.env.VITE_INSTANT_APP_ID!,
  adminToken: import.meta.env.VITE_INSTANT_ADMIN_TOKEN!,
});

// queries
const adminQueryResult = await adminDB.query({ messages: { creator: {} } });
adminQueryResult.messages[0].content;

// transacts
await adminDB.transact(
  adminDB.tx.messages[id()]
    .update({ content: 'Hello world' })
    .link({ creator: 'foo' }),
);

// to silence ts warnings
export { ReactNormalApp, ReactNativeNormalApp };
