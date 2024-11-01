import { test, expect } from "vitest";
import ds from "datascript";
import {
  createStore,
  transact,
  allMapValues,
  toJSON,
  fromJSON,
} from "../../src/store";
import query from "../../src/instaql";
import uuid from "../../src/utils/uuid";
import { tx } from "../../src/instatx";
import * as instaml from "../../src/instaml";
import * as datalog from "../../src/datalog";

import movieAttrs from "./data/movies/attrs.json";
import movieTriples from "./data/movies/triples.json";

const store = createStore(movieAttrs, movieTriples);

function aid(friendlyName) {
  const [etype, label] = friendlyName.split("/");
  const attr = instaml.getAttrByFwdIdentName(store.attrs, etype, label);
  return attr.id;
}

test("single", () => {
  const db = store.dsdb;
  const q = `
    [:find ?eid
     :where [?eid "${aid("movie/title")}" "Predator"]]
  `;
  const res = ds
    .q(q, db)
    .map((x) => x[0])
    .toSorted();
  expect(res).toEqual([33]);
});

function mid(movieName) {
  const db = store.dsdb;
  const q = `
    [:find ?eid
     :where [?eid "${aid("movie/title")}" "${movieName}"]]
  `;
  const res = ds.q(q, db)[0];
  return res[0];
}

function pid(personName) {
  const db = store.dsdb;
  const q = `
    [:find ?eid
     :where [?eid "${aid("person/name")}" "${personName}"]]
  `;
  const res = ds.q(q, db)[0];
  return res[0];
}

test("helpers", () => {
  expect(mid("Predator")).toEqual(33);
  expect(pid("James Cameron")).toEqual(61);
});

test("where", () => {
  const db = store.dsdb;
  const q = `
    [:find ?directorName
     :where [?movieId "${aid("movie/title")}" "The Terminator"]
            [?movieId "${aid("movie/director")}" ?directorId]
            [?directorId "${aid("person/name")}" ?directorName]]
  `;
  const res = ds
    .q(q, db)
    .map((x) => x[0])
    .toSorted();
  expect(res).toEqual(["James Cameron"]);
});
