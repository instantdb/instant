import { test, expect } from 'vitest';
import zenecaAttrs from './data/zeneca/attrs.json';
import zenecaTriples from './data/zeneca/triples.json';
import {
  createStore,
  transact,
  allMapValues,
  toJSON,
  fromJSON,
  transact,
} from '../../src/store';
import query from '../../src/instaql';
import uuid from '../../src/utils/uuid';
import { tx } from '../../src/instatx';
import * as instaml from '../../src/instaml';
import * as datalog from '../../src/datalog';
import * as instatx from '../../src/instatx';
import { i, id } from '../../src';
import { createLinkIndex } from '../../src/utils/linkIndex';

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
    if (attr['value-type'] === 'ref') {
      expect(store.vae.get(v)?.get(a)?.get(e)).toEqual(triple);
    }
  }
}

test('simple add', () => {
  const id = uuid();
  const chunk = tx.users[id].update({ handle: 'bobby' });
  const txSteps = instaml.transform({ attrs: store.attrs }, chunk);
  const newStore = transact(store, txSteps);
  expect(
    query({ store: newStore }, { users: {} }).data.users.map((x) => x.handle),
  ).contains('bobby');

  checkIndexIntegrity(newStore);
});

test('cardinality-one add', () => {
  const id = uuid();
  const chunk = tx.users[id]
    .update({ handle: 'bobby' })
    .update({ handle: 'bob' });
  const txSteps = instaml.transform({ attrs: store.attrs }, chunk);
  const newStore = transact(store, txSteps);
  const ret = datalog
    .query(newStore, {
      find: ['?v'],
      where: [[id, '?attr', '?v']],
    })
    .flatMap((vec) => vec[0]);
  expect(ret).contains('bob');
  expect(ret).not.contains('bobby');
  checkIndexIntegrity(newStore);
});

test('link/unlink', () => {
  const bookshelfId = uuid();
  const userId = uuid();
  const userChunk = tx.users[userId]
    .update({ handle: 'bobby' })
    .link({ bookshelves: bookshelfId });
  const bookshelfChunk = tx.bookshelves[bookshelfId].update({
    name: 'my books',
  });
  const txSteps = instaml.transform({ attrs: store.attrs }, [
    userChunk,
    bookshelfChunk,
  ]);
  const newStore = transact(store, txSteps);
  expect(
    query(
      { store: newStore },
      {
        users: {
          $: { where: { handle: 'bobby' } },
          bookshelves: {},
        },
      },
    ).data.users.map((x) => [x.handle, x.bookshelves.map((x) => x.name)]),
  ).toEqual([['bobby', ['my books']]]);
  checkIndexIntegrity(newStore);

  const secondBookshelfId = uuid();
  const secondBookshelfChunk = tx.bookshelves[secondBookshelfId].update({
    name: 'my second books',
  });
  const unlinkFirstChunk = tx.users[userId]
    .unlink({
      bookshelves: bookshelfId,
    })
    .link({ bookshelves: secondBookshelfId });
  const secondTxSteps = instaml.transform({ attrs: newStore.attrs }, [
    unlinkFirstChunk,
    secondBookshelfChunk,
  ]);
  const secondStore = transact(newStore, secondTxSteps);
  expect(
    query(
      { store: secondStore },
      {
        users: {
          $: { where: { handle: 'bobby' } },
          bookshelves: {},
        },
      },
    ).data.users.map((x) => [x.handle, x.bookshelves.map((x) => x.name)]),
  ).toEqual([['bobby', ['my second books']]]);
  checkIndexIntegrity(secondStore);
});

test('link/unlink multi', () => {
  const bookshelfId1 = uuid();
  const bookshelfId2 = uuid();
  const userId = uuid();
  const userChunk = tx.users[userId]
    .update({ handle: 'bobby' })
    .link({ bookshelves: [bookshelfId1, bookshelfId2] });

  const bookshelf1Chunk = tx.bookshelves[bookshelfId1].update({
    name: 'my books 1',
  });
  const bookshelf2Chunk = tx.bookshelves[bookshelfId2].update({
    name: 'my books 2',
  });
  const txSteps = instaml.transform({ attrs: store.attrs }, [
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
          $: { where: { handle: 'bobby' } },
          bookshelves: {},
        },
      },
    ).data.users.map((x) => [x.handle, x.bookshelves.map((x) => x.name)]),
  ).toEqual([['bobby', ['my books 1', 'my books 2']]]);
  checkIndexIntegrity(newStore);

  const bookshelfId3 = uuid();
  const bookshelf3Chunk = tx.bookshelves[bookshelfId3].update({
    name: 'my books 3',
  });
  const unlinkChunk = tx.users[userId]
    .unlink({
      bookshelves: [bookshelfId1, bookshelfId2],
    })
    .link({ bookshelves: bookshelfId3 });
  const secondTxSteps = instaml.transform({ attrs: newStore.attrs }, [
    unlinkChunk,
    bookshelf3Chunk,
  ]);
  const secondStore = transact(newStore, secondTxSteps);
  expect(
    query(
      { store: secondStore },
      {
        users: {
          $: { where: { handle: 'bobby' } },
          bookshelves: {},
        },
      },
    ).data.users.map((x) => [x.handle, x.bookshelves.map((x) => x.name)]),
  ).toEqual([['bobby', ['my books 3']]]);
  checkIndexIntegrity(secondStore);
});

