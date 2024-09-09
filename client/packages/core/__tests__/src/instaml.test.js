import { test, expect } from "vitest";
import * as instaml from "../../src/instaml";
import * as instatx from "../../src/instatx";
import zenecaAttrs from "./data/zeneca/attrs.json";
import uuid from "../../src/utils/uuid";

const zenecaAttrToId = zenecaAttrs.reduce((res, x) => {
  res[`${x["forward-identity"][1]}/${x["forward-identity"][2]}`] = x.id;
  return res;
}, {});

test("simple update transform", () => {
  const testId = uuid();

  const ops = instatx.tx.books[testId].update({ title: "New Title" });
  const result = instaml.transform(zenecaAttrs, ops);

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

  const result = instaml.transform(zenecaAttrs, ops);

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

  const result = instaml.transform(zenecaAttrs, ops);

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

  const result = instaml.transform(zenecaAttrs, ops);
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

  const result = instaml.transform({}, ops);
  const expected = [
    [
      "add-attr",
      {
        id: expect.any(String),
        "forward-identity": [expect.any(String), "users", "id"],
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
        "forward-identity": [expect.any(String), "user_prefs", "id"],
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

test("it throws if you use an invalid link attr", () => {
  expect(() =>
    instaml.transform(
      {},
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
      "index?": false,
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
      attrs,
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

  const result = instaml.transform({}, ops);

  const expected = [
    [
      "add-attr",
      {
        cardinality: "one",
        "forward-identity": [expect.any(String), "nsA", "id"],
        id: expect.any(String),
        "index?": false,
        isUnsynced: true,
        "unique?": false,
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
        "unique?": false,
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
