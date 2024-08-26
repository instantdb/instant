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

  expect(instaml.transform(zenecaAttrs, ops)).toEqual([
    ["add-triple", testId, zenecaAttrToId["books/title"], "New Title"],
    ["add-triple", testId, zenecaAttrToId["books/id"], testId],
  ]);
});

test("optimistically adds attrs if they don't exist", () => {
  const testId = uuid();

  const ops = instatx.tx.books[testId].update({ newAttr: "New Title" });

  expect(instaml.transform(zenecaAttrs, ops)).toEqual([
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
  ]);
});

test("lookup resolves attr ids", () => {
  const ops = instatx.tx.users[
    instatx.lookup("email", "stopa@instantdb.com")
  ].update({
    handle: "stopa",
  });

  const stopaLookup = [zenecaAttrToId["users/email"], "stopa@instantdb.com"];

  expect(instaml.transform(zenecaAttrs, ops)).toEqual([
    ["add-triple", stopaLookup, zenecaAttrToId["users/handle"], "stopa"],
    ["add-triple", stopaLookup, zenecaAttrToId["users/id"], stopaLookup],
  ]);
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

  expect(instaml.transform(zenecaAttrs, ops)).toEqual([
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
  ]);
});