test('link/unlink without update', () => {
  const bookshelfId = uuid();
  const userId = uuid();
  const userChunk = tx.users[userId].update({ handle: 'bobby' });
  const bookshelfChunk = tx.bookshelves[bookshelfId].update({
    name: 'my books',
  });
  const txSteps = instaml.transform({ attrs: store.attrs }, [
    userChunk,
    bookshelfChunk,
  ]);
  const store2 = transact(store, txSteps);

  const linkChunk = tx.users[userId].link({ bookshelves: bookshelfId });
  const store3 = transact(
    store2,
    instaml.transform({ attrs: store2.attrs }, [linkChunk]),
  );

  expect(
    query(
      { store: store3 },
      {
        users: {
          $: { where: { handle: 'bobby' } },
          bookshelves: {},
        },
      },
    ).data.users.map((x) => [x.handle, x.bookshelves.map((x) => x.name)]),
  ).toEqual([['bobby', ['my books']]]);
  checkIndexIntegrity(store3);
});

test('delete entity', () => {
  const bookshelfId = uuid();
  const userId = uuid();
  const userChunk = tx.users[userId]
    .update({ handle: 'bobby' })
    .link({ bookshelves: bookshelfId });
  const bookshelfChunk = tx.bookshelves[bookshelfId].update({
    name: 'my books',
  });
  const txSteps = instaml.transform({ attrs: store.attrs }, [
    userChunk,
    bookshelfChunk,
  ]);
  const newStore = transact(store, txSteps);
  checkIndexIntegrity(newStore);

  const retOne = datalog
    .query(newStore, {
      find: ['?v'],
      where: [[bookshelfId, '?attr', '?v']],
    })
    .flatMap((vec) => vec[0]);
  const retTwo = datalog
    .query(newStore, {
      find: ['?v'],
      where: [['?v', '?attr', bookshelfId]],
    })
    .flatMap((vec) => vec[0]);
  expect(retOne).contains('my books');
  expect(retTwo).contains(userId);

  const txStepsTwo = instaml.transform(
    { attrs: newStore.attrs },
    tx.bookshelves[bookshelfId].delete(),
  );
  const newStoreTwo = transact(newStore, txStepsTwo);
  const retThree = datalog
    .query(newStoreTwo, {
      find: ['?v'],
      where: [[bookshelfId, '?attr', '?v']],
    })
    .flatMap((vec) => vec[0]);
  const retFour = datalog
    .query(newStoreTwo, {
      find: ['?v'],
      where: [['?v', '?attr', bookshelfId]],
    })
    .flatMap((vec) => vec[0]);

  expect(retThree).toEqual([]);
  expect(retFour).toEqual([]);
  checkIndexIntegrity(newStoreTwo);
});

test('on-delete cascade', () => {
  const book1 = uuid();
  const book2 = uuid();
  const book3 = uuid();
  const chunk1 = tx.books[book1].update({
    title: 'book1',
    description: 'series',
  });
  const chunk2 = tx.books[book2]
    .update({ title: 'book2', description: 'series' })
    .link({ prequel: book1 });
  const chunk3 = tx.books[book3]
    .update({ title: 'book3', description: 'series' })
    .link({ prequel: book2 });
  const txSteps = instaml.transform({ attrs: store.attrs }, [
    chunk1,
    chunk2,
    chunk3,
  ]);
  const newStore = transact(store, txSteps);
  checkIndexIntegrity(newStore);
  expect(
    query(
      { store: newStore },
      { books: { $: { where: { description: 'series' } } } },
    ).data.books.map((x) => x.title),
  ).toEqual(['book1', 'book2', 'book3']);

  const txStepsTwo = instaml.transform(
    { attrs: newStore.attrs },
    tx.books[book1].delete(),
  );
  const newStoreTwo = transact(newStore, txStepsTwo);
  expect(
    query(
      { store: newStoreTwo },
      { books: { $: { where: { description: 'series' } } } },
    ).data.books.map((x) => x.title),
  ).toEqual([]);
});

