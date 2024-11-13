import {
  id,
  init_experimental_v2 as core_init_experimental,
  InstaQLQueryParams,
  InstantEntityExperimental,
  InstaQLQueryResultExperimental,
} from "@instantdb/core";
import { init_experimental_v2 as react_init_experimental } from "@instantdb/react";
import { init_experimental_v2 as react_native_init_experimental } from "@instantdb/react-native";
import { init_experimental_v2 as admin_init_experimental } from "@instantdb/admin";
import schema, { AppSchema } from "../instant.schema.v2";

// ----
// Core

const coreDB = core_init_experimental({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
  schema,
});

// rooms
const coreRoom = coreDB.joinRoom("chat");
coreRoom.getPresence({});

coreRoom.publishTopic("emoji", {
  name: "confetti",
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
  .update({ content: "Hello world" })
  .link({ creator: "foo" });

// ----
// React

const reactDB = react_init_experimental({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
  schema,
});

function ReactNormalApp() {
  // rooms
  const reactRoom = reactDB.room("chat");
  const reactPresence = reactRoom.usePresence({ keys: ["name"] });
  const _reactPublishEmoji = reactRoom.usePublishTopic("emoji");
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
      .update({ content: "Hello there!" })
      .link({ creator: "foo" }),
  );

  // to silence ts warnings
  ((..._args) => {})(
    _reactPublishEmoji,
    _reactPresenceUser,
    _reactPresencePeers,
    messages,
  );
}

// ----
// React-Native

const reactNativeDB = react_native_init_experimental({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
  schema: schema,
});

function ReactNativeNormalApp() {
  // rooms
  const reactRoom = reactNativeDB.room("chat");
  const reactPresence = reactRoom.usePresence({ keys: ["name"] });
  const _reactPublishEmoji = reactRoom.usePublishTopic("emoji");
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

// ----
// Admin

const adminDB = admin_init_experimental({
  appId: import.meta.env.VITE_INSTANT_APP_ID!,
  adminToken: import.meta.env.VITE_INSTANT_ADMIN_TOKEN!,
  schema: schema,
});

// queries
const adminQueryResult = await adminDB.query({ messages: { creator: {} } });
adminQueryResult.messages[0].content;

// transacts
await adminDB.transact(
  adminDB.tx.messages[id()]
    .update({ content: "Hello world" })
    .link({ creator: "foo" }),
);

// to silence ts warnings
export { ReactNormalApp, ReactNativeNormalApp };

// ------------
// type helpers

const messagesQuery: InstaQLQueryParams<AppSchema> = {
  messages: {
    creator: {},
  },
};

type CoreMessage = InstantEntityExperimental<AppSchema, "messages">;
let coreMessage: CoreMessage = 1 as any;
coreMessage.content;

type CoreMessageWithCreator = InstantEntityExperimental<
  AppSchema,
  "messages",
  { creator: {} }
>;
let coreMessageWithCreator: CoreMessageWithCreator = 1 as any;
coreMessageWithCreator.creator?.id;

type MessageCreatorResult = InstaQLQueryResultExperimental<
  AppSchema,
  InstaQLQueryParams<AppSchema>
>;
function subMessagesWithCreator(
  resultCB: (data: MessageCreatorResult) => void,
) {
  coreDB.subscribeQuery(messagesQuery, (result) => {
    if (result.data) {
      resultCB(result.data);
    }
  });
}

// to silence ts warnings
((..._args) => {})(messagesQuery, subMessagesWithCreator);
