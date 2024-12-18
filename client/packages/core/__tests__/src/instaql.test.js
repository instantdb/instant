import { test, expect } from "vitest";

import zenecaAttrs from "./data/zeneca/attrs.json";
import zenecaTriples from "./data/zeneca/triples.json";
import { createStore, transact } from "../../src/store";
import query from "../../src/instaql";
import { tx } from "../../src/instatx";
import { i } from "../../src/index";
import * as instaml from "../../src/instaml";
import { randomUUID } from "crypto";

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

  expect(
    query(
      { store },
      {
        users: {
          $: {
            where: {
              handle: { $in: ["stopa", "joe"] },
            },
          },
        },
      },
    )
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(["joe", "stopa"]);
});

test("Where %like%", () => {
  expect(
    query(
      { store },
      {
        users: {
          $: {
            where: {
              handle: { $like: "%o%" },
            },
          },
        },
      },
    )
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(["joe", "nicolegf", "stopa"]);
});

test("Where like equality", () => {
  expect(
    query(
      { store },
      {
        users: {
          $: {
            where: {
              handle: { $like: "joe" },
            },
          },
        },
      },
    )
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(["joe"]);
});

test("Where startsWith deep", () => {
  expect(
    query(
      { store },
      {
        users: {
          $: {
            where: {
              "bookshelves.books.title": { $like: "%Monte Cristo" },
            },
          },
        },
      },
    )
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(["nicolegf", "stopa"]);
});

test("Where endsWith deep", () => {
  expect(
    query(
      { store },
      {
        users: {
          $: {
            where: {
              "bookshelves.books.title": { $like: "Anti%" },
            },
          },
        },
      },
    )
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(["alex", "nicolegf", "stopa"]);
});

test("like case sensitivity", () => {
  function runQuery(where) {
    return query(
      { store },
      {
        users: {
          $: {
            where: {
              fullName: where,
            },
          },
        },
      },
    )
      .data.users.map((x) => x.fullName)
      .sort();
  }
  expect(runQuery({ $like: "%O%" })).toEqual([]);
  expect(runQuery({ $ilike: "%O%" })).toEqual(["Joe Averbukh", "Nicole"]);
  expect(runQuery({ $like: "%j%" })).toEqual([]);
  expect(runQuery({ $ilike: "%j%" })).toEqual(["Joe Averbukh"]);
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

test("query forward references work with and without id", () => {
  const bookshelf = query(
    { store },
    {
      bookshelves: {
        $: { where: { "users.handle": "stopa" } },
      },
    },
  ).data.bookshelves[0];

  const usersByBookshelfId = query(
    { store },
    {
      users: {
        $: { where: { "bookshelves.id": bookshelf.id } },
      },
    },
  ).data.users.map((x) => x.handle);

  const usersByBookshelfLinkFIeld = query(
    { store },
    {
      users: {
        $: { where: { bookshelves: bookshelf.id } },
      },
    },
  ).data.users.map((x) => x.handle);

  expect(usersByBookshelfId).toEqual(["stopa"]);
  expect(usersByBookshelfLinkFIeld).toEqual(["stopa"]);
});

test("query reverse references work with and without id", () => {
  const stopa = query(
    { store },
    {
      users: {
        $: { where: { handle: "stopa" } },
      },
    },
  ).data.users[0];

  const stopaBookshelvesByHandle = query(
    { store },
    {
      bookshelves: {
        $: { where: { "users.handle": "stopa" } },
      },
    },
  ).data.bookshelves;

  const stopaBookshelvesById = query(
    { store },
    {
      bookshelves: {
        $: { where: { "users.id": stopa.id } },
      },
    },
  ).data.bookshelves;

  const stopaBookshelvesByLinkField = query(
    { store },
    {
      bookshelves: {
        $: { where: { users: stopa.id } },
      },
    },
  ).data.bookshelves;

  expect(stopaBookshelvesByHandle.length).toBe(16);

  expect(stopaBookshelvesByHandle).toEqual(stopaBookshelvesById);
  expect(stopaBookshelvesByHandle).toEqual(stopaBookshelvesByLinkField);
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
  const txSteps = instaml.transform({ attrs: store.attrs }, chunk);
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
  const txSteps = instaml.transform({ attrs: store.attrs }, chunk);
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

test("arbitrary ordering", () => {
  const books = query(
    { store },
    { books: { $: { first: 10, order: { title: "asc" } } } },
  );

  const titles = books.data.books.map((x) => x.title);
  expect(titles).toEqual([
    `"Surely You're Joking, Mr. Feynman!": Adventures of a Curious Character`,
    '"What Do You Care What Other People Think?": Further Adventures of a Curious Character',
    "12 Rules for Life",
    "1984",
    "21 Lessons for the 21st Century",
    "A Conflict of Visions",
    "A Damsel in Distress",
    "A Guide to the Good Life",
    "A Hero Of Our Time",
    "A History of Private Life: From pagan Rome to Byzantium",
  ]);
});

test("arbitrary ordering with dates", () => {
  const schema = i.schema({
    entities: {
      tests: i.entity({
        field: i.any(),
        date: i.date().indexed(),
        num: i.number().indexed(),
      }),
    },
  });

  const txSteps = [];
  let id = 0;
  for (let i = -5; i < 5; i++) {
    txSteps.push(
      tx.tests[randomUUID()].update({
        field: id++,
        date: i,
        num: i,
      }),
    );
  }
  // Add a null date
  txSteps.push(
    // Use predefined uuid so we can predict ordering
    tx.tests["00000000-0000-0000-0000-000000000000"].update({
      field: id++,
      date: null,
      num: null,
    }),
  );
  // Add a missing date
  txSteps.push(
    tx.tests["00000000-0000-0000-0000-000000000001"].update({
      field: id++,
    }),
  );
  // Another null date
  txSteps.push(
    tx.tests["00000000-0000-0000-0000-000000000002"].update({
      date: null,
      num: null,
      field: id++,
    }),
  );
  // Another missing date
  txSteps.push(
    tx.tests["00000000-0000-0000-0000-000000000003"].update({
      field: id++,
    }),
  );

  const newStore = transact(
    store,
    instaml.transform({ attrs: store.attrs, schema: schema }, txSteps),
  );

  const descRes = query(
    { store: newStore },
    { tests: { $: { order: { date: "desc" } } } },
  ).data.tests.map((x) => x.date);

  const numDescRes = query(
    { store: newStore },
    { tests: { $: { order: { num: "desc" } } } },
  ).data.tests.map((x) => x.num);

  const descExpected = [
    4,
    3,
    2,
    1,
    0,
    -1,
    -2,
    -3,
    -4,
    -5,
    undefined,
    null,
    undefined,
    null,
  ];

  expect(descRes).toEqual(descExpected);

  expect(numDescRes).toEqual(descExpected);

  const ascRes = query(
    { store: newStore },
    { tests: { $: { order: { date: "asc" } } } },
  ).data.tests.map((x) => x.date);

  const numAscRes = query(
    { store: newStore },
    { tests: { $: { order: { num: "asc" } } } },
  ).data.tests.map((x) => x.num);

  const ascExpected = [
    null,
    undefined,
    null,
    undefined,
    -5,
    -4,
    -3,
    -2,
    -1,
    0,
    1,
    2,
    3,
    4,
  ];

  expect(ascRes).toEqual(ascExpected);
  expect(numAscRes).toEqual(ascExpected);
});

test("$isNull", () => {
  const q = { books: { $: { where: { title: { $isNull: true } } } } };
  expect(query({ store }, q).data.books.length).toEqual(0);
  const chunks = [
    tx.books[randomUUID()].update({ title: null }),
    tx.books[randomUUID()].update({ pageCount: 20 }),
  ];
  const txSteps = instaml.transform({ attrs: store.attrs }, chunks);
  const newStore = transact(store, txSteps);
  expect(query({ store: newStore }, q).data.books.map((x) => x.title)).toEqual([
    null,
    undefined,
  ]);
});

test("$isNull with relations", () => {
  const q = { users: { $: { where: { bookshelves: { $isNull: true } } } } };
  expect(query({ store }, q).data.users.length).toEqual(0);
  const chunks = [tx.users[randomUUID()].update({ handle: "dww" })];
  const txSteps = instaml.transform({ attrs: store.attrs }, chunks);
  const newStore = transact(store, txSteps);
  expect(query({ store: newStore }, q).data.users.map((x) => x.handle)).toEqual(
    ["dww"],
  );

  const bookId = query(
    { store },
    { books: { $: { where: { title: "The Count of Monte Cristo" } } } },
  ).data.books[0].id;

  const usersWithBook = query(
    { store },
    {
      users: {
        $: {
          where: { "bookshelves.books.title": "The Count of Monte Cristo" },
        },
      },
    },
  ).data.users.map((x) => x.handle);

  const storeWithNullTitle = transact(
    newStore,
    instaml.transform({ attrs: newStore.attrs }, [
      tx.books[bookId].update({ title: null }),
    ]),
  );

  const usersWithNullTitle = query(
    { store: storeWithNullTitle },
    {
      users: {
        $: {
          where: { "bookshelves.books.title": { $isNull: true } },
        },
      },
    },
  ).data.users.map((x) => x.handle);

  expect(usersWithNullTitle).toEqual([...usersWithBook, "dww"]);
});

test("$isNull with reverse relations", () => {
  const q = {
    bookshelves: { $: { where: { "users.id": { $isNull: true } } }, users: {} },
  };
  expect(query({ store }, q).data.bookshelves.length).toBe(0);

  const chunks = [
    tx.bookshelves[randomUUID()].update({ name: "Lonely shelf" }),
  ];
  const txSteps = instaml.transform({ attrs: store.attrs }, chunks);
  const newStore = transact(store, txSteps);
  expect(
    query({ store: newStore }, q).data.bookshelves.map((x) => x.name),
  ).toEqual(["Lonely shelf"]);
});

test("$not", () => {
  const q = { tests: { $: { where: { val: { $not: "a" } } } } };
  expect(query({ store }, q).data.tests.length).toEqual(0);
  const chunks = [
    tx.tests[randomUUID()].update({ val: "a" }),
    tx.tests[randomUUID()].update({ val: "b" }),
    tx.tests[randomUUID()].update({ val: "c" }),
    tx.tests[randomUUID()].update({ val: null }),
    tx.tests[randomUUID()].update({ undefinedVal: "d" }),
  ];
  const txSteps = instaml.transform({ attrs: store.attrs }, chunks);
  const newStore = transact(store, txSteps);
  expect(query({ store: newStore }, q).data.tests.map((x) => x.val)).toEqual([
    "b",
    "c",
    null,
    undefined,
  ]);
});

test("comparators", () => {
  const schema = i.schema({
    entities: {
      tests: i.entity({
        string: i.string().indexed(),
        number: i.number().indexed(),
        date: i.date().indexed(),
        boolean: i.boolean().indexed(),
      }),
    },
  });

  const txSteps = [];
  for (let i = 0; i < 5; i++) {
    txSteps.push(
      tx.tests[randomUUID()].update({
        string: `${i}`,
        number: i,
        date: i,
        boolean: i % 2 === 0,
      }),
    );
  }

  const newStore = transact(
    store,
    instaml.transform({ attrs: store.attrs, schema: schema }, txSteps),
  );

  function runQuery(dataType, op, value) {
    const res = query(
      { store: newStore },
      {
        tests: {
          $: { where: { [dataType]: { [op]: value } } },
        },
      },
    );
    return res.data.tests.map((x) => x[dataType]);
  }

  expect(runQuery("string", "$gt", "2")).toEqual(["3", "4"]);
  expect(runQuery("string", "$gte", "2")).toEqual(["2", "3", "4"]);
  expect(runQuery("string", "$lt", "2")).toEqual(["0", "1"]);
  expect(runQuery("string", "$lte", "2")).toEqual(["0", "1", "2"]);

  expect(runQuery("number", "$gt", 2)).toEqual([3, 4]);
  expect(runQuery("number", "$gte", 2)).toEqual([2, 3, 4]);
  expect(runQuery("number", "$lt", 2)).toEqual([0, 1]);
  expect(runQuery("number", "$lte", 2)).toEqual([0, 1, 2]);

  expect(runQuery("date", "$gt", 2)).toEqual([3, 4]);
  expect(runQuery("date", "$gte", 2)).toEqual([2, 3, 4]);
  expect(runQuery("date", "$lt", 2)).toEqual([0, 1]);
  expect(runQuery("date", "$lte", 2)).toEqual([0, 1, 2]);

  // Accepts string dates
  expect(
    runQuery("date", "$lt", JSON.parse(JSON.stringify(new Date()))),
  ).toEqual([0, 1, 2, 3, 4]);
  expect(
    runQuery("date", "$gt", JSON.parse(JSON.stringify(new Date()))),
  ).toEqual([]);

  expect(runQuery("boolean", "$gt", true)).toEqual([]);
  expect(runQuery("boolean", "$gte", true)).toEqual([true, true, true]);
  expect(runQuery("boolean", "$lt", true)).toEqual([false, false]);
  expect(runQuery("boolean", "$lte", true)).toEqual([
    true,
    false,
    true,
    false,
    true,
  ]);
});
