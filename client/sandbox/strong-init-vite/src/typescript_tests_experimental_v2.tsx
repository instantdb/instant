import {
  id,
  do_not_use_init_experimental as core_init_experimental,
  InstaQLQueryParams,
  DoNotUseInstantEntity,
  DoNotUseInstaQLQueryResult,
} from "@instantdb/core";
import { do_not_use_init_experimental as react_init_experimental } from "@instantdb/react";
import { do_not_use_init_experimental as react_native_init_experimental } from "@instantdb/react-native";
import { do_not_use_init_experimental as admin_init_experimental } from "@instantdb/admin";
import schema, { AppSchema } from "../instant.schema.v2";
import { SpecificallyExtends } from "./helpers";

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
  const message = messages[0];
  const messageIsTyped: SpecificallyExtends<
    typeof message,
    { id: string; content: string }
  > = true;

  // transactions
  reactDB.transact(
    reactDB.tx.messages[id()]
      .update({ content: "Hello there!" })
      .link({ creator: "foo" }),
  );

  // to silence ts warnings
  _reactPublishEmoji;
  _reactPresenceUser;
  _reactPresencePeers;
  messageIsTyped;
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
  const message = messages[0];
  const messageIsTyped: SpecificallyExtends<
    typeof message,
    { id: string; content: string }
  > = true;
  // to silence ts warnings
  _reactPublishEmoji;
  _reactPresenceUser;
  _reactPresencePeers;
  messageIsTyped;
}

// ----
// Admin

const adminDB = admin_init_experimental({
  appId: import.meta.env.VITE_INSTANT_APP_ID!,
  adminToken: import.meta.env.VITE_INSTANT_ADMIN_TOKEN!,
  schema,
});

// queries
const adminQueryResult = await adminDB.query({ messages: { creator: {} } });
const message = adminQueryResult.messages[0];
const messageIsTyped: SpecificallyExtends<
  typeof message,
  { id: string; content: string }
> = true;

// transacts
await adminDB.transact(
  adminDB.tx.messages[id()]
    .update({ content: "Hello world" })
    .link({ creator: "foo" }),
);

// to silence ts warnings
ReactNormalApp;
ReactNativeNormalApp;
messageIsTyped;

// ------------
// type helpers

const messagesQuery = {
  messages: {
    creator: {},
  },
} satisfies InstaQLQueryParams<AppSchema>;

type CoreMessage = DoNotUseInstantEntity<AppSchema, "messages">;
let coreMessage: CoreMessage = 1 as any;
coreMessage.content;

type CoreMessageWithCreator = DoNotUseInstantEntity<
  AppSchema,
  "messages",
  { creator: {} }
>;
let coreMessageWithCreator: CoreMessageWithCreator = 1 as any;
const creatorId = coreMessageWithCreator.creator?.id;
const creatorIdIsString: SpecificallyExtends<typeof creatorId, string> = true;

type MessageCreatorResult = DoNotUseInstaQLQueryResult<
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
messagesQuery;
subMessagesWithCreator;
creatorIdIsString;
