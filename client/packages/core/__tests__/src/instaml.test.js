import { test, expect } from "vitest";
import * as instaml from "../../src/instaml";
import * as instatx from "../../src/instatx";
import zenecaAttrs from "./data/zeneca/attrs.json";
import uuid from "../../src/utils/uuid";
import { i } from "../../src/index";

const zenecaAttrToId = zenecaAttrs.reduce((res, x) => {
  res[`${x["forward-identity"][1]}/${x["forward-identity"][2]}`] = x.id;
  return res;
}, {});

test("simple update transform", () => {
  const testId = uuid();

  const ops = instatx.tx.books[testId].update({ title: "New Title" });
  const result = instaml.transform({ attrs: zenecaAttrs }, ops);

  const expected = [
    ["add-triple", testId, zenecaAttrToId["books/title"], "New Title"],
    ["add-triple", testId, zenecaAttrToId["books/id"], testId],
  ];

  expect(result).toHaveLength(expected.length);
  for (const item of expected) {
    expect(result).toContainEqual(item);
  }
});

test("ignores id attrs", () => {
  const testId = uuid();

  const ops = instatx.tx.books[testId].update({
    title: "New Title",
    id: "ploop",
  });
  const result = instaml.transform({ attrs: zenecaAttrs }, ops);

  const expected = [
    ["add-triple", testId, zenecaAttrToId["books/title"], "New Title"],
    ["add-triple", testId, zenecaAttrToId["books/id"], testId],
  ];
  expect(result).toHaveLength(expected.length);
  for (const item of expected) {
    expect(result).toContainEqual(item);
  }
});

test("optimistically adds attrs if they don't exist", () => {
  const testId = uuid();

  const ops = instatx.tx.books[testId].update({ newAttr: "New Title" });

  const result = instaml.transform({ attrs: zenecaAttrs }, ops);

  const expected = [
    [
      "add-attr",
      {
        cardinality: "one",
        "forward-identity": [expect.any(String), "books", "newAttr"],
        id: expect.any(String),
        "index?": false,
        isUnsynced: true,
        "unique?": false,
        "value-type": "blob",
      },
    ],
    ["add-triple", testId, expect.any(String), "New Title"],
    ["add-triple", testId, zenecaAttrToId["books/id"], testId],
  ];

  expect(result).toHaveLength(expected.length);
  for (const item of expected) {
    expect(result).toContainEqual(item);
  }
});

test("lookup resolves attr ids", () => {
  const ops = instatx.tx.users[
    instatx.lookup("email", "stopa@instantdb.com")
  ].update({
    handle: "stopa",
  });

  const stopaLookup = [zenecaAttrToId["users/email"], "stopa@instantdb.com"];

  const result = instaml.transform({ attrs: zenecaAttrs }, ops);

  const expected = [
    ["add-triple", stopaLookup, zenecaAttrToId["users/handle"], "stopa"],
    ["add-triple", stopaLookup, zenecaAttrToId["users/id"], stopaLookup],
  ];

  expect(result).toHaveLength(expected.length);
  for (const item of expected) {
    expect(result).toContainEqual(item);
  }
});

test("lookup creates unique attrs for custom lookups", () => {
  const ops = instatx.tx.users[
    instatx.lookup("newAttr", "newAttrValue")
  ].update({
    handle: "stopa",
  });

  const lookup = [
    // The attr is going to be created, so we don't know its value yet
    expect.any(String),
    "newAttrValue",
  ];

  const result = instaml.transform({ attrs: zenecaAttrs }, ops);
  const expected = [
    [
      "add-attr",
      {
        cardinality: "one",
        "forward-identity": [expect.any(String), "users", "newAttr"],
        id: expect.any(String),
        "index?": true,
        isUnsynced: true,
        "unique?": true,
        "value-type": "blob",
      },
    ],
    ["add-triple", lookup, zenecaAttrToId["users/handle"], "stopa"],
    ["add-triple", lookup, zenecaAttrToId["users/id"], lookup],
  ];

  expect(result).toHaveLength(expected.length);
  for (const item of expected) {
    expect(result).toContainEqual(item);
  }
});

