import {
  id,
  init as core_init,
  InstaQLParams,
  InstaQLEntity,
  InstaQLResult,
} from "@instantdb/core";
import { init as react_init } from "@instantdb/react";
import { init as react_native } from "@instantdb/react-native";
import { init as admin_init } from "@instantdb/admin";
import schema, { AppSchema } from "../instant.schema.v2";

// ----
// Core

const coreDB = core_init({
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
  const message = messages[0];
  message.content;
  message.creator?.email;
});

// transactions
coreDB.tx.messages[id()]
  .update({ content: "Hello world" })
  .link({ creator: "foo" });

// ----
// React

const reactDB = react_init({
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
  const { isLoading, error, data } = reactDB.useQuery({
    messages: { creator: {} },
  });
  if (isLoading || error) {
    return null;
  }
  const { messages } = data;
  const message = messages[0];
  message.content;
  message.creator?.email;

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
}

// ----
// React-Native

const reactNativeDB = react_native({
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
    messages: { creator: {} },
  });
  if (isLoading || error) {
    return null;
  }
  const { messages } = data;
  const message = messages[0];
  message.content;
  message.creator?.email;
  // to silence ts warnings
  _reactPublishEmoji;
  _reactPresenceUser;
  _reactPresencePeers;
}

// ----
// Admin

const adminDB = admin_init({
  appId: import.meta.env.VITE_INSTANT_APP_ID!,
  adminToken: import.meta.env.VITE_INSTANT_ADMIN_TOKEN!,
  schema,
});

// queries
const adminQueryResult = await adminDB.query({ messages: { creator: {} } });
const message = adminQueryResult.messages[0];
message.content;
message.creator?.email;
// transacts
await adminDB.transact(
  adminDB.tx.messages[id()]
    .update({ content: "Hello world" })
    .link({ creator: "foo" }),
);

// to silence ts warnings
ReactNormalApp;
ReactNativeNormalApp;

// ------------
// type helpers

const messagesQuery = {
  messages: {
    creator: {},
  },
} satisfies InstaQLParams<AppSchema>;

type CoreMessage = InstaQLEntity<AppSchema, "messages">;
let coreMessage: CoreMessage = 1 as any;
coreMessage.content;

type CoreMessageWithCreator = InstaQLEntity<
  AppSchema,
  "messages",
  { creator: {} }
>;
let coreMessageWithCreator: CoreMessageWithCreator = 1 as any;
coreMessageWithCreator.content;
coreMessageWithCreator.creator?.email;

type MessageCreatorResult = InstaQLResult<AppSchema, InstaQLParams<AppSchema>>;
function subMessagesWithCreator(
  resultCB: (data: MessageCreatorResult) => void,
) {
  coreDB.subscribeQuery(messagesQuery, (result) => {
    if (result.data) {
      resultCB(result.data);
    }
  });
}

// Test that the `Q` bit is typed
type DeeplyNestedQueryWorks = InstaQLEntity<
  AppSchema,
  "messages",
  { creator: { createdMessages: { creator: {} } } }
>;
let deeplyNestedQuery: DeeplyNestedQueryWorks = 1 as any;
deeplyNestedQuery.creator?.createdMessages[0].creator?.email;

type DeeplyNestedQueryWillFailsBadInput = InstaQLEntity<
  AppSchema,
  "messages",
  // Type '{ foo: {}; }' has no properties in common with type 'InstaQLSubqueryParams<AppSchema, "messages">'
  // @ts-expect-error
  { creator: { createdMessages: { foo: {} } } }
>;
let deeplyNestedQueryFailed: DeeplyNestedQueryWillFailsBadInput = 1 as any;

type DeeplyNestedResultWorks = InstaQLResult<
  AppSchema,
  {
    messages: {
      $: {
        limit: 10;
      };
      creator: {
        createdMessages: {
          creator: {};
        };
      };
    };
  }
>;
let deeplyNestedResult: DeeplyNestedResultWorks = 1 as any;
deeplyNestedQuery.creator?.createdMessages[0].creator?.email;

type DeeplyNestedResultFailsBadInput = InstaQLResult<
  AppSchema,
  // @ts-expect-error
  {
    messages: {
      creator: {
        createdMessages: {
          // Type '{ foo: {}; }' is not assignable to type
          // '$Option | ($Option & InstaQLQuerySubqueryParams<AppSchema, "messages">)
          // | undefined'
          foo: {};
        };
      };
    };
  }
>;
let deeplyNestedResultFailed: DeeplyNestedResultFailsBadInput = 1 as any;

// to silence ts warnings
deeplyNestedQueryFailed;
deeplyNestedResultFailed;
messagesQuery;
subMessagesWithCreator;
deeplyNestedQuery;
deeplyNestedResult;
