import { i } from "@instantdb/react";

const graph = i.graph(
  {
    messages: i.entity({
      content: i.string(),
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
  },
);


export default graph;
