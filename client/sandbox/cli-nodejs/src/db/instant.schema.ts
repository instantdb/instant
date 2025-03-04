import { i } from '@instantdb/core';

const schema = i.schema({
  entities: {
    profiles: i.entity({
      handle: i.string().unique(),
      createdAt: i.date(),
    }),
    posts: i.entity({
      title: i.string(),
      body: i.string(),
      slug: i.string().unique(),
      createdAt: i.date().indexed(),
    }),
    tags: i.entity({
      title: i.string(),
    }),
    comments: i.entity({
      body: i.string(),
      createdAt: i.date().indexed(),
    }),
  },
  links: {
    postAuthor: {
      forward: { on: 'posts', has: 'one', label: 'owner' },
      reverse: { on: 'profiles', has: 'many', label: 'posts' },
    },
    commentPost: {
      forward: { on: 'comments', has: 'one', label: 'post' },
      reverse: { on: 'posts', has: 'many', label: 'comments' },
    },
    commentAuthor: {
      forward: { on: 'comments', has: 'one', label: 'author' },
      reverse: { on: 'profiles', has: 'many', label: 'comments' },
    },
    postsTags: {
      forward: { on: 'posts', has: 'many', label: 'tags' },
      reverse: { on: 'tags', has: 'many', label: 'posts' },
    },
  },
  rooms: {},
});

export default schema;