test("lookup creates unique attrs for lookups in link values", () => {
  const uid = uuid();
  const ops = instatx.tx.users[uid]
    .update({})
    .link({ posts: instatx.lookup("slug", "life-is-good") });

  const result = instaml.transform({ attrs: {} }, ops);

  expect(result).toEqual([
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "posts"],
        "reverse-identity": [expect.any(String), "posts", "users"],
        "value-type": "ref",
        cardinality: "one",
        "unique?": true,
        "index?": true,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "posts", "slug"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": true,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "id"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": false,
        isUnsynced: true,
      },
    ],
    ["add-triple", uid, expect.any(String), uid],
    [
      "add-triple",
      uid,
      expect.any(String),
      [expect.any(String), "life-is-good"],
    ],
  ]);
});

test("lookup creates unique attrs for lookups in link values with arrays", () => {
  const uid = uuid();
  const ops = instatx.tx.users[uid].update({}).link({
    posts: [
      instatx.lookup("slug", "life-is-good"),
      instatx.lookup("slug", "check-this-out"),
    ],
  });

  const result = instaml.transform({ attrs: {} }, ops);

  const expected = [
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "posts"],
        "reverse-identity": [expect.any(String), "posts", "users"],
        "value-type": "ref",
        cardinality: "one",
        "unique?": true,
        "index?": true,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "posts", "slug"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": true,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "id"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": false,
        isUnsynced: true,
      },
    ],
    ["add-triple", uid, expect.any(String), uid],
    [
      "add-triple",
      uid,
      expect.any(String),
      [expect.any(String), "life-is-good"],
    ],
    [
      "add-triple",
      uid,
      expect.any(String),
      [expect.any(String), "check-this-out"],
    ],
  ];

  expect(result).toHaveLength(expected.length);
  for (const item of expected) {
    expect(result).toContainEqual(item);
  }
});

test("lookup creates unique attrs for lookups in link values when fwd-ident exists", () => {
  const uid = uuid();
  const ops = instatx.tx.users[uid]
    .update({})
    .link({ posts: instatx.lookup("slug", "life-is-good") });

  const attrId = uuid();
  const existingRefAttr = {
    id: attrId,
    "forward-identity": [uuid(), "users", "posts"],
    "reverse-identity": [uuid(), "posts", "users"],
    "value-type": "ref",
    cardinality: "one",
    "unique?": true,
    "index?": true,
  };

  const result = instaml.transform(
    { attrs: { [attrId]: existingRefAttr } },
    ops,
  );

  expect(result).toEqual([
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "posts", "slug"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": true,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "id"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": false,
        isUnsynced: true,
      },
    ],
    ["add-triple", uid, expect.any(String), uid],
    [
      "add-triple",
      uid,
      expect.any(String),
      [expect.any(String), "life-is-good"],
    ],
  ]);
});

test("lookup creates unique attrs for lookups in link values when rev-ident exists", () => {
  const uid = uuid();
  const ops = instatx.tx.users[uid]
    .update({})
    .link({ posts: instatx.lookup("slug", "life-is-good") });

  const attrId = uuid();
  const existingRefAttr = {
    id: attrId,
    "forward-identity": [uuid(), "posts", "users"],
    "reverse-identity": [uuid(), "users", "posts"],
    "value-type": "ref",
    cardinality: "one",
    "unique?": true,
    "index?": true,
  };

  const result = instaml.transform(
    { attrs: { [attrId]: existingRefAttr } },
    ops,
  );

  expect(result).toEqual([
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "posts", "slug"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": true,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "id"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": false,
        isUnsynced: true,
      },
    ],
    ["add-triple", uid, expect.any(String), uid],
    [
      "add-triple",
      [expect.any(String), "life-is-good"],
      expect.any(String),
      uid,
    ],
  ]);
});

