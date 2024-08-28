export default {
  authors: {
    bind: ["isAuthor", "auth.id == data.userId"],
    allow: {
      view: "true",
      create: "isAuthor",
      update: "isAuthor",
      delete: "isAuthor",
    },
  },
  posts: {
    bind: ["isAuthor", "auth.id in data.ref('authors.userId')"],
    allow: {
      view: "true",
      create: "isAuthor",
      update: "isAuthor",
      delete: "isAuthor",
    },
  },
  tags: {
    bind: ["isOwner", "auth.id in data.ref('posts.authors.userId')"],
    allow: {
      view: "true",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
  },
};
