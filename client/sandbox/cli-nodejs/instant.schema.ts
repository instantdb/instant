import { i } from "@instantdb/core";

const schema = i.schema({
  entities: {
    authors: i.entity({
      name: i.any(),
      userId: i.any(),
    }),
    posts: i.entity({
      content: i.any(),
      name: i.any(),
    }),
    tags: i.entity({
      label: i.any(),
    }),
  },
  links: {
    authorsPosts: {
      forward: {
        on: "authors",
        has: "many",
        label: "posts",
      },
      reverse: {
        on: "posts",
        has: "one",
        label: "author",
      },
    },
    postsTags: {
      forward: {
        on: "tags",
        has: "many",
        label: "posts",
      },
      reverse: {
        on: "posts",
        has: "many",
        label: "tags",
      },
    },
  },
  rooms: {},
});

export default schema;