test("lookup doesn't override attrs for lookups in link values", () => {
  const uid = uuid();
  const ops = instatx.tx.users[uid]
    .update({})
    .link({ posts: instatx.lookup("slug", "life-is-good") });

  const refAttrId = uuid();
  const userIdAttrId = uuid();
  const postsSlugAttrId = uuid();

  const attrs = {
    [refAttrId]: {
      id: refAttrId,
      "forward-identity": [uuid(), "users", "posts"],
      "reverse-identity": [uuid(), "posts", "users"],
      "value-type": "ref",
      cardinality: "one",
      "unique?": true,
      "index?": true,
    },
    [userIdAttrId]: {
      id: userIdAttrId,
      "forward-identity": [uuid(), "users", "id"],
      "value-type": "blob",
      cardinality: "one",
      "unique?": true,
      "index?": false,
    },
    [postsSlugAttrId]: {
      id: postsSlugAttrId,
      "forward-identity": [uuid(), "posts", "slug"],
      "value-type": "blob",
      cardinality: "one",
      "unique?": true,
      "index?": true,
    },
  };

  const result = instaml.transform({ attrs }, ops);

  expect(result).toEqual([
    ["add-triple", uid, userIdAttrId, uid],
    ["add-triple", uid, refAttrId, [postsSlugAttrId, "life-is-good"]],
  ]);
});

test("lookup doesn't override attrs for lookups in self links", () => {
  const refAttrId = uuid();
  const postIdAttrId = uuid();
  const postsSlugAttrId = uuid();

  const attrs = {
    [postIdAttrId]: {
      id: postIdAttrId,
      "forward-identity": [uuid(), "posts", "id"],
      "value-type": "blob",
      cardinality: "one",
      "unique?": true,
      "index?": false,
    },
    [postsSlugAttrId]: {
      id: postsSlugAttrId,
      "forward-identity": [uuid(), "posts", "slug"],
      "value-type": "blob",
      cardinality: "one",
      "unique?": true,
      "index?": true,
    },
    [refAttrId]: {
      id: refAttrId,
      "forward-identity": [uuid(), "posts", "parent"],
      "reverse-identity": [uuid(), "posts", "child"],
      "value-type": "ref",
      cardinality: "one",
      "unique?": true,
      "index?": true,
    },
  };

  const ops1 = instatx.tx.posts[instatx.lookup("slug", "life-is-good")]
    .update({})
    .link({ parent: instatx.lookup("slug", "life-is-good") });

  const result1 = instaml.transform({ attrs }, ops1);

  expect(result1.filter((x) => x[0] !== "add-triple")).toEqual([]);

  const ops2 = instatx.tx.posts[instatx.lookup("slug", "life-is-good")]
    .update({})
    .link({ child: instatx.lookup("slug", "life-is-good") });

  const result2 = instaml.transform({ attrs }, ops2);

  expect(result2.filter((x) => x[0] !== "add-triple")).toEqual([]);
});

test("lookup creates unique ref attrs for ref lookup", () => {
  const uid = uuid();
  const ops = [
    instatx.tx.users[uid].update({}),
    instatx.tx.user_prefs[instatx.lookup("users.id", uid)].update({}),
  ];

  const lookup = [
    // The attr is going to be created, so we don't know its value yet
    expect.any(String),
    uid,
  ];

  const result = instaml.transform({ attrs: {} }, ops);
  const expected = [
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "id"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": false,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "user_prefs", "id"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": false,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "user_prefs", "users"],
        "reverse-identity": [expect.any(String), "users", "user_prefs"],
        "value-type": "ref",
        cardinality: "one",
        "unique?": true,
        "index?": true,
        isUnsynced: true,
      },
    ],
    ["add-triple", uid, expect.any(String), uid],
    ["add-triple", lookup, expect.any(String), lookup],
  ];

  expect(result).toHaveLength(expected.length);
  for (const item of expected) {
    expect(result).toContainEqual(item);
  }
});

