import {
  id,
  init as core_init,
  InstantQuery,
  InstantEntity,
  InstantQueryResult,
  InstantSchema,
  InstantSchemaDatabase,
} from '@instantdb/core';
import { init as react_init } from '@instantdb/react';
import { init as react_native_init } from '@instantdb/react-native';
import { init as admin_init } from '@instantdb/admin';
import graph from '../instant.schema';

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

// ----
// Core

const coreDB = core_init({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
  schema: graph.withRoomSchema<Rooms>(),
});
type CoreSchema = InstantSchema<typeof coreDB>;
const coreSchema: CoreSchema = graph.withRoomSchema<Rooms>();

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

// type helpers
type CoreDB = typeof coreDB;
const s = graph.withRoomSchema<Rooms>();
type FromSchemaDatabase = InstantSchemaDatabase<typeof s>;
const fromSchemaDBWorks: FromSchemaDatabase = coreDB;

const coreMessagesQuery = {
  messages: {
    creator: {},
  },
} satisfies InstantQuery<CoreDB>;

type CoreMessage = InstantEntity<CoreDB, 'messages'>;
let coreMessage: CoreMessage = 1 as any;
coreMessage.content;

type CoreMessageWithCreator = InstantEntity<
  CoreDB,
  'messages',
  { creator: {} }
>;
let coreMessageWithCreator: CoreMessageWithCreator = 1 as any;
coreMessageWithCreator.creator?.id;

type MessageCreatorResult = InstantQueryResult<
  CoreDB,
  typeof coreMessagesQuery
>;
function subMessagesWithCreator(
  resultCB: (data: MessageCreatorResult) => void,
) {
  coreDB.subscribeQuery(coreMessagesQuery, (result) => {
    if (result.data) {
      result.data.messages[0].creator?.email;
      resultCB(result.data);
    }
  });
}

// to silence ts warnings
coreMessagesQuery;
subMessagesWithCreator;
coreSchema;
fromSchemaDBWorks;

// // ----
// // React

const reactDB = react_init({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
  schema: graph.withRoomSchema<Rooms>(),
});

function ReactNormalApp() {
  // rooms
  const reactRoom = reactDB.room('chat');
  const reactPresence = reactRoom.usePresence({ keys: ['name'] });
  const _reactPublishEmoji = reactRoom.usePublishTopic('emoji');
  const _reactPresenceUser = reactPresence.user!;
  const _reactPresencePeers = reactPresence.peers!;
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
      .update({ content: 'Hello there!' })
      .link({ creator: 'foo' }),
  );

  // to silence ts warnings
  _reactPublishEmoji;
  _reactPresenceUser;
  _reactPresencePeers;
  messages;
}

// type helpers
type ReactDB = typeof reactDB;
type ReactSchema = InstantSchema<typeof reactDB>;
const reactSchema: ReactSchema = graph.withRoomSchema<Rooms>();

const reactMessagesQuery = {
  messages: {
    creator: {},
  },
} satisfies InstantQuery<ReactDB>;

type ReactMessage = InstantEntity<ReactDB, 'messages'>;
let reactMessage: ReactMessage = 1 as any;
reactMessage.content;

type ReactMessageWithCreator = InstantEntity<
  ReactDB,
  'messages',
  { creator: {} }
>;
let reactMessageWithCreator: ReactMessageWithCreator = 1 as any;
reactMessageWithCreator.creator?.id;

type ReactMessageCreatorResult = InstantQueryResult<
  ReactDB,
  typeof reactMessagesQuery
>;
function useMessagesWithCreator(): ReactMessageCreatorResult | undefined {
  const result = reactDB.useQuery(reactMessagesQuery);
  return result.data;
}

// to silence ts warnings
reactMessagesQuery;
useMessagesWithCreator;
reactSchema;

// ----
// React-Native

const reactNativeDB = react_native_init({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
  schema: graph.withRoomSchema<Rooms>(),
});

function ReactNativeNormalApp() {
  // rooms
  const reactRoom = reactNativeDB.room('chat');
  const reactPresence = reactRoom.usePresence({ keys: ['name'] });
  const _reactPublishEmoji = reactRoom.usePublishTopic('emoji');
  const _reactPresenceUser = reactPresence.user!;
  const _reactPresencePeers = reactPresence.peers!;
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
  ((..._args) => {})(
    _reactPublishEmoji,
    _reactPresenceUser,
    _reactPresencePeers,
    messages,
  );
}

// type helpers
type ReactNativeDB = typeof reactNativeDB;
type ReactNativeSchema = InstantSchema<typeof reactNativeDB>;
const rnSchema: ReactNativeSchema = graph.withRoomSchema<Rooms>();

const reactNativeMessagesQuery = {
  messages: {
    creator: {},
  },
} satisfies InstantQuery<ReactNativeDB>;

type ReactNativeMessage = InstantEntity<ReactNativeDB, 'messages'>;
let reactNativeMessage: ReactNativeMessage = 1 as any;
reactNativeMessage.content;

type ReactNativeMessageWithCreator = InstantEntity<
  ReactNativeDB,
  'messages',
  { creator: {} }
>;
let reactNativeMessageWithCreator: ReactNativeMessageWithCreator = 1 as any;
reactNativeMessageWithCreator.creator?.id;

type ReactNativeMessageCreatorResult = InstantQueryResult<
  ReactNativeDB,
  typeof reactNativeMessagesQuery
>;
function useMessagesWithCreatorRN():
  | ReactNativeMessageCreatorResult
  | undefined {
  const result = reactNativeDB.useQuery(reactNativeMessagesQuery);
  return result.data;
}

// to silence ts warnings
reactNativeMessagesQuery;
useMessagesWithCreatorRN;
rnSchema;

// ----
// Admin

const adminDB = admin_init({
  appId: import.meta.env.VITE_INSTANT_APP_ID!,
  adminToken: import.meta.env.VITE_INSTANT_ADMIN_TOKEN!,
  schema: graph,
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

// type helpers
type AdminDB = typeof adminDB;
const adminMessagesQuery = {
  messages: {
    creator: {},
  },
} satisfies InstantQuery<AdminDB>;

type AdminMessage = InstantEntity<AdminDB, 'messages'>;
let adminMessage: AdminMessage = 1 as any;
adminMessage.content;

type AdminMessageWithCreator = InstantEntity<
  AdminDB,
  'messages',
  { creator: {} }
>;
let adminMessageWithCreator: AdminMessageWithCreator = 1 as any;
adminMessageWithCreator.creator?.id;

type AdminMessageCreatorResult = InstantQueryResult<
  AdminDB,
  typeof adminMessagesQuery
>;

async function getMessagesWithCreator(): Promise<AdminMessageCreatorResult> {
  const result = await adminDB.query(adminMessagesQuery);
  return result;
}

// to silence ts warnings
((..._args) => {})(adminMessagesQuery, getMessagesWithCreator);

// to silence ts warnings
export { ReactNormalApp, ReactNativeNormalApp };
