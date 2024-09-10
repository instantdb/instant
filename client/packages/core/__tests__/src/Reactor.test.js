// https://www.npmjs.com/package/fake-indexeddb
import "fake-indexeddb/auto";
import { test, expect } from "vitest";

import IndexedDBStorage from "../../src/IndexedDBStorage";

import Reactor from "../../src/Reactor";
import InMemoryStorage from "../../src/InMemoryStorage";
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

  await reactor.querySubs.waitForSync();

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
      email: "s@example.com",
    }),
    instatx.tx.bookshelves[bookshelfId].link({
      users: { handle: "stopa" },
    }),
    instatx.tx.bookshelves[bookshelfId].unlink({
      users: ["handle", "joe"],
    }),
    instatx.tx.bookshelves[bookshelfId].unlink({
      users: instatx.lookup("handle", "joe"),
    }),
  ];

  // create transactions without any attributes
  const optimisticSteps = instaml.transform({}, ops);

  const mutations = new Map([["k", { "tx-steps": optimisticSteps }]]);

  const rewrittenWithoutAttrs = reactor
    ._rewriteMutations({}, mutations)
    .get("k")["tx-steps"];

  // Check that we didn't clobber anything in our rewrite
  expect(rewrittenWithoutAttrs).toEqual(optimisticSteps);

  // rewrite them with the new server attributes
  const rewrittenSteps = reactor
    ._rewriteMutations(zenecaIdToAttr, mutations)
    .get("k")["tx-steps"];

  const serverSteps = instaml.transform(zenecaIdToAttr, ops);
  expect(rewrittenSteps).toEqual(serverSteps);
});

test("rewrite mutations works with multiple transactions", () => {
  const appId = uuid();
  const reactor = new Reactor({ appId });
  reactor._initStorage(InMemoryStorage);

  const bookId = "bookId";
  const bookshelfId = "bookshelfId";
  const ops = [
    instatx.tx.books[bookId].update({ title: "title" }),
    instatx.tx.users[instatx.lookup("handle", "stopa")].update({
      email: "s@example.com",
    }),
    instatx.tx.bookshelves[bookshelfId].link({
      users: { handle: "stopa" },
    }),
    instatx.tx.bookshelves[bookshelfId].unlink({
      users: ["handle", "joe"],
    }),
    instatx.tx.bookshelves[bookshelfId].unlink({
      users: instatx.lookup("handle", "joe"),
    }),
  ];

  const keys = ["a", "b", "c", "d"];

  for (const k of keys) {
    const attrs = reactor.optimisticAttrs();
    const steps = instaml.transform(attrs, ops);
    const mut = {
      op: "transact",
      "tx-steps": steps,
    };
    reactor.pendingMutations.set((prev) => {
      prev.set(k, mut);
      return prev;
    });
  }

  // rewrite them with the new server attributes
  const rewrittenMutations = reactor._rewriteMutations(
    zenecaIdToAttr,
    reactor.pendingMutations.currentValue,
  );

  const serverSteps = instaml.transform(zenecaIdToAttr, ops);
  for (const k of keys) {
    expect(rewrittenMutations.get(k)["tx-steps"]).toEqual(serverSteps);
  }
});