test("lookup creates unique ref attrs for ref lookup in link value", () => {
  const uid = uuid();
  const ops = [
    instatx.tx.users[uid]
      .update({})
      .link({ user_prefs: instatx.lookup("users.id", uid) }),
  ];

  const lookup = [
    // The attr is going to be created, so we don't know its value yet
    expect.any(String),
    uid,
  ];

  const result = instaml.transform({ attrs: {} }, ops);

  const expected = [
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "user_prefs"],
        "reverse-identity": [expect.any(String), "user_prefs", "users"],
        "value-type": "ref",
        cardinality: "one",
        "unique?": true,
        "index?": true,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "id"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": false,
        isUnsynced: true,
      },
    ],
    ["add-triple", uid, expect.any(String), uid],
    ["add-triple", uid, expect.any(String), lookup],
  ];

  expect(result).toHaveLength(expected.length);
  for (const item of expected) {
    expect(result).toContainEqual(item);
  }
});

test("it throws if you use an invalid link attr", () => {
  expect(() =>
    instaml.transform(
      { attrs: {} },
      instatx.tx.users[
        instatx.lookup("user_pref.email", "test@example.com")
      ].update({
        a: 1,
      }),
    ),
  ).toThrowError("user_pref.email is not a valid lookup attribute.");
});

test("it doesn't throw if you have a period in your attr", () => {
  const aid = uuid();
  const iid = uuid();
  const pid = uuid();
  const attrs = {
    [aid]: {
      id: aid,
      cardinality: "one",
      "forward-identity": [uuid(), "users", "attr.with.dot"],
      "index?": true,
      "unique?": true,
      "value-type": "blob",
    },
    [iid]: {
      id: iid,
      cardinality: "one",
      "forward-identity": [uuid(), "users", "id"],
      "index?": true,
      "unique?": false,
      "value-type": "blob",
    },
    [pid]: {
      id: pid,
      cardinality: "one",
      "forward-identity": [uuid(), "users", "a"],
      "index?": false,
      "unique?": false,
      "value-type": "blob",
    },
  };

  expect(
    instaml.transform(
      { attrs },
      instatx.tx.users[instatx.lookup("attr.with.dot", "value")].update({
        a: 1,
      }),
    ),
  ).toEqual([
    ["add-triple", [aid, "value"], iid, [aid, "value"]],
    ["add-triple", [aid, "value"], pid, 1],
  ]);
});

test("it doesn't create duplicate ref attrs", () => {
  const aid = uuid();
  const bid = uuid();
  const ops = [
    instatx.tx.nsA[aid].update({}).link({ nsB: bid }),
    instatx.tx.nsB[bid].update({}).link({ nsA: aid }),
  ];

  const result = instaml.transform({ attrs: {} }, ops);

  const expected = [
    [
      "add-attr",
      {
        cardinality: "one",
        "forward-identity": [expect.any(String), "nsA", "id"],
        id: expect.any(String),
        "index?": false,
        isUnsynced: true,
        "unique?": true,
        "value-type": "blob",
      },
    ],
    [
      "add-attr",
      {
        cardinality: "one",
        "forward-identity": [expect.any(String), "nsB", "id"],
        id: expect.any(String),
        "index?": false,
        isUnsynced: true,
        "unique?": true,
        "value-type": "blob",
      },
    ],
    [
      "add-attr",
      {
        cardinality: "many",
        "forward-identity": [expect.any(String), "nsA", "nsB"],
        id: expect.any(String),
        "index?": false,
        isUnsynced: true,
        "reverse-identity": [expect.any(String), "nsB", "nsA"],
        "unique?": false,
        "value-type": "ref",
      },
    ],
    ["add-triple", aid, expect.any(String), aid],
    ["add-triple", aid, expect.any(String), bid],
    ["add-triple", bid, expect.any(String), bid],
    ["add-triple", aid, expect.any(String), bid],
  ];

  expect(result).toHaveLength(expected.length);
  for (const item of expected) {
    expect(result).toContainEqual(item);
  }
});