test('on-delete-reverse cascade', () => {
  const book1 = uuid();
  const book2 = uuid();
  const book3 = uuid();

  const chunk2 = tx.books[book2].update({
    title: 'book2',
    description: 'series',
  });
  const chunk3 = tx.books[book3].update({
    title: 'book3',
    description: 'series',
  });
  const chunk1 = tx.books[book1]
    .update({
      title: 'book1',
      description: 'series',
    })
    .link({ next: [book2, book3] });
  const txSteps = instaml.transform({ attrs: store.attrs }, [
    chunk2,
    chunk3,
    chunk1,
  ]);
  const newStore = transact(store, txSteps);
  checkIndexIntegrity(newStore);
  expect(
    query(
      { store: newStore },
      { books: { $: { where: { description: 'series' } } } },
    ).data.books.map((x) => x.title),
  ).toEqual(['book2', 'book3', 'book1']);

  const txStepsTwo = instaml.transform(
    { attrs: newStore.attrs },
    tx.books[book1].delete(),
  );
  const newStoreTwo = transact(newStore, txStepsTwo);
  expect(
    query(
      { store: newStoreTwo },
      { books: { $: { where: { description: 'series' } } } },
    ).data.books.map((x) => x.title),
  ).toEqual([]);
});

test('new attrs', () => {
  const colorId = uuid();
  const userId = uuid();
  const userChunk = tx.users[userId]
    .update({ handle: 'bobby' })
    .link({ colors: colorId });
  const colorChunk = tx.colors[colorId].update({ name: 'red' });
  const txSteps = instaml.transform({ attrs: store.attrs }, [
    userChunk,
    colorChunk,
  ]);
  const newStore = transact(store, txSteps);
  expect(
    query(
      { store: newStore },
      {
        users: {
          $: { where: { handle: 'bobby' } },
          colors: {},
        },
      },
    ).data.users.map((x) => [x.handle, x.colors.map((x) => x.name)]),
  ).toEqual([['bobby', ['red']]]);

  checkIndexIntegrity(newStore);
});

test('delete attr', () => {
  expect(
    query({ store }, { users: {} }).data.users.map((x) => [
      x.handle,
      x.fullName,
    ]),
  ).toEqual([
    ['joe', 'Joe Averbukh'],
    ['alex', 'Alex'],
    ['stopa', 'Stepan Parunashvili'],
    ['nicolegf', 'Nicole'],
  ]);
  const fullNameAttr = instaml.getAttrByFwdIdentName(
    store.attrs,
    'users',
    'fullName',
  );
  const newStore = transact(store, [['delete-attr', fullNameAttr.id]]);
  expect(
    query({ store: newStore }, { users: {} }).data.users.map((x) => [
      x.handle,
      x.fullName,
    ]),
  ).toEqual([
    ['joe', undefined],
    ['alex', undefined],
    ['stopa', undefined],
    ['nicolegf', undefined],
  ]);

  checkIndexIntegrity(newStore);
});

test('update attr', () => {
  expect(
    query({ store }, { users: {} }).data.users.map((x) => [
      x.handle,
      x.fullName,
    ]),
  ).toEqual([
    ['joe', 'Joe Averbukh'],
    ['alex', 'Alex'],
    ['stopa', 'Stepan Parunashvili'],
    ['nicolegf', 'Nicole'],
  ]);
  const fullNameAttr = instaml.getAttrByFwdIdentName(
    store.attrs,
    'users',
    'fullName',
  );
  const fwdIdent = fullNameAttr['forward-identity'];
  const newStore = transact(store, [
    [
      'update-attr',
      {
        id: fullNameAttr.id,
        'forward-identity': [fwdIdent[0], 'users', 'fullNamez'],
      },
    ],
  ]);
  expect(
    query({ store: newStore }, { users: {} }).data.users.map((x) => [
      x.handle,
      x.fullNamez,
    ]),
  ).toEqual([
    ['joe', 'Joe Averbukh'],
    ['alex', 'Alex'],
    ['stopa', 'Stepan Parunashvili'],
    ['nicolegf', 'Nicole'],
  ]);
});

test('JSON serialization round-trips', () => {
  const newStore = fromJSON(toJSON(store));
  expect(store).toEqual(newStore);
});

test('ruleParams no-ops', () => {
  const id = uuid();
  const chunk = tx.users[id]
    .ruleParams({ guestId: 'bobby' })
    .update({ handle: 'bobby' });

  const txSteps = instaml.transform({ attrs: store.attrs }, chunk);
  const newStore = transact(store, txSteps);
  expect(
    query({ store: newStore }, { users: {} }).data.users.map((x) => x.handle),
  ).contains('bobby');

  checkIndexIntegrity(newStore);
});

