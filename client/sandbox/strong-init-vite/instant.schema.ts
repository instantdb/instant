import { i } from "@instantdb/react";

const _graph = i.graph(
  {
    messages: i.entity({
      content: i.string(),
    }),
    profiles: i.entity({
      name: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
  },
  {
    messageCreator: {
      forward: {
        on: "messages",
        has: "one",
        label: "creator",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "createdMessages",
      },
    },
    messageProfile: {
      forward: {
        on: "messages",
        has: "one",
        label: "profile",
      },
      reverse: {
        on: "profiles",
        has: "many",
        label: "messages",
      },
    },
  },
);

type _Graph = typeof _graph;

export interface Graph extends _Graph {}
const graph: Graph = _graph;
export default graph;