test("Schema: uses info in `attrs` and `links`", () => {
  const schema = i.schema({
    entities: {
      comments: i.entity({
        slug: i.string().unique().indexed(),
      }),
      books: i.entity({}),
    },
    links: {
      commentBooks: {
        forward: {
          on: "comments",
          has: "one",
          label: "book",
        },
        reverse: {
          on: "books",
          has: "many",
          label: "comments",
        },
      },
    },
  });

  const commentId = uuid();
  const bookId = uuid();
  const ops = instatx.tx.comments[commentId]
    .update({
      slug: "test-slug",
    })
    .link({
      book: bookId,
    });

  const result = instaml.transform(
    {
      attrs: zenecaAttrs,
      schema: schema,
    },
    ops,
  );

  const expected = [
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "comments", "slug"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": true,
        "checked-data-type": "string",
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "comments", "id"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": false,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "comments", "book"],
        "reverse-identity": [expect.any(String), "books", "comments"],
        "value-type": "ref",
        cardinality: "one",
        "unique?": false,
        "index?": false,
        isUnsynced: true,
      },
    ],
    ["add-triple", commentId, expect.any(String), commentId],
    ["add-triple", commentId, expect.any(String), "test-slug"],
    ["add-triple", commentId, expect.any(String), bookId],
  ];
  expect(result).toHaveLength(expected.length);
  for (const item of expected) {
    expect(result).toContainEqual(item);
  }
});

test("Schema: doesn't create duplicate ref attrs", () => {
  const schema = i.schema({
    entities: {
      comments: i.entity({}),
      books: i.entity({}),
    },
    links: {
      commentBooks: {
        forward: {
          on: "comments",
          has: "one",
          label: "book",
        },
        reverse: {
          on: "books",
          has: "many",
          label: "comments",
        },
      },
    },
  });

  const commentId = uuid();
  const bookId = uuid();
  const ops = [
    instatx.tx.comments[commentId].update({}).link({ book: bookId }),
    instatx.tx.books[bookId].update({}).link({ comments: commentId }),
  ];

  const result = instaml.transform({ attrs: zenecaAttrs, schema }, ops);

  const expected = [
    [
      "add-attr",
      {
        cardinality: "one",
        "forward-identity": [expect.any(String), "comments", "id"],
        id: expect.any(String),
        "index?": false,
        isUnsynced: true,
        "unique?": true,
        "value-type": "blob",
      },
    ],
    [
      "add-attr",
      {
        cardinality: "one",
        "forward-identity": [expect.any(String), "comments", "book"],
        id: expect.any(String),
        "index?": false,
        isUnsynced: true,
        "reverse-identity": [expect.any(String), "books", "comments"],
        "unique?": false,
        "value-type": "ref",
      },
    ],
    ["add-triple", commentId, expect.any(String), commentId],
    ["add-triple", commentId, expect.any(String), bookId],
    ["add-triple", bookId, expect.any(String), bookId],
    ["add-triple", commentId, expect.any(String), bookId],
  ];
  expect(result).toHaveLength(expected.length);
  for (const item of expected) {
    expect(result).toContainEqual(item);
  }
});

test("Schema: lookup creates unique attrs for custom lookups", () => {
  const schema = i.schema({
    entities: {
      users: i.entity({
        nickname: i.string().unique().indexed(),
      }),
    },
  });

  const ops = instatx.tx.users[instatx.lookup("nickname", "stopanator")].update(
    {
      handle: "stopa",
    },
  );

  const lookup = [
    // The attr is going to be created, so we don't know its value yet
    expect.any(String),
    "stopanator",
  ];

  const result = instaml.transform({ attrs: zenecaAttrs, schema }, ops);
  const expected = [
    [
      "add-attr",
      {
        cardinality: "one",
        "forward-identity": [expect.any(String), "users", "nickname"],
        id: expect.any(String),
        "index?": true,
        isUnsynced: true,
        "unique?": true,
        "checked-data-type": "string",
        "value-type": "blob",
      },
    ],
    ["add-triple", lookup, zenecaAttrToId["users/handle"], "stopa"],
    ["add-triple", lookup, zenecaAttrToId["users/id"], lookup],
  ];

  expect(result).toHaveLength(expected.length);
  for (const item of expected) {
    expect(result).toContainEqual(item);
  }
});

