import {
  id,
  init_experimental as core_init_experimental,
  InstaQLParams,
  InstaQLEntity,
  InstaQLResult,
  InstantUnknownSchema,
} from "@instantdb/core";
import { init_experimental as react_init_experimental } from "@instantdb/react";
import { init_experimental as react_native_init_experimental } from "@instantdb/react-native";
import { init_experimental as admin_init_experimental } from "@instantdb/admin";

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
  post.id;
  post.comments[0].id;
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
  post.id;
  post.comments[0].id;

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
  post.id;
  post.comments[0].id;

  // to silence ts warnings
  _reactPublishEmoji;
  _reactPresenceUser;
  _reactPresencePeers;
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

const postsQuery = {
  posts: {
    comments: {},
  },
} satisfies InstaQLParams<InstantUnknownSchema>;

type CorePost = InstaQLEntity<InstantUnknownSchema, "messages">;
let coreMessage: CorePost = 1 as any;
coreMessage.id;

type CorePostWithCreator = InstaQLEntity<
  InstantUnknownSchema,
  "messages",
  { creator: {} }
>;
let coreMessageWithCreator: CorePostWithCreator = 1 as any;
coreMessageWithCreator.creator[0].id;

type MessageCreatorResult = InstaQLResult<
  InstantUnknownSchema,
  typeof postsQuery
>;

function subMessagesWithCreator(
  resultCB: (data: MessageCreatorResult) => void,
) {
  coreDB.subscribeQuery(postsQuery, (result) => {
    if (result.data) {
      resultCB(result.data);
    }
  });
}

// to silence ts warnings
postsQuery;
subMessagesWithCreator;
