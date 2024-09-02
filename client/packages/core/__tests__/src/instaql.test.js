import { test, expect } from "vitest";

import zenecaAttrs from "./data/zeneca/attrs.json";
import zenecaTriples from "./data/zeneca/triples.json";
import { createStore, transact } from "../../src/store";
import query from "../../src/instaql";
import { tx } from "../../src/instatx";
import * as instaml from "../../src/instaml";

const zenecaIdToAttr = zenecaAttrs.reduce((res, x) => {
  res[x.id] = x;
  return res;
}, {});

const store = createStore(zenecaIdToAttr, zenecaTriples);

test("Simple Query Without Where", () => {
  expect(
    query({ store }, { users: {} })
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(["alex", "joe", "nicolegf", "stopa"]);
});

test("Simple Where", () => {
  expect(
    query({ store }, { users: { $: { where: { handle: "joe" } } } })
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(["joe"]);
});

test("Simple Where has expected keys", () => {
  expect(
    Object.keys(
      query({ store }, { users: { $: { where: { handle: "joe" } } } }).data
        .users[0],
    ).sort(),
  ).toEqual(["createdAt", "email", "fullName", "handle", "id"]);
});

test("Simple Where with multiple clauses", () => {
  expect(
    query(
      { store },
      {
        users: {
          $: {
            where: {
              "bookshelves.books.title": "The Count of Monte Cristo",
              handle: "stopa",
            },
          },
        },
      },
    )
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(["stopa"]);

  expect(
    query(
      { store },
      {
        users: {
          $: {
            where: {
              "bookshelves.books.title": "Title nobody has",
              handle: "stopa",
            },
          },
        },
      },
    )
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual([]);
});

test("Where in", () => {
  expect(
    query(
      { store },
      {
        users: {
          $: {
            where: {
              handle: { in: ["stopa", "joe"] },
            },
          },
        },
      },
    )
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(["joe", "stopa"]);
});

test("Where and", () => {
  expect(
    query(
      { store },
      {
        users: {
          $: {
            where: {
              and: [
                { "bookshelves.books.title": "The Count of Monte Cristo" },
                { "bookshelves.books.title": "Antifragile" },
              ],
            },
          },
        },
      },
    )
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(["nicolegf", "stopa"]);
});

test.each([
  [
    "multiple OR matches",
    {
      or: [{ handle: "stopa" }, { handle: "joe" }],
    },
    ["joe", "stopa"],
  ],
  [
    "mix of matching and non-matching",
    {
      or: [{ handle: "nobody" }, { handle: "stopa" }, { handle: "everybody" }],
    },
    ["stopa"],
  ],
  [
    "with and",
    {
      "bookshelves.books.title": "The Count of Monte Cristo",
      or: [{ handle: "joe" }, { handle: "stopa" }],
    },
    ["stopa"],
  ],
  [
    "with references",
    {
      or: [
        { handle: "joe" },
        {
          handle: "stopa",
          "bookshelves.books.title": "The Count of Monte Cristo",
        },
      ],
    },
    ["joe", "stopa"],
  ],
  [
    "with references in both `or` & `and` clauses, no matches",
    {
      "bookshelves.books.title": "Unknown",
      or: [
        { handle: "joe" },
        {
          handle: "stopa",
          "bookshelves.books.title": "The Count of Monte Cristo",
        },
      ],
    },
    [],
  ],
  [
    "with references in both `or` & `and` clauses, with matches",
    {
      "bookshelves.books.title": "A Promised Land",
      or: [
        {
          handle: "stopa",
          "bookshelves.books.title": "The Count of Monte Cristo",
        },
        {
          handle: "joe",
        },
      ],
    },
    ["joe"],
  ],
  [
    "with nested ors",
    {
      or: [
        { or: [{ handle: "stopa" }] },
        {
          handle: "joe",
        },
      ],
    },
    ["joe", "stopa"],
  ],
  [
    "with ands in ors",
    {
      or: [
        {
          or: [
            {
              and: [
                { or: [{ handle: "stopa" }, { handle: "joe" }] },
                { email: "stopa@instantdb.com" },
              ],
            },
          ],
        },
        {
          handle: "joe",
        },
      ],
    },
    ["joe", "stopa"],
  ],
])("Where OR %s", (_, whereQuery, expected) => {
  expect(
    query(
      { store },
      {
        users: {
          $: {
            where: whereQuery,
          },
        },
      },
    )
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(expected);
});

test("Get association", () => {
  expect(
    query(
      { store },
      {
        users: {
          bookshelves: {},
          $: { where: { handle: "alex" } },
        },
      },
    ).data.users.map((x) => [
      x.handle,
      x.bookshelves.map((x) => x.name).sort(),
    ]),
  ).toEqual([["alex", ["Nonfiction", "Short Stories"]]]);
});

test("Get reverse association", () => {
  expect(
    query(
      { store },
      {
        bookshelves: {
          users: {},
          $: { where: { name: "Short Stories" } },
        },
      },
    ).data.bookshelves.map((x) => [
      x.name,
      x.users.map((x) => x.handle).sort(),
    ]),
  ).toEqual([["Short Stories", ["alex"]]]);
});

test("Get deep association", () => {
  expect(
    query(
      { store },
      {
        users: {
          bookshelves: { books: {} },
          $: { where: { handle: "alex" } },
        },
      },
    )
      .data.users.flatMap((x) => x.bookshelves)
      .flatMap((x) => x.books)
      .map((x) => x.title),
  ).toEqual([
    `"Surely You're Joking, Mr. Feynman!": Adventures of a Curious Character`,
    '"What Do You Care What Other People Think?": Further Adventures of a Curious Character',
    "The Spy and the Traitor",
    "Antifragile",
    "Atomic Habits",
    "Catch and Kill",
    "The Paper Menagerie and Other Stories",
    "Stories of Your Life and Others",
    "Aesop's Fables",
  ]);
});

test("Nested wheres", () => {
  expect(
    query(
      { store },
      {
        users: {
          bookshelves: {
            books: {},
            $: { where: { name: "Short Stories" } },
          },
          $: { where: { handle: "alex" } },
        },
      },
    )
      .data.users.flatMap((x) => x.bookshelves)
      .flatMap((x) => x.books)
      .map((x) => x.title),
  ).toEqual([
    "The Paper Menagerie and Other Stories",
    "Stories of Your Life and Others",
    "Aesop's Fables",
  ]);
});

test("Nested wheres with OR queries", () => {
  expect(
    query(
      { store },
      {
        users: {
          bookshelves: {
            books: {},
            $: {
              where: { or: [{ name: "Short Stories" }] },
            },
          },
          $: { where: { handle: "alex" } },
        },
      },
    )
      .data.users.flatMap((x) => x.bookshelves)
      .flatMap((x) => x.books)
      .map((x) => x.title),
  ).toEqual([
    "The Paper Menagerie and Other Stories",
    "Stories of Your Life and Others",
    "Aesop's Fables",
  ]);
});

test("Nested wheres with AND queries", () => {
  expect(
    query(
      { store },
      {
        users: {
          bookshelves: {
            books: {},
            $: {
              where: { and: [{ name: "Short Stories" }, { order: 0 }] },
            },
          },
          $: { where: { handle: "alex" } },
        },
      },
    )
      .data.users.flatMap((x) => x.bookshelves)
      .flatMap((x) => x.books)
      .map((x) => x.title),
  ).toEqual([
    "The Paper Menagerie and Other Stories",
    "Stories of Your Life and Others",
    "Aesop's Fables",
  ]);
});

test("Deep where", () => {
  expect(
    query(
      { store },
      {
        users: {
          $: { where: { "bookshelves.books.title": "Aesop's Fables" } },
        },
      },
    ).data.users.map((x) => x.handle),
  ).toEqual(["alex"]);
});

test("Missing etype", () => {
  expect(query({ store }, { moopy: {} }).data).toEqual({ moopy: [] });
});

test("Missing inner etype", () => {
  expect(
    query(
      { store },
      {
        users: {
          moopy: {},
          $: { where: { handle: "joe" } },
        },
      },
    )
      .data.users.map((x) => [x.handle, x.moopy])
      .sort(),
  ).toEqual([["joe", []]]);
});

test("Missing filter attr", () => {
  expect(
    query(
      { store },
      {
        users: {
          $: { where: { "bookshelves.moopy": "joe" } },
        },
      },
    ).data,
  ).toEqual({ users: [] });
});

test("multiple connections", () => {
  expect(
    query(
      { store },
      {
        bookshelves: {
          books: {},
          users: {},
          $: { where: { name: "Short Stories" } },
        },
      },
    ).data.bookshelves.map((x) => [
      x.name,
      x.users.map((x) => x.handle).sort(),
      x.books.map((x) => x.title).sort(),
    ]),
  ).toEqual([
    [
      "Short Stories",
      ["alex"],
      [
        "Aesop's Fables",
        "Stories of Your Life and Others",
        "The Paper Menagerie and Other Stories",
      ],
    ],
  ]);
});

test("objects are created by etype", () => {
  const stopa = query(
    { store },
    {
      users: {
        $: { where: { handle: "stopa" } },
      },
    },
  ).data.users[0];
  expect(stopa.email).toEqual("stopa@instantdb.com");
  const chunk = tx.user[stopa.id].update({
    email: "this-should-not-change-users-stopa@gmail.com",
  });
  const txSteps = instaml.transform(store.attrs, chunk);
  const newStore = transact(store, txSteps);
  const newStopa = query(
    { store: newStore },
    {
      users: {
        $: { where: { handle: "stopa" } },
      },
    },
  ).data.users[0];
  expect(newStopa.email).toEqual("stopa@instantdb.com");
});

test("object values", () => {
  const stopa = query(
    { store },
    {
      users: {
        $: { where: { handle: "stopa" } },
      },
    },
  ).data.users[0];
  expect(stopa.email).toEqual("stopa@instantdb.com");
  const chunk = tx.users[stopa.id].update({
    jsonField: { hello: "world" },
    otherJsonField: { world: "hello" },
  });
  const txSteps = instaml.transform(store.attrs, chunk);
  const newStore = transact(store, txSteps);
  const newStopa = query(
    { store: newStore },
    {
      users: {
        $: { where: { handle: "stopa" } },
      },
    },
  ).data.users[0];

  expect(newStopa.jsonField).toEqual({ hello: "world" });
});

test("pagination limit", () => {
  const books = query(
    { store },
    {
      books: {
        $: {
          limit: 10,
        },
      },
    },
  ).data.books;

  expect(books.length).toEqual(10);
});

test("pagination offset waits for pageInfo", () => {
  // If we don't have the pageInfo from the server, we have to
  // wait to know which items in the store we should return.
  // Otherwise, we might render optimistic changes for items
  // that aren't in our range.
  const booksWithOffset = query(
    { store },
    {
      books: {
        $: {
          offset: 10,
          limit: 5,
        },
      },
    },
  ).data.books;

  expect(booksWithOffset.length).toEqual(0);

  const booksWithPageInfo = query(
    {
      store,
      pageInfo: {
        books: {
          "start-cursor": [
            "000212ec-fe77-473d-9494-d29898c53b7a",
            "6eebf15a-ed3c-4442-8869-a44a7c85a1be",
            "000212ec-fe77-473d-9494-d29898c53b7a",
            1718118155976,
          ],
          "end-cursor": [
            "0270a27f-1363-4f6d-93c0-39cc43d92a78",
            "6eebf15a-ed3c-4442-8869-a44a7c85a1be",
            "0270a27f-1363-4f6d-93c0-39cc43d92a78",
            1718118151976,
          ],
        },
      },
    },
    {
      books: {
        $: {
          offset: 10,
          limit: 5,
          order: { serverCreatedAt: "desc" },
        },
      },
    },
  ).data.books;

  expect(booksWithPageInfo.map((b) => b.title)).toEqual([
    "Norse Mythology",
    "Love-at-Arms",
    "The Young Lions",
    "The Hounds of God",
    "Which Comes First, Cardio or Weights?",
  ]);

  const booksWithPageInfoAsc = query(
    {
      store,
      pageInfo: {
        books: {
          "start-cursor": [
            "f11c998f-d951-426b-b2b1-ffcb8d17bac5",
            "6eebf15a-ed3c-4442-8869-a44a7c85a1be",
            "f11c998f-d951-426b-b2b1-ffcb8d17bac5",
            1718117715976,
          ],
          "end-cursor": [
            "f1c15604-93cd-4189-bb9a-d4ee97b95f32",
            "6eebf15a-ed3c-4442-8869-a44a7c85a1be",
            "f1c15604-93cd-4189-bb9a-d4ee97b95f32",
            1718117721976,
          ],
        },
      },
    },
    {
      books: {
        $: {
          offset: 10,
          limit: 5,
          order: { serverCreatedAt: "asc" },
        },
      },
    },
  ).data.books;

  expect(booksWithPageInfoAsc.map((b) => b.title)).toEqual([
    "Sum",
    "Insurgent",
    "The Rational Male",
    "The Restaurant at the End of the Universe",
    "Bardelys the Magnificent",
  ]);
});

test("pagination last", () => {
  const books = query(
    { store },
    {
      books: {
        $: {
          last: 10,
        },
      },
    },
  ).data.books;

  expect(books.length).toEqual(10);
});

test("pagination first", () => {
  const books = query(
    { store },
    {
      books: {
        $: {
          first: 10,
        },
      },
    },
  ).data.books;

  expect(books.length).toEqual(10);
});