test("Schema: lookup creates unique attrs for lookups in link values", () => {
  const schema = i.schema({
    entities: {
      posts: i.entity({
        slug: i.string().unique().indexed(),
      }),
      users: i.entity({}),
    },
    links: {
      postUsers: {
        forward: {
          on: "users",
          has: "many",
          label: "authoredPosts",
        },
        reverse: {
          on: "posts",
          has: "one",
          label: "author",
        },
      },
    },
  });

  const uid = uuid();
  const ops = instatx.tx.users[uid]
    .update({})
    .link({ authoredPosts: instatx.lookup("slug", "life-is-good") });

  const result = instaml.transform({ attrs: {}, schema }, ops);

  expect(result).toEqual([
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "authoredPosts"],
        "reverse-identity": [expect.any(String), "posts", "author"],
        "value-type": "ref",
        // TODO: should this be one?
        cardinality: "one",
        "unique?": true,
        "index?": true,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "posts", "slug"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": true,
        "checked-data-type": "string",
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "id"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": false,
        isUnsynced: true,
      },
    ],
    ["add-triple", uid, expect.any(String), uid],
    [
      "add-triple",
      uid,
      expect.any(String),
      [expect.any(String), "life-is-good"],
    ],
  ]);
});

test("Schema: lookup creates unique attrs for lookups in link values with arrays", () => {
  const schema = i.schema({
    entities: {
      posts: i.entity({
        slug: i.string().unique().indexed(),
      }),
      users: i.entity({}),
    },
    links: {
      postUsers: {
        forward: {
          on: "users",
          has: "many",
          label: "authoredPosts",
        },
        reverse: {
          on: "posts",
          has: "one",
          label: "author",
        },
      },
    },
  });

  const uid = uuid();
  const ops = instatx.tx.users[uid].update({}).link({
    authoredPosts: [
      instatx.lookup("slug", "life-is-good"),
      instatx.lookup("slug", "check-this-out"),
    ],
  });

  const result = instaml.transform({ attrs: {}, schema }, ops);

  const expected = [
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "authoredPosts"],
        "reverse-identity": [expect.any(String), "posts", "author"],
        "value-type": "ref",
        cardinality: "one",
        "unique?": true,
        "index?": true,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "posts", "slug"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": true,
        "checked-data-type": "string",
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "id"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": false,
        isUnsynced: true,
      },
    ],
    ["add-triple", uid, expect.any(String), uid],
    [
      "add-triple",
      uid,
      expect.any(String),
      [expect.any(String), "life-is-good"],
    ],
    [
      "add-triple",
      uid,
      expect.any(String),
      [expect.any(String), "check-this-out"],
    ],
  ];

  expect(result).toHaveLength(expected.length);
  for (const item of expected) {
    expect(result).toContainEqual(item);
  }
});

test("Schema: lookup creates unique ref attrs for ref lookup", () => {
  const schema = i.schema({
    entities: {
      users: i.entity({}),
      user_prefs: i.entity({}),
    },
    links: {
      user_user_prefs: {
        forward: {
          on: "user_prefs",
          has: "one",
          label: "user",
        },
        reverse: {
          on: "users",
          has: "one",
          label: "user_pref",
        },
      },
    },
  });

  const uid = uuid();
  const ops = [
    instatx.tx.users[uid].update({}),
    instatx.tx.user_prefs[instatx.lookup("user.id", uid)].update({}),
  ];

  const lookup = [
    // The attr is going to be created, so we don't know its value yet
    expect.any(String),
    uid,
  ];

  const result = instaml.transform({ attrs: {}, schema }, ops);
  const expected = [
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "id"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": false,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "user_prefs", "id"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": false,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "user_prefs", "user"],
        "reverse-identity": [expect.any(String), "users", "user_pref"],
        "value-type": "ref",
        cardinality: "one",
        "unique?": true,
        "index?": true,
        isUnsynced: true,
      },
    ],
    ["add-triple", uid, expect.any(String), uid],
    ["add-triple", lookup, expect.any(String), lookup],
  ];

  expect(result).toHaveLength(expected.length);
  for (const item of expected) {
    expect(result).toContainEqual(item);
  }
});