test('deepMerge', () => {
  const gameId = uuid();
  const gameStore = transact(
    store,
    instaml.transform(
      { attrs: store.attrs },
      tx.games[gameId].update({
        state: {
          score: 100,
          playerStats: { health: 50, mana: 30, ambitions: { win: true } },
          inventory: ['sword', 'potion'],
          locations: ['forest', 'castle'],
          level: 2,
        },
      }),
    ),
  );
  const updatedStore = transact(
    gameStore,
    instaml.transform(
      { attrs: gameStore.attrs },
      tx.games[gameId].merge({
        state: {
          // Objects update deeply
          playerStats: {
            mana: 40,
            stamina: 20,
            ambitions: { acquireWisdom: true, find: ['love'] },
          },
          // arrays overwrite
          inventory: ['shield'],
          // null removes the key
          score: null,
          // undefined is ignored
          level: undefined,
          // undefined is kept in arrays
          locations: ['forest', undefined, 'castle'],
        },
      }),
    ),
  );
  const updatedGame = query(
    { store: updatedStore },
    { games: { $: { where: { id: gameId } } } },
  ).data.games[0];
  expect(updatedGame.state).toEqual({
    playerStats: {
      health: 50,
      mana: 40,
      stamina: 20,
      ambitions: { win: true, acquireWisdom: true, find: ['love'] },
    },
    level: 2,
    inventory: ['shield'],
    locations: ['forest', undefined, 'castle'],
  });
  checkIndexIntegrity(updatedGame);
});

test('recursive links w same id', () => {
  const schema = i.schema({
    entities: {
      $files: i.entity({
        path: i.string().unique().indexed(),
        url: i.string(),
      }),
      fakeUsers: i.entity({
        email: i.string().unique().indexed().optional(),
      }),
      todos: i.entity({
        completed: i.boolean().optional(),
        title: i.string().optional(),
      }),
    },
    links: {
      todosCreatedBy: {
        forward: {
          on: 'todos',
          has: 'one',
          label: 'createdBy',
          onDelete: 'cascade',
        },
        reverse: {
          on: 'fakeUsers',
          has: 'many',
          label: 'todos',
        },
      },
    },
  });
  const sameId = id();
  const ops = [
    instatx.tx.todos[sameId].update({
      title: 'todo',
      completed: false,
    }),
    instatx.tx.fakeUsers[sameId].update({
      email: 'test@test.com',
    }),
    instatx.tx.todos[sameId].link({
      createdBy: sameId,
    }),
  ];

  const steps = instaml.transform({ attrs: {}, schema }, ops);
  const store = createStore({}, [], true, createLinkIndex(schema), schema);
  const newStore = transact(store, steps);

  const result = query(
    { store: newStore, pageInfo: {}, aggregate: {} },
    {
      todos: {},
      fakeUsers: {},
    },
  );

  expect(result.data.todos.length).toBe(1);
  expect(result.data.fakeUsers.length).toBe(1);

  const removeOp = [instatx.tx.todos[sameId].delete()];

  const removeSteps = instaml.transform({ attrs: store.attrs }, removeOp);
  const postRemoveStore = transact(newStore, removeSteps);

  const removeResult = query(
    { store: postRemoveStore, pageInfo: {}, aggregate: {} },
    {
      todos: {},
      fakeUsers: {},
    },
  );

  expect(removeResult.data.todos.length).toBe(0);
  expect(removeResult.data.fakeUsers.length).toBe(1);
});

test('date conversion', () => {
  expect(() => {
    const schema = i.schema({
      entities: {
        todos: i.entity({
          completed: i.boolean().optional(),
          createdAt: i.date().optional(),
          title: i.string().optional(),
        }),
      },
    });
    const sameId = id();
    const ops = [
      instatx.tx.todos[sameId].update({
        title: 'todo',
        completed: false,
        createdAt: new Date(),
      }),
    ];

    const steps = instaml.transform({ attrs: {}, schema }, ops);
    const store = createStore({}, [], true, createLinkIndex(schema), true);
    const newStore = transact(store, steps);

    const result = query(
      { store: newStore, pageInfo: {}, aggregate: {} },
      {
        todos: {},
      },
    );

    expect(result.data.todos.length).toBe(1);
    expect(result.data.todos[0].createdAt).toBeInstanceOf(Date);
  }).not.toThrow();

  expect(() => {
    const schema = i.schema({
      entities: {
        todos: i.entity({
          completed: i.boolean().optional(),
          createdAt: i.date().optional(),
          title: i.string().optional(),
        }),
      },
    });
    const sameId = id();
    const ops = [
      instatx.tx.todos[sameId].update({
        title: 'todo',
        completed: false,
        createdAt: 99999999999999,
      }),
    ];

    const steps = instaml.transform({ attrs: {}, schema }, ops);
    const store = createStore({}, [], true, createLinkIndex(schema), false);
    const newStore = transact(store, steps);

    const result = query(
      { store: newStore, pageInfo: {}, aggregate: {} },
      {
        todos: {},
      },
    );

    expect(result.data.todos.length).toBe(1);
    expect(result.data.todos[0].createdAt).toBeTypeOf('number');
  }).not.toThrow();
});
