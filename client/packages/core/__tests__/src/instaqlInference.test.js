import { test, expect } from "vitest";
import { createStore } from "../../src/store";
import query from "../../src/instaql";
import { id } from "../../src";

test("many-to-many with inference", () => {
  const ids = {
    postsTagsLink: id(),
    postsEntity: id(),
    tagsEntity: id(),
    post1: id(),
    tag1: id(),
  };

  const { result } = queryData(
    { inference: true },
    [
      {
        id: ids.postsTagsLink,
        "value-type": "ref",
        cardinality: "many",
        "forward-identity": [id(), "posts", "tags"],
        "unique?": false,
        "index?": false,
        "reverse-identity": [id(), "tags", "posts"],
      },
      {
        id: ids.postsEntity,
        "value-type": "blob",
        cardinality: "one",
        "forward-identity": [id(), "posts", "id"],
        "unique?": true,
        "index?": true,
      },
      {
        id: ids.tagsEntity,
        "value-type": "blob",
        cardinality: "one",
        "forward-identity": [id(), "tags", "id"],
        "unique?": true,
        "index?": true,
      },
    ],
    [
      [ids.post1, ids.postsEntity, ids.post1, Date.now()],
      [ids.tag1, ids.tagsEntity, ids.tag1, Date.now()],
      [ids.post1, ids.postsTagsLink, ids.tag1, Date.now()],
    ],
    {
      posts: {
        tags: {},
      },
      tags: {
        posts: {},
      },
    },
  );

  expect(result.data.posts).to.have.lengthOf(1);
  expect(result.data.posts.at(0).id).toBe(ids.post1);
  expect(Array.isArray(result.data.posts.at(0).tags)).to.be.true;
  expect(result.data.posts.at(0).tags.at(0).id).toBe(ids.tag1);

  expect(result.data.tags).to.have.lengthOf(1);
  expect(result.data.tags.at(0).id).toBe(ids.tag1);
  expect(Array.isArray(result.data.tags.at(0).posts)).to.be.true;
  expect(result.data.tags.at(0).posts.at(0).id).toBe(ids.post1);
});

test("one-to-one with inference", () => {
  const ids = {
    usersProfilesLink: id(),
    usersEntity: id(),
    profilesEntity: id(),
    user1: id(),
    profile1: id(),
  };

  const { result } = queryData(
    { inference: true },
    [
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
        id: ids.usersEntity,
        "value-type": "blob",
        cardinality: "one",
        "forward-identity": [id(), "users", "id"],
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
    ],
    [
      [ids.user1, ids.usersEntity, ids.user1, Date.now()],
      [ids.profile1, ids.profilesEntity, ids.profile1, Date.now()],
      [ids.user1, ids.usersProfilesLink, ids.profile1, Date.now()],
    ],
    {
      users: {
        profile: {},
      },
      profiles: {
        user: {},
      },
    },
  );

  expect(result.data.users).to.have.lengthOf(1);
  expect(result.data.users.at(0).id).toBe(ids.user1);
  expect(Array.isArray(result.data.users.at(0).profile)).to.be.false;
  expect(result.data.users.at(0).profile).toMatchObject({ id: ids.profile1 });

  expect(result.data.profiles).to.have.lengthOf(1);
  expect(result.data.profiles.at(0).id).toBe(ids.profile1);
  expect(Array.isArray(result.data.profiles.at(0).user)).to.be.false;
  expect(result.data.profiles.at(0).user).toMatchObject({ id: ids.user1 });
});

test("one-to-one without inference", () => {
  const ids = {
    usersProfilesLink: id(),
    usersEntity: id(),
    profilesEntity: id(),
    user1: id(),
    profile1: id(),
  };

  const { result } = queryData(
    { inference: false },
    [
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
        id: ids.usersEntity,
        "value-type": "blob",
        cardinality: "one",
        "forward-identity": [id(), "users", "id"],
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
    ],
    [
      [ids.user1, ids.usersEntity, ids.user1, Date.now()],
      [ids.profile1, ids.profilesEntity, ids.profile1, Date.now()],
      [ids.user1, ids.usersProfilesLink, ids.profile1, Date.now()],
    ],
    {
      users: {
        profile: {},
      },
      profiles: {
        user: {},
      },
    },
  );

  expect(result.data.users).to.have.lengthOf(1);
  expect(result.data.users.at(0).id).toBe(ids.user1);
  expect(Array.isArray(result.data.users.at(0).profile)).to.be.true;
  expect(result.data.users.at(0).profile.at(0).id).toBe(ids.profile1);

  expect(result.data.profiles).to.have.lengthOf(1);
  expect(result.data.profiles.at(0).id).toBe(ids.profile1);
  expect(result.data.profiles.at(0).user.at(0).id).toBe(ids.user1);
});

function indexAttrs(attrs) {
  return attrs.reduce((res, x) => {
    res[x.id] = x;
    return res;
  }, {});
}

function queryData(config, attrs, triples, q) {
  const store = createStore(indexAttrs(attrs), triples);
  if (config.inference) store.schema = {};
  const result = query({ store }, q);

  return { result, store };
}
