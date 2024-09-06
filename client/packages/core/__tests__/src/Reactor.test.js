// https://www.npmjs.com/package/fake-indexeddb
import "fake-indexeddb/auto";
import { test, expect } from "vitest";

import IndexedDBStorage from "../../src/IndexedDBStorage";

import Reactor from "../../src/Reactor";
import * as instaml from "../../src/instaml";
import * as instatx from "../../src/instatx";
import zenecaAttrs from "./data/zeneca/attrs.json";
import zenecaTriples from "./data/zeneca/triples.json";
import uuid from "../../src/utils/uuid";

const zenecaIdToAttr = zenecaAttrs.reduce((res, x) => {
  res[x.id] = x;
  return res;
}, {});

test("querySubs round-trips", async () => {
  const appId = uuid();
  const reactor = new Reactor({ appId });
  reactor._initStorage(IndexedDBStorage);
  reactor._setAttrs(zenecaAttrs);
  const q = { users: {} };

  await reactor.querySubs.waitForLoaded();

  const resultOne = new Promise((resolve, reject) => {
    reactor.subscribeQuery(q, (res) => {
      if (res.error) {
        reject(res.error);
      }
      resolve(res);
    });
  });

  // Initialize the store
  reactor._handleReceive({
    op: "add-query-ok",
    q,
    "processed-tx-id": 0,
    result: [
      {
        data: {
          "datalog-result": {
            "join-rows": [zenecaTriples],
          },
        },
        "child-nodes": [],
      },
    ],
  });

  const data1 = await resultOne;

  // Make sure the store has the data we expect
  expect(data1.data.users.map((x) => x.handle)).toEqual([
    "joe",
    "alex",
    "stopa",
    "nicolegf",
  ]);

  // Create a new reactor
  const reactor2 = new Reactor({ appId });
  reactor2._initStorage(IndexedDBStorage);
  reactor2._setAttrs(zenecaAttrs);

  await reactor2.querySubs.waitForLoaded();

  // Check that it pull the data from indexedDB
  const res = await new Promise((resolve, reject) => {
    reactor2.subscribeQuery(q, (res) => {
      if (res.error) {
        reject(res.error);
      }
      resolve(res);
    });
  });

  expect(res.data.users.map((x) => x.handle)).toEqual([
    "joe",
    "alex",
    "stopa",
    "nicolegf",
  ]);
});

test("rewrite mutations", () => {
  const appId = uuid();
  const reactor = new Reactor({ appId });

  const bookId = "bookId";
  const bookshelfId = "bookshelfId";
  const ops = [
    instatx.tx.books[bookId].update({ title: "title" }),
    instatx.tx.users[instatx.lookup("handle", "stopa")].update({
      handle: "stopa2",
    }),
    instatx.tx.bookshelves[bookshelfId].link({
      users: { handle: "stopa" },
    }),
  ];
  const optimisticSteps = instaml.transform({}, ops);

  const serverSteps = instaml.transform(zenecaIdToAttr, ops);

  const rewrittenSteps = reactor
    ._rewriteMutations(
      zenecaIdToAttr,
      new Map([["k", { "tx-steps": optimisticSteps, chunks: ops }]]),
    )
    .get("k")["tx-steps"];

  expect(rewrittenSteps).toEqual(serverSteps);
});

test("rewrite mutations doesn't explode if the rewrite fails", () => {
  const appId = uuid();
  const reactor = new Reactor({ appId });

  const ops = [
    instatx.tx.books[instatx.lookup("title", "title")].update({ a: 1 }),
  ];

  // Ensure that our ops throw when the have the server attrs.
  expect(() => instaml.transform(zenecaIdToAttr, ops)).toThrowError(
    "title is not a unique attribute.",
  );
  const optimisticSteps = instaml.transform({}, ops);

  const rewrittenMutation = reactor
    ._rewriteMutations(
      zenecaIdToAttr,
      new Map([["k", { "tx-steps": optimisticSteps, chunks: ops }]]),
    )
    .get("k");

  expect(rewrittenMutation).toEqual({
    "tx-steps": [],
    chunks: ops,
    error: expect.objectContaining({
      message: "title is not a unique attribute.",
    }),
  });
});
