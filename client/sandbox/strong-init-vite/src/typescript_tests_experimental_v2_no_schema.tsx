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
import { SpecificallyExtends } from "./helpers";

// ----
// Core

const coreDB = core_init_experimental({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
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
coreDB.subscribeQuery({ posts: { comments: {} } }, (result) => {
  if (result.error) {
    return;
  }
  const { posts } = result.data;
  const post = posts[0];
  const postHasId: SpecificallyExtends<typeof post, { id: string }> = true;
  const comments = post.comments[0];
  const commentsHasId: SpecificallyExtends<typeof comments, { id: string }> =
    true;
  // to silence ts warnings
  postHasId;
  commentsHasId;
});

// transactions
coreDB.tx.posts[id()]
  .update({ title: "Hello world", num: 1 })
  .link({ creator: "foo" });

// ----
// React

const reactDB = react_init_experimental({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
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
    posts: { comments: {} },
  });
  if (isLoading || error) {
    return null;
  }
  const { posts } = data;
  const post = posts[0];
  const postHasId: SpecificallyExtends<typeof post, { id: string }> = true;
  const comments = post.comments[0];
  const commentsHasId: SpecificallyExtends<typeof comments, { id: string }> =
    true;

  // transactions
  reactDB.transact(
    reactDB.tx.messages[id()]
      .update({ content: "Hello there!" })
      .link({ creator: "foo" }),
  );

  // to silence ts warnings
  postHasId;
  commentsHasId;
  _reactPublishEmoji;
  _reactPresenceUser;
  _reactPresencePeers;
}

// ----
// React-Native

const reactNativeDB = react_native_init_experimental({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
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
    posts: { comments: {} },
  });
  if (isLoading || error) {
    return null;
  }
  const { posts } = data;
  const post = posts[0];
  const postHasId: SpecificallyExtends<typeof post, { id: string }> = true;
  const comments = post.comments[0];
  const commentsHasId: SpecificallyExtends<typeof comments, { id: string }> =
    true;

  // to silence ts warnings
  _reactPublishEmoji;
  _reactPresenceUser;
  _reactPresencePeers;
  postHasId;
  commentsHasId;
}

// ----
// Admin

const adminDB = admin_init_experimental({
  appId: import.meta.env.VITE_INSTANT_APP_ID!,
  adminToken: import.meta.env.VITE_INSTANT_ADMIN_TOKEN!,
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

const messagesQuery: InstaQLQueryParams<DoNotUseUnknownSchema> = {
  messages: {
    creator: {},
  },
};

type CoreMessage = DoNotUseInstantEntity<DoNotUseUnknownSchema, "messages">;
let coreMessage: CoreMessage = 1 as any;
coreMessage.content;

type CoreMessageWithCreator = DoNotUseInstantEntity<
  DoNotUseUnknownSchema,
  "messages",
  { creator: {} }
>;
let coreMessageWithCreator: CoreMessageWithCreator = 1 as any;
coreMessageWithCreator.creator?.id;

type MessageCreatorResult = DoNotUseInstaQLQueryResult<
  DoNotUseUnknownSchema,
  InstaQLQueryParams<DoNotUseUnknownSchema>
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
