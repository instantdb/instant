import { test, expect } from "vitest";
import { createStore } from "../../src/store";
import query from "../../src/instaql";
import { id } from "../../src";

const ids = {
  usersProfilesLink: id(),
  usersCatsLink: id(),
  friendsLink: id(),
  usersEntity: id(),
  catsEntity: id(),
  profilesEntity: id(),
  user1: id(),
  profile1: id(),
  cat1: id(),
};

const attrs = [
  {
    id: ids.usersProfilesLink,
    "value-type": "ref",
    cardinality: "one",
    "forward-identity": [id(), "users", "profile"],
    "unique?": true,
    "index?": false,
    "reverse-identity": [id(), "profiles", "user"],
  },
  {
    id: ids.usersCatsLink,
    "value-type": "ref",
    cardinality: "many",
    "forward-identity": [id(), "users", "cats"],
    "unique?": true,
    "index?": false,
    "reverse-identity": [id(), "cats", "user"],
  },
  {
    id: ids.usersEntity,
    "value-type": "blob",
    cardinality: "one",
    "forward-identity": [id(), "users", "id"],
    "unique?": true,
    "index?": true,
  },
  {
    id: ids.catsEntity,
    "value-type": "blob",
    cardinality: "one",
    "forward-identity": [id(), "cats", "id"],
    "unique?": true,
    "index?": true,
  },
  {
    id: ids.profilesEntity,
    "value-type": "blob",
    cardinality: "one",
    "forward-identity": [id(), "profiles", "id"],
    "unique?": true,
    "index?": true,
  },
];

const triples = [
  [ids.user1, ids.usersEntity, ids.user1, Date.now()],
  [ids.profile1, ids.profilesEntity, ids.profile1, Date.now()],
  [ids.cat1, ids.catsEntity, ids.cat1, Date.now()],
  [ids.user1, ids.usersProfilesLink, ids.profile1, Date.now()],
  [ids.user1, ids.usersCatsLink, ids.cat1, Date.now()],
];

const sampleQuery = {
  users: { profile: {}, cats: {} },
  profiles: { user: {} },
};

const expectedResult = {
  users: [
    {
      id: ids.user1,
      profile: {
        id: ids.profile1,
      },
      cats: [
        {
          id: ids.cat1,
        },
      ],
    },
  ],
  profiles: [
    {
      id: ids.profile1,
      user: {
        id: ids.user1,
      },
    },
  ],
};

test("Simple Query", () => {
  const indexedAttrs = attrs.reduce((res, x) => {
    res[x.id] = x;
    return res;
  }, {});

  const store = createStore(indexedAttrs, triples);
  store.schema = {};

  const r = query({ store }, sampleQuery);

  expect(r.data).toEqual(expectedResult);
});
