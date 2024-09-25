import { test, expect } from "vitest";
import zenecaAttrs from "./data/zeneca/attrs.json";
import zenecaTriples from "./data/zeneca/triples.json";
import { createStore, transact, allMapValues, toJSON, fromJSON } from "../../src/store";
import query from "../../src/instaql";
import uuid from "../../src/utils/uuid";
import { tx } from "../../src/instatx";
import * as instaml from "../../src/instaml";
import * as datalog from "../../src/datalog";

const zenecaIdToAttr = zenecaAttrs.reduce((res, x) => {
  res[x.id] = x;
  return res;
}, {});

const store = createStore(zenecaIdToAttr, zenecaTriples);

function checkIndexIntegrity(store) {
  const tripleSort = (a, b) => {
    const [e_a, aid_a, v_a, t_a] = a;
    const [e_b, aid_b, v_b, t_b] = b;

    const e_compare = e_a.localeCompare(e_b);
    if (e_compare !== 0) {
      return e_compare;
    }
    const a_compare = aid_a.localeCompare(aid_b);
    if (a_compare !== 0) {
      return a_compare;
    }
    const v_compare = JSON.stringify(v_a).localeCompare(JSON.stringify(v_b));
    if (v_compare !== 0) {
      return v_compare;
    }
    return t_a - t_b;
  };
  const eavTriples = allMapValues(store.eav, 3).sort(tripleSort);
  const aevTriples = allMapValues(store.aev, 3).sort(tripleSort);
  const vaeTriples = allMapValues(store.vae, 3);

  // Check eav and aev have all the same values
  expect(eavTriples).toEqual(aevTriples);

  // Check vae doesn't have extra triples
  for (const triple of vaeTriples) {
    const [e, a, v] = triple;
    expect(store.eav.get(e)?.get(a)?.get(v)).toEqual(triple);
  }

  // Check vae has all of the triples it should have
  for (const triple of eavTriples) {
    const [e, a, v] = triple;
    const attr = store.attrs[a];
    if (attr["value-type"] === "ref") {
      expect(store.vae.get(v)?.get(a)?.get(e)).toEqual(triple);
    }
  }
}

test("simple add", () => {
  const id = uuid();
  const chunk = tx.users[id].update({ handle: "bobby" });
  const txSteps = instaml.transform(store.attrs, chunk);
  const newStore = transact(store, txSteps);
  expect(
    query({ store: newStore }, { users: {} }).data.users.map((x) => x.handle),
  ).contains("bobby");

  checkIndexIntegrity(newStore);
});

test("cardinality-one add", () => {
  const id = uuid();
  const chunk = tx.users[id]
    .update({ handle: "bobby" })
    .update({ handle: "bob" });
  const txSteps = instaml.transform(store.attrs, chunk);
  const newStore = transact(store, txSteps);
  const ret = datalog
    .query(newStore, {
      find: ["?v"],
      where: [[id, "?attr", "?v"]],
    })
    .flatMap((vec) => vec[0]);
  expect(ret).contains("bob");
  expect(ret).not.contains("bobby");
  checkIndexIntegrity(newStore);
});

test("link/unlink", () => {
  const bookshelfId = uuid();
  const userId = uuid();
  const userChunk = tx.users[userId]
    .update({ handle: "bobby" })
    .link({ bookshelves: bookshelfId });
  const bookshelfChunk = tx.bookshelves[bookshelfId].update({
    name: "my books",
  });
  const txSteps = instaml.transform(store.attrs, [userChunk, bookshelfChunk]);
  const newStore = transact(store, txSteps);
  expect(
    query(
      { store: newStore },
      {
        users: {
          $: { where: { handle: "bobby" } },
          bookshelves: {},
        },
      },
    ).data.users.map((x) => [x.handle, x.bookshelves.map((x) => x.name)]),
  ).toEqual([["bobby", ["my books"]]]);
  checkIndexIntegrity(newStore);

  const secondBookshelfId = uuid();
  const secondBookshelfChunk = tx.bookshelves[secondBookshelfId].update({
    name: "my second books",
  });
  const unlinkFirstChunk = tx.users[userId]
    .unlink({
      bookshelves: bookshelfId,
    })
    .link({ bookshelves: secondBookshelfId });
  const secondTxSteps = instaml.transform(newStore.attrs, [
    unlinkFirstChunk,
    secondBookshelfChunk,
  ]);
  const secondStore = transact(newStore, secondTxSteps);
  expect(
    query(
      { store: secondStore },
      {
        users: {
          $: { where: { handle: "bobby" } },
          bookshelves: {},
        },
      },
    ).data.users.map((x) => [x.handle, x.bookshelves.map((x) => x.name)]),
  ).toEqual([["bobby", ["my second books"]]]);
  checkIndexIntegrity(secondStore);
});

