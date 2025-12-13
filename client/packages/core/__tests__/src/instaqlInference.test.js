import { test, expect } from 'vitest';
import { createStore, AttrsStoreClass } from '../../src/store';
import query from '../../src/instaql';
import { i, id } from '../../src';
import { createLinkIndex } from '../../src/utils/linkIndex';

test('many-to-many with inference', () => {
  const schema = i.schema({
    entities: {
      posts: i.entity({}),
      tags: i.entity({}),
    },
    links: {
      postsTags: {
        forward: { on: 'posts', has: 'many', label: 'tags' },
        reverse: { on: 'tags', has: 'many', label: 'posts' },
      },
    },
  });

  const ids = {
    postsTagsLink: id(),
    postsEntity: id(),
    tagsEntity: id(),
    post1: id(),
    tag1: id(),
  };

  const { result } = queryData(
    { schema, cardinalityInference: true },
    [
      {
        id: ids.postsTagsLink,
        'value-type': 'ref',
        cardinality: 'many',
        'forward-identity': [id(), 'posts', 'tags'],
        'unique?': false,
        'index?': false,
        'reverse-identity': [id(), 'tags', 'posts'],
      },
      {
        id: ids.postsEntity,
        'value-type': 'blob',
        cardinality: 'one',
        'forward-identity': [id(), 'posts', 'id'],
        'unique?': true,
        'index?': true,
      },
      {
        id: ids.tagsEntity,
        'value-type': 'blob',
        cardinality: 'one',
        'forward-identity': [id(), 'tags', 'id'],
        'unique?': true,
        'index?': true,
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

test('one-to-one with inference', () => {
  const schema = i.schema({
    entities: {
      users: i.entity({}),
      profiles: i.entity({}),
    },
    links: {
      postsTags: {
        forward: { on: 'users', has: 'one', label: 'profile' },
        reverse: { on: 'profiles', has: 'one', label: 'user' },
      },
    },
  });

  const ids = {
    usersProfilesLink: id(),
    usersEntity: id(),
    profilesEntity: id(),
    user1: id(),
    profile1: id(),
  };

  const { result } = queryData(
    { cardinalityInference: true, schema },
    [
      {
        id: ids.usersProfilesLink,
        'value-type': 'ref',
        cardinality: 'one',
        'forward-identity': [id(), 'users', 'profile'],
        'unique?': true,
        'index?': false,
        'reverse-identity': [id(), 'profiles', 'user'],
      },
      {
        id: ids.usersEntity,
        'value-type': 'blob',
        cardinality: 'one',
        'forward-identity': [id(), 'users', 'id'],
        'unique?': true,
        'index?': true,
      },
      {
        id: ids.profilesEntity,
        'value-type': 'blob',
        cardinality: 'one',
        'forward-identity': [id(), 'profiles', 'id'],
        'unique?': true,
        'index?': true,
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

test('one-to-one without inference', () => {
  const ids = {
    usersProfilesLink: id(),
    usersEntity: id(),
    profilesEntity: id(),
    user1: id(),
    profile1: id(),
  };

  const { result } = queryData(
    { cardinalityInference: false },
    [
      {
        id: ids.usersProfilesLink,
        'value-type': 'ref',
        cardinality: 'one',
        'forward-identity': [id(), 'users', 'profile'],
        'unique?': true,
        'index?': false,
        'reverse-identity': [id(), 'profiles', 'user'],
      },
      {
        id: ids.usersEntity,
        'value-type': 'blob',
        cardinality: 'one',
        'forward-identity': [id(), 'users', 'id'],
        'unique?': true,
        'index?': true,
      },
      {
        id: ids.profilesEntity,
        'value-type': 'blob',
        cardinality: 'one',
        'forward-identity': [id(), 'profiles', 'id'],
        'unique?': true,
        'index?': true,
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

function indexAttrs(attrs, schema) {
  const linkIndex = schema ? createLinkIndex(schema) : undefined;
  return new AttrsStoreClass(
    attrs.reduce((acc, attr) => {
      acc[attr.id] = attr;
      return acc;
    }, {}),
    linkIndex,
  );
}

function queryData(config, attrs, triples, q) {
  const attrsStore = indexAttrs(attrs, config.schema);
  const store = createStore(attrsStore, triples);
  store.cardinalityInference = config.cardinalityInference;

  const result = query({ store, attrsStore }, q);

  return { result, store };
}