test("Schema: lookup creates unique ref attrs for ref lookup in link value", () => {
  const schema = i.schema({
    entities: {
      users: i.entity({}),
      user_prefs: i.entity({}),
    },
    links: {
      user_user_prefs: {
        forward: {
          on: "users",
          has: "one",
          label: "user_pref",
        },
        reverse: {
          on: "user_prefs",
          has: "one",
          label: "user",
        },
      },
    },
  });
  const uid = uuid();
  const ops = [
    instatx.tx.users[uid]
      .update({})
      .link({ user_pref: instatx.lookup("user.id", uid) }),
  ];

  const lookup = [
    // The attr is going to be created, so we don't know its value yet
    expect.any(String),
    uid,
  ];

  const result = instaml.transform({ attrs: {}, schema }, ops);

  const expected = [
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "user_pref"],
        "reverse-identity": [expect.any(String), "user_prefs", "user"],
        "value-type": "ref",
        cardinality: "one",
        "unique?": true,
        "index?": true,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "id"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": false,
        isUnsynced: true,
      },
    ],
    ["add-triple", uid, expect.any(String), uid],
    ["add-triple", uid, expect.any(String), lookup],
  ];

  expect(result).toHaveLength(expected.length);
  for (const item of expected) {
    expect(result).toContainEqual(item);
  }
});

test("Schema: populates checked-data-type", () => {
  const schema = i.schema({
    entities: {
      comments: i.entity({
        s: i.string(),
        n: i.number(),
        d: i.date(),
        b: i.boolean(),
        a: i.any(),
        j: i.json(),
      }),
    },
  });

  const commentId = uuid();
  const ops = instatx.tx.comments[commentId].update({
    s: "str",
    n: "num",
    d: "date",
    b: "bool",
    a: "any",
    j: "json",
  });

  const result = instaml.transform(
    {
      attrs: zenecaAttrs,
      schema: schema,
    },
    ops,
  );

  const expected = [
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "comments", "s"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": false,
        "index?": false,
        isUnsynced: true,
        "checked-data-type": "string",
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "comments", "n"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": false,
        "index?": false,
        isUnsynced: true,
        "checked-data-type": "number",
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "comments", "d"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": false,
        "index?": false,
        isUnsynced: true,
        "checked-data-type": "date",
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "comments", "b"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": false,
        "index?": false,
        isUnsynced: true,
        "checked-data-type": "boolean",
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "comments", "a"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": false,
        "index?": false,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "comments", "j"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": false,
        "index?": false,
        isUnsynced: true,
      },
    ],
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "comments", "id"],
        "value-type": "blob",
        cardinality: "one",
        "unique?": true,
        "index?": false,
        isUnsynced: true,
      },
    ],
    ["add-triple", commentId, expect.any(String), commentId],
    ["add-triple", commentId, expect.any(String), "str"],
    ["add-triple", commentId, expect.any(String), "num"],
    ["add-triple", commentId, expect.any(String), "date"],
    ["add-triple", commentId, expect.any(String), "bool"],
    ["add-triple", commentId, expect.any(String), "any"],
    ["add-triple", commentId, expect.any(String), "json"],
  ];

  expect(result).toHaveLength(expected.length);
  for (const item of expected) {
    expect(result).toContainEqual(item);
  }
});