test("link/unlink multi", () => {
  const bookshelfId1 = uuid();
  const bookshelfId2 = uuid();
  const userId = uuid();
  const userChunk = tx.users[userId]
    .update({ handle: "bobby" })
    .link({ bookshelves: [bookshelfId1, bookshelfId2] });

  const bookshelf1Chunk = tx.bookshelves[bookshelfId1].update({
    name: "my books 1",
  });
  const bookshelf2Chunk = tx.bookshelves[bookshelfId2].update({
    name: "my books 2",
  });
  const txSteps = instaml.transform(store.attrs, [
    userChunk,
    bookshelf1Chunk,
    bookshelf2Chunk,
  ]);

  const newStore = transact(store, txSteps);
  expect(
    query(
      { store: newStore },
      {
        users: {
          $: { where: { handle: "bobby" } },
          bookshelves: {},
        },
      },
    ).data.users.map((x) => [x.handle, x.bookshelves.map((x) => x.name)]),
  ).toEqual([["bobby", ["my books 1", "my books 2"]]]);
  checkIndexIntegrity(newStore);

  const bookshelfId3 = uuid();
  const bookshelf3Chunk = tx.bookshelves[bookshelfId3].update({
    name: "my books 3",
  });
  const unlinkChunk = tx.users[userId]
    .unlink({
      bookshelves: [bookshelfId1, bookshelfId2],
    })
    .link({ bookshelves: bookshelfId3 });
  const secondTxSteps = instaml.transform(newStore.attrs, [
    unlinkChunk,
    bookshelf3Chunk,
  ]);
  const secondStore = transact(newStore, secondTxSteps);
  expect(
    query(
      { store: secondStore },
      {
        users: {
          $: { where: { handle: "bobby" } },
          bookshelves: {},
        },
      },
    ).data.users.map((x) => [x.handle, x.bookshelves.map((x) => x.name)]),
  ).toEqual([["bobby", ["my books 3"]]]);
  checkIndexIntegrity(secondStore);
});

test("delete entity", () => {
  const bookshelfId = uuid();
  const userId = uuid();
  const userChunk = tx.users[userId]
    .update({ handle: "bobby" })
    .link({ bookshelves: bookshelfId });
  const bookshelfChunk = tx.bookshelves[bookshelfId].update({
    name: "my books",
  });
  const txSteps = instaml.transform(store.attrs, [userChunk, bookshelfChunk]);
  const newStore = transact(store, txSteps);
  checkIndexIntegrity(newStore);

  const retOne = datalog
    .query(newStore, {
      find: ["?v"],
      where: [[bookshelfId, "?attr", "?v"]],
    })
    .flatMap((vec) => vec[0]);
  const retTwo = datalog
    .query(newStore, {
      find: ["?v"],
      where: [["?v", "?attr", bookshelfId]],
    })
    .flatMap((vec) => vec[0]);
  expect(retOne).contains("my books");
  expect(retTwo).contains(userId);

  const txStepsTwo = instaml.transform(
    newStore.attrs,
    tx.bookshelves[bookshelfId].delete(),
  );
  const newStoreTwo = transact(newStore, txStepsTwo);
  const retThree = datalog
    .query(newStoreTwo, {
      find: ["?v"],
      where: [[bookshelfId, "?attr", "?v"]],
    })
    .flatMap((vec) => vec[0]);
  const retFour = datalog
    .query(newStoreTwo, {
      find: ["?v"],
      where: [["?v", "?attr", bookshelfId]],
    })
    .flatMap((vec) => vec[0]);

  expect(retThree).toEqual([]);
  expect(retFour).toEqual([]);
  checkIndexIntegrity(newStoreTwo);
});

test("new attrs", () => {
  const colorId = uuid();
  const userId = uuid();
  const userChunk = tx.users[userId]
    .update({ handle: "bobby" })
    .link({ colors: colorId });
  const colorChunk = tx.colors[colorId].update({ name: "red" });
  const txSteps = instaml.transform(store.attrs, [userChunk, colorChunk]);
  const newStore = transact(store, txSteps);
  expect(
    query(
      { store: newStore },
      {
        users: {
          $: { where: { handle: "bobby" } },
          colors: {},
        },
      },
    ).data.users.map((x) => [x.handle, x.colors.map((x) => x.name)]),
  ).toEqual([["bobby", ["red"]]]);

  checkIndexIntegrity(newStore);
});

test("delete attr", () => {
  expect(
    query({ store }, { users: {} }).data.users.map((x) => [
      x.handle,
      x.fullName,
    ]),
  ).toEqual([
    ["joe", "Joe Averbukh"],
    ["alex", "Alex"],
    ["stopa", "Stepan Parunashvili"],
    ["nicolegf", "Nicole"],
  ]);
  const fullNameAttr = instaml.getAttrByFwdIdentName(
    store.attrs,
    "users",
    "fullName",
  );
  const newStore = transact(store, [["delete-attr", fullNameAttr.id]]);
  expect(
    query({ store: newStore }, { users: {} }).data.users.map((x) => [
      x.handle,
      x.fullName,
    ]),
  ).toEqual([
    ["joe", undefined],
    ["alex", undefined],
    ["stopa", undefined],
    ["nicolegf", undefined],
  ]);

  checkIndexIntegrity(newStore);
});

test("update attr", () => {
  expect(
    query({ store }, { users: {} }).data.users.map((x) => [
      x.handle,
      x.fullName,
    ]),
  ).toEqual([
    ["joe", "Joe Averbukh"],
    ["alex", "Alex"],
    ["stopa", "Stepan Parunashvili"],
    ["nicolegf", "Nicole"],
  ]);
  const fullNameAttr = instaml.getAttrByFwdIdentName(
    store.attrs,
    "users",
    "fullName",
  );
  const fwdIdent = fullNameAttr["forward-identity"];
  const newStore = transact(store, [
    [
      "update-attr",
      {
        id: fullNameAttr.id,
        "forward-identity": [fwdIdent[0], "users", "fullNamez"],
      },
    ],
  ]);
  expect(
    query({ store: newStore }, { users: {} }).data.users.map((x) => [
      x.handle,
      x.fullNamez,
    ]),
  ).toEqual([
    ["joe", "Joe Averbukh"],
    ["alex", "Alex"],
    ["stopa", "Stepan Parunashvili"],
    ["nicolegf", "Nicole"],
  ]);
});

test("JSON serialization round-trips", () => {
  const newStore = fromJSON(toJSON(store));
  expect(store).toEqual(newStore);
});
