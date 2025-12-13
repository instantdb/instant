import { test, expect, vi } from 'vitest';

import zenecaAttrs from './data/zeneca/attrs.json';
import zenecaTriples from './data/zeneca/triples.json';
import {
  createStore,
  transact,
  AttrsStoreClass,
  Store,
  AttrsStore,
} from '../../src/store';
import query from '../../src/instaql';
import { tx, lookup } from '../../src/instatx';
import { i } from '../../src/index';
import * as instaml from '../../src/instaml';
import { randomUUID } from 'crypto';

const zenecaAttrsStore = new AttrsStoreClass(
  zenecaAttrs.reduce((res, x) => {
    res[x.id] = x;
    return res;
  }, {}),
  null,
);

const store = createStore(
  zenecaAttrsStore,
  zenecaTriples as [string, string, any, number][],
);

const ctx = { store, attrsStore: zenecaAttrsStore };

test('Simple Query Without Where', () => {
  expect(
    query(ctx, { users: {} })
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(['alex', 'joe', 'nicolegf', 'stopa']);
});

test('Simple Where', () => {
  expect(
    query(ctx, { users: { $: { where: { handle: 'joe' } } } })
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(['joe']);
});

test('Simple Where has expected keys', () => {
  expect(
    Object.keys(
      query(ctx, { users: { $: { where: { handle: 'joe' } } } }).data.users[0],
    ).sort(),
  ).toEqual(['createdAt', 'email', 'fullName', 'handle', 'id']);
});

test('Simple Where with multiple clauses', () => {
  expect(
    query(ctx, {
      users: {
        $: {
          where: {
            'bookshelves.books.title': 'The Count of Monte Cristo',
            handle: 'stopa',
          },
        },
      },
    })
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(['stopa']);

  expect(
    query(ctx, {
      users: {
        $: {
          where: {
            'bookshelves.books.title': 'Title nobody has',
            handle: 'stopa',
          },
        },
      },
    })
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual([]);
});

test('Where in', () => {
  expect(
    query(ctx, {
      users: {
        $: {
          where: {
            handle: { in: ['stopa', 'joe'] },
          },
        },
      },
    })
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(['joe', 'stopa']);

  expect(
    query(ctx, {
      users: {
        $: {
          where: {
            handle: { $in: ['stopa', 'joe'] },
          },
        },
      },
    })
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(['joe', 'stopa']);
});

test('Where %like%', () => {
  expect(
    query(ctx, {
      users: {
        $: {
          where: {
            handle: { $like: '%o%' },
          },
        },
      },
    })
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(['joe', 'nicolegf', 'stopa']);
});

test('Where like equality', () => {
  expect(
    query(ctx, {
      users: {
        $: {
          where: {
            handle: { $like: 'joe' },
          },
        },
      },
    })
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(['joe']);
});

test('Where startsWith deep', () => {
  expect(
    query(ctx, {
      users: {
        $: {
          where: {
            'bookshelves.books.title': { $like: '%Monte Cristo' },
          },
        },
      },
    })
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(['nicolegf', 'stopa']);
});

test('Where endsWith deep', () => {
  expect(
    query(ctx, {
      users: {
        $: {
          where: {
            'bookshelves.books.title': { $like: 'Anti%' },
          },
        },
      },
    })
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(['alex', 'nicolegf', 'stopa']);
});

test('like case sensitivity', () => {
  function runQuery(where) {
    return query(ctx, {
      users: {
        $: {
          where: {
            fullName: where,
          },
        },
      },
    })
      .data.users.map((x) => x.fullName)
      .sort();
  }
  expect(runQuery({ $like: '%O%' })).toEqual([]);
  expect(runQuery({ $ilike: '%O%' })).toEqual(['Joe Averbukh', 'Nicole']);
  expect(runQuery({ $like: '%j%' })).toEqual([]);
  expect(runQuery({ $ilike: '%j%' })).toEqual(['Joe Averbukh']);
});

test('like special regex characters', () => {
  // Special characters that need escaping in regex
  const specialChars = [
    ['(', 'Stopa (The Hacker)'],
    [')', 'The Hacker (Stopa)'],
    ['[', 'Stopa [Hacker]'],
    [']', '[Hacker] Stopa'],
    ['{', 'Stopa {Hacker}'],
    ['}', '{Hacker} Stopa'],
    ['*', 'Stopa * Hacker'],
    ['+', 'Stopa + Hacker'],
    ['?', 'Stopa? Yes!'],
    ['^', 'Stopa ^ Hacker'],
    ['$', 'Stopa $ Hacker'],
    ['|', 'Stopa | Hacker'],
    ['\\', 'Stopa \\ Hacker'],
    ['.', 'Mr. Stopa'],
  ];

  function renameStopa(store, newName) {
    const chunk = tx.users[lookup('handle', 'stopa')].update({
      fullName: newName,
    });
    const txSteps = instaml.transform({ attrsStore: zenecaAttrsStore }, chunk);
    return transact(store, zenecaAttrsStore, txSteps);
  }

  for (const [char, newName] of specialChars) {
    const newCtx = renameStopa(store, newName);
    const res = query(newCtx, {
      users: {
        $: { where: { fullName: { $like: `%${char}%` } } },
      },
    }).data.users;
    expect(res[0]?.fullName).toBe(newName);
  }
});

test('Where and', () => {
  expect(
    query(ctx, {
      users: {
        $: {
          where: {
            and: [
              { 'bookshelves.books.title': 'The Count of Monte Cristo' },
              { 'bookshelves.books.title': 'Antifragile' },
            ],
          },
        },
      },
    })
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(['nicolegf', 'stopa']);
});

test.each([
  [
    'multiple OR matches',
    {
      or: [{ handle: 'stopa' }, { handle: 'joe' }],
    },
    ['joe', 'stopa'],
  ],
  [
    'mix of matching and non-matching',
    {
      or: [{ handle: 'nobody' }, { handle: 'stopa' }, { handle: 'everybody' }],
    },
    ['stopa'],
  ],
  [
    'with and',
    {
      'bookshelves.books.title': 'The Count of Monte Cristo',
      or: [{ handle: 'joe' }, { handle: 'stopa' }],
    },
    ['stopa'],
  ],
  [
    'with references',
    {
      or: [
        { handle: 'joe' },
        {
          handle: 'stopa',
          'bookshelves.books.title': 'The Count of Monte Cristo',
        },
      ],
    },
    ['joe', 'stopa'],
  ],
  [
    'with references in both `or` & `and` clauses, no matches',
    {
      'bookshelves.books.title': 'Unknown',
      or: [
        { handle: 'joe' },
        {
          handle: 'stopa',
          'bookshelves.books.title': 'The Count of Monte Cristo',
        },
      ],
    },
    [],
  ],
  [
    'with references in both `or` & `and` clauses, with matches',
    {
      'bookshelves.books.title': 'A Promised Land',
      or: [
        {
          handle: 'stopa',
          'bookshelves.books.title': 'The Count of Monte Cristo',
        },
        {
          handle: 'joe',
        },
      ],
    },
    ['joe'],
  ],
  [
    'with nested ors',
    {
      or: [
        { or: [{ handle: 'stopa' }] },
        {
          handle: 'joe',
        },
      ],
    },
    ['joe', 'stopa'],
  ],
  [
    'with ands in ors',
    {
      or: [
        {
          or: [
            {
              and: [
                { or: [{ handle: 'stopa' }, { handle: 'joe' }] },
                { email: 'stopa@instantdb.com' },
              ],
            },
          ],
        },
        {
          handle: 'joe',
        },
      ],
    },
    ['joe', 'stopa'],
  ],
  [
    'with ands in ors in ands',
    {
      and: [
        { or: [{ and: [{ handle: 'stopa' }] }] },
        { or: [{ and: [{ or: [{ handle: 'stopa' }] }] }] },
      ],
    },
    ['stopa'],
  ],
])('Where OR %s', (_, whereQuery, expected) => {
  expect(
    query(ctx, {
      users: {
        $: {
          where: whereQuery,
        },
      },
    })
      .data.users.map((x) => x.handle)
      .sort(),
  ).toEqual(expected);
});

test('Get association', () => {
  expect(
    query(ctx, {
      users: {
        bookshelves: {},
        $: { where: { handle: 'alex' } },
      },
    }).data.users.map((x) => [
      x.handle,
      x.bookshelves.map((x) => x.name).sort(),
    ]),
  ).toEqual([['alex', ['Nonfiction', 'Short Stories']]]);
});

test('Get reverse association', () => {
  expect(
    query(ctx, {
      bookshelves: {
        users: {},
        $: { where: { name: 'Short Stories' } },
      },
    }).data.bookshelves.map((x) => [
      x.name,
      x.users.map((x) => x.handle).sort(),
    ]),
  ).toEqual([['Short Stories', ['alex']]]);
});

test('Get deep association', () => {
  expect(
    query(ctx, {
      users: {
        bookshelves: { books: {} },
        $: { where: { handle: 'alex' } },
      },
    })
      .data.users.flatMap((x) => x.bookshelves)
      .flatMap((x) => x.books)
      .map((x) => x.title),
  ).toEqual([
    `"Surely You're Joking, Mr. Feynman!": Adventures of a Curious Character`,
    '"What Do You Care What Other People Think?": Further Adventures of a Curious Character',
    'The Spy and the Traitor',
    'Antifragile',
    'Atomic Habits',
    'Catch and Kill',
    'The Paper Menagerie and Other Stories',
    'Stories of Your Life and Others',
    "Aesop's Fables",
  ]);
});

test('Nested wheres', () => {
  expect(
    query(ctx, {
      users: {
        bookshelves: {
          books: {},
          $: { where: { name: 'Short Stories' } },
        },
        $: { where: { handle: 'alex' } },
      },
    })
      .data.users.flatMap((x) => x.bookshelves)
      .flatMap((x) => x.books)
      .map((x) => x.title),
  ).toEqual([
    'The Paper Menagerie and Other Stories',
    'Stories of Your Life and Others',
    "Aesop's Fables",
  ]);
});

test('Nested wheres with OR queries', () => {
  expect(
    query(ctx, {
      users: {
        bookshelves: {
          books: {},
          $: {
            where: { or: [{ name: 'Short Stories' }] },
          },
        },
        $: { where: { handle: 'alex' } },
      },
    })
      .data.users.flatMap((x) => x.bookshelves)
      .flatMap((x) => x.books)
      .map((x) => x.title),
  ).toEqual([
    'The Paper Menagerie and Other Stories',
    'Stories of Your Life and Others',
    "Aesop's Fables",
  ]);
});

test('Nested wheres with AND queries', () => {
  expect(
    query(ctx, {
      users: {
        bookshelves: {
          books: {},
          $: {
            where: { and: [{ name: 'Short Stories' }, { order: 0 }] },
          },
        },
        $: { where: { handle: 'alex' } },
      },
    })
      .data.users.flatMap((x) => x.bookshelves)
      .flatMap((x) => x.books)
      .map((x) => x.title),
  ).toEqual([
    'The Paper Menagerie and Other Stories',
    'Stories of Your Life and Others',
    "Aesop's Fables",
  ]);
});

test('Deep where', () => {
  expect(
    query(ctx, {
      users: {
        $: { where: { 'bookshelves.books.title': "Aesop's Fables" } },
      },
    }).data.users.map((x) => x.handle),
  ).toEqual(['alex']);
});

test('Missing etype', () => {
  expect(query(ctx, { moopy: {} }).data).toEqual({ moopy: [] });
});

test('Missing inner etype', () => {
  expect(
    query(ctx, {
      users: {
        moopy: {},
        $: { where: { handle: 'joe' } },
      },
    })
      .data.users.map((x) => [x.handle, x.moopy])
      .sort(),
  ).toEqual([['joe', []]]);
});

test('Missing filter attr', () => {
  expect(
    query(ctx, {
      users: {
        $: { where: { 'bookshelves.moopy': 'joe' } },
      },
    }).data,
  ).toEqual({ users: [] });
});

test('multiple connections', () => {
  expect(
    query(ctx, {
      bookshelves: {
        books: {},
        users: {},
        $: { where: { name: 'Short Stories' } },
      },
    }).data.bookshelves.map((x) => [
      x.name,
      x.users.map((x) => x.handle).sort(),
      x.books.map((x) => x.title).sort(),
    ]),
  ).toEqual([
    [
      'Short Stories',
      ['alex'],
      [
        "Aesop's Fables",
        'Stories of Your Life and Others',
        'The Paper Menagerie and Other Stories',
      ],
    ],
  ]);
});

test('query forward references work with and without id', () => {
  const bookshelf = query(ctx, {
    bookshelves: {
      $: { where: { 'users.handle': 'stopa' } },
    },
  }).data.bookshelves[0];

  const usersByBookshelfId = query(ctx, {
    users: {
      $: { where: { 'bookshelves.id': bookshelf.id } },
    },
  }).data.users.map((x) => x.handle);

  const usersByBookshelfLinkFIeld = query(ctx, {
    users: {
      $: { where: { bookshelves: bookshelf.id } },
    },
  }).data.users.map((x) => x.handle);

  expect(usersByBookshelfId).toEqual(['stopa']);
  expect(usersByBookshelfLinkFIeld).toEqual(['stopa']);
});

test('query reverse references work with and without id', () => {
  const stopa = query(ctx, {
    users: {
      $: { where: { handle: 'stopa' } },
    },
  }).data.users[0];

  const stopaBookshelvesByHandle = query(ctx, {
    bookshelves: {
      $: { where: { 'users.handle': 'stopa' } },
    },
  }).data.bookshelves;

  const stopaBookshelvesById = query(ctx, {
    bookshelves: {
      $: { where: { 'users.id': stopa.id } },
    },
  }).data.bookshelves;

  const stopaBookshelvesByLinkField = query(ctx, {
    bookshelves: {
      $: { where: { users: stopa.id } },
    },
  }).data.bookshelves;

  expect(stopaBookshelvesByHandle.length).toBe(16);

  expect(stopaBookshelvesByHandle).toEqual(stopaBookshelvesById);
  expect(stopaBookshelvesByHandle).toEqual(stopaBookshelvesByLinkField);
});

test('objects are created by etype', () => {
  const stopa = query(ctx, {
    users: {
      $: { where: { handle: 'stopa' } },
    },
  }).data.users[0];
  expect(stopa.email).toEqual('stopa@instantdb.com');
  const chunk = tx.not_users[stopa.id].update({
    email: 'this-should-not-change-users-stopa@gmail.com',
  });
  const txSteps = instaml.transform({ attrsStore: zenecaAttrsStore }, chunk);
  const newCtx = transact(store, zenecaAttrsStore, txSteps);
  const newStopa = query(newCtx, {
    users: {
      $: { where: { handle: 'stopa' } },
    },
  }).data.users[0];
  expect(newStopa.email).toEqual('stopa@instantdb.com');
});

test('create and update triples in one tx', () => {
  const userId = randomUUID();

  const getUser = (ctx: { store: Store; attrsStore: AttrsStore }) =>
    query(ctx, { users: { $: { where: { id: userId } } } }).data.users[0];

  const chunk1 = tx.users[userId].create({
    email: 'e@mail',
    handle: 'handle',
  });
  const ctx1 = transact(
    store,
    zenecaAttrsStore,
    instaml.transform({ attrsStore: zenecaAttrsStore }, chunk1),
  );
  const user1 = getUser(ctx1);
  expect(user1.email).toEqual('e@mail');
  expect(user1.fullName).toEqual(undefined);

  const chunk2 = tx.users[userId].update(
    {
      email: 'e@mail 2',
      fullName: 'Full Name',
    },
    { upsert: false },
  );
  const ctx2 = transact(
    ctx1.store,
    ctx1.attrsStore,
    instaml.transform({ attrsStore: zenecaAttrsStore }, chunk2),
  );
  const user2 = getUser(ctx2);
  expect(user2.email).toEqual('e@mail 2');
  expect(user2.fullName).toEqual('Full Name');
});

test('object values', () => {
  const stopa = query(ctx, {
    users: {
      $: { where: { handle: 'stopa' } },
    },
  }).data.users[0];
  expect(stopa.email).toEqual('stopa@instantdb.com');
  const chunk = tx.users[stopa.id].update({
    jsonField: { hello: 'world' },
    otherJsonField: { world: 'hello' },
  });
  const txSteps = instaml.transform({ attrsStore: zenecaAttrsStore }, chunk);
  const newCtx = transact(store, zenecaAttrsStore, txSteps);
  const newStopa = query(newCtx, {
    users: {
      $: { where: { handle: 'stopa' } },
    },
  }).data.users[0];

  expect(newStopa.jsonField).toEqual({ hello: 'world' });
});

test('pagination limit', () => {
  const books = query(ctx, {
    books: {
      $: {
        limit: 10,
      },
    },
  }).data.books;

  expect(books.length).toEqual(10);
});

test('nested limit works but warns', () => {
  const warnMock = vi
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);

  const result = query(ctx, {
    bookshelves: {
      books: {
        $: {
          limit: 4,
        },
      },
    },
  });

  expect(result.data.bookshelves.length).toEqual(45);
  // Should be "6" but is limited to 4
  expect(result.data.bookshelves[1].books.length).toEqual(4);
  // Warning
  expect(warnMock).toHaveBeenCalled();

  warnMock.mockRestore();
});

test('pagination offset waits for pageInfo', () => {
  // If we don't have the pageInfo from the server, we have to
  // wait to know which items in the store we should return.
  // Otherwise, we might render optimistic changes for items
  // that aren't in our range.
  const booksWithOffset = query(ctx, {
    books: {
      $: {
        offset: 10,
        limit: 5,
      },
    },
  }).data.books;

  expect(booksWithOffset.length).toEqual(0);

  const booksWithPageInfo = query(
    {
      store,
      attrsStore: zenecaAttrsStore,
      pageInfo: {
        books: {
          'start-cursor': [
            '000212ec-fe77-473d-9494-d29898c53b7a',
            '6eebf15a-ed3c-4442-8869-a44a7c85a1be',
            '000212ec-fe77-473d-9494-d29898c53b7a',
            1718118155976,
          ],
          'end-cursor': [
            '0270a27f-1363-4f6d-93c0-39cc43d92a78',
            '6eebf15a-ed3c-4442-8869-a44a7c85a1be',
            '0270a27f-1363-4f6d-93c0-39cc43d92a78',
            1718118151976,
          ],
        },
      },
    },
    {
      books: {
        $: {
          offset: 10,
          limit: 5,
          order: { serverCreatedAt: 'desc' },
        },
      },
    },
  ).data.books;

  expect(booksWithPageInfo.map((b) => b.title)).toEqual([
    'Norse Mythology',
    'Love-at-Arms',
    'The Young Lions',
    'The Hounds of God',
    'Which Comes First, Cardio or Weights?',
  ]);

  const booksWithPageInfoAsc = query(
    {
      store,
      attrsStore: zenecaAttrsStore,
      pageInfo: {
        books: {
          'start-cursor': [
            'f11c998f-d951-426b-b2b1-ffcb8d17bac5',
            '6eebf15a-ed3c-4442-8869-a44a7c85a1be',
            'f11c998f-d951-426b-b2b1-ffcb8d17bac5',
            1718117715976,
          ],
          'end-cursor': [
            'f1c15604-93cd-4189-bb9a-d4ee97b95f32',
            '6eebf15a-ed3c-4442-8869-a44a7c85a1be',
            'f1c15604-93cd-4189-bb9a-d4ee97b95f32',
            1718117721976,
          ],
        },
      },
    },
    {
      books: {
        $: {
          offset: 10,
          limit: 5,
          order: { serverCreatedAt: 'asc' },
        },
      },
    },
  ).data.books;

  expect(booksWithPageInfoAsc.map((b) => b.title)).toEqual([
    'Sum',
    'Insurgent',
    'The Rational Male',
    'The Restaurant at the End of the Universe',
    'Bardelys the Magnificent',
  ]);
});

test('pagination last', () => {
  const books = query(ctx, {
    books: {
      $: {
        last: 10,
      },
    },
  }).data.books;

  expect(books.length).toEqual(10);
});

test('pagination first', () => {
  const books = query(ctx, {
    books: {
      $: {
        first: 10,
      },
    },
  }).data.books;

  expect(books.length).toEqual(10);
});

test('Leading queries should ignore the start cursor', () => {
  function storeWithUpdatedNicole() {
    const chunk = tx.users[lookup('handle', 'nicolegf')].update({
      createdAt: '2025-09-05 18:53:07.993689',
    });

    const txSteps = instaml.transform({ attrsStore: zenecaAttrsStore }, chunk);
    return transact(store, zenecaAttrsStore, txSteps);
  }

  function storeWithBob() {
    const chunk = tx.users[randomUUID()].update({
      fullName: 'bob',
      email: 'bob@instantdb.com',
      handle: 'bob',
      createdAt: '2025-09-05 18:53:07.993689',
    });

    const txSteps = instaml.transform({ attrsStore: zenecaAttrsStore }, chunk);
    return transact(store, zenecaAttrsStore, txSteps);
  }

  // Existing pageInfo from server: starts at Nicole (2021-02-05), ends at Alex (2021-01-09)
  const pageInfo = {
    users: {
      'start-cursor': [
        '0f3d67fc-8b37-4b03-ac47-29fec4edc4f7',
        '2ffdf0fc-1561-4fc5-96db-2210a41adfa6',
        '2021-02-05 22:35:23.754264',
        1718118127976,
      ],
      'end-cursor': [
        'ad45e100-777a-4de8-8978-aa13200a4824',
        '2ffdf0fc-1561-4fc5-96db-2210a41adfa6',
        '2021-01-09 18:53:07.993689',
        1718117855976,
      ],
    },
  };
  const existingUsers = query(
    { store, attrsStore: zenecaAttrsStore, pageInfo },
    {
      users: {
        $: {
          limit: 2,
          order: {
            createdAt: 'desc',
          },
        },
      },
    },
  ).data.users.map((x) => x.handle);
  expect(existingUsers).toEqual(['nicolegf', 'alex']);

  // Let's update Nicole's createdAt to be later.
  // She should _still_ show up,
  // even though the cursor says otherwise
  const usersWithUpdatedNicole = query(
    { ...storeWithUpdatedNicole(), pageInfo },
    {
      users: {
        $: {
          limit: 2,
          order: {
            createdAt: 'desc',
          },
        },
      },
    },
  ).data.users.map((x) => x.handle);
  expect(usersWithUpdatedNicole).toEqual(['nicolegf', 'alex']);

  // Let's add Bob.
  // Bob _should_ show up,
  // even though the cursor says otherwise
  const usersWithBob = query(
    { ...storeWithBob(), pageInfo },
    {
      users: {
        $: {
          limit: 2,
          order: {
            createdAt: 'desc',
          },
        },
      },
    },
  ).data.users.map((x) => x.handle);
  expect(usersWithBob).toEqual(['bob', 'nicolegf']);
});

test('arbitrary ordering', () => {
  const books = query(ctx, {
    books: { $: { first: 10, order: { title: 'asc' } } },
  });

  const titles = books.data.books.map((x) => x.title);
  expect(titles).toEqual([
    `"Surely You're Joking, Mr. Feynman!": Adventures of a Curious Character`,
    '"What Do You Care What Other People Think?": Further Adventures of a Curious Character',
    '12 Rules for Life',
    '1984',
    '21 Lessons for the 21st Century',
    'A Conflict of Visions',
    'A Damsel in Distress',
    'A Guide to the Good Life',
    'A Hero Of Our Time',
    'A History of Private Life: From pagan Rome to Byzantium',
  ]);
});

test('arbitrary ordering with dates', () => {
  const schema = i.schema({
    entities: {
      tests: i.entity({
        field: i.any(),
        date: i.date().indexed(),
        num: i.number().indexed(),
      }),
    },
  });

  const txSteps: any[] = [];
  let id = 0;
  for (let i = -5; i < 5; i++) {
    txSteps.push(
      tx.tests[randomUUID()].update({
        field: id++,
        date: i,
        num: i,
      }),
    );
  }
  // Add a null date
  txSteps.push(
    // Use predefined uuid so we can predict ordering
    tx.tests['00000000-0000-0000-0000-000000000000'].update({
      field: id++,
      date: null,
      num: null,
    }),
  );
  // Add a missing date
  txSteps.push(
    tx.tests['00000000-0000-0000-0000-000000000001'].update({
      field: id++,
    }),
  );
  // Another null date
  txSteps.push(
    tx.tests['00000000-0000-0000-0000-000000000002'].update({
      date: null,
      num: null,
      field: id++,
    }),
  );
  // Another missing date
  txSteps.push(
    tx.tests['00000000-0000-0000-0000-000000000003'].update({
      field: id++,
    }),
  );

  const newCtx = transact(
    store,
    zenecaAttrsStore,
    instaml.transform(
      { attrsStore: zenecaAttrsStore, schema: schema },
      txSteps,
    ),
  );

  const descRes = query(newCtx, {
    tests: { $: { order: { date: 'desc' } } },
  }).data.tests.map((x) => x.date);

  const numDescRes = query(newCtx, {
    tests: { $: { order: { num: 'desc' } } },
  }).data.tests.map((x) => x.num);

  const descExpected = [
    4,
    3,
    2,
    1,
    0,
    -1,
    -2,
    -3,
    -4,
    -5,
    undefined,
    null,
    undefined,
    null,
  ];

  expect(descRes).toEqual(descExpected);

  expect(numDescRes).toEqual(descExpected);

  const ascRes = query(newCtx, {
    tests: { $: { order: { date: 'asc' } } },
  }).data.tests.map((x) => x.date);

  const numAscRes = query(newCtx, {
    tests: { $: { order: { num: 'asc' } } },
  }).data.tests.map((x) => x.num);

  const ascExpected = [
    null,
    undefined,
    null,
    undefined,
    -5,
    -4,
    -3,
    -2,
    -1,
    0,
    1,
    2,
    3,
    4,
  ];

  expect(ascRes).toEqual(ascExpected);
  expect(numAscRes).toEqual(ascExpected);
});

test('arbitrary ordering with strings', () => {
  const schema = i.schema({
    entities: {
      tests: i.entity({
        string: i.string().indexed(),
      }),
    },
  });

  const txSteps: any[] = [];
  const vs = ['10', '2', 'a0', 'Zz'];
  for (const v of vs) {
    txSteps.push(
      tx.tests[randomUUID()].update({
        string: v,
      }),
    );
  }

  const newCtx = transact(
    store,
    zenecaAttrsStore,
    instaml.transform(
      { attrsStore: zenecaAttrsStore, schema: schema },
      txSteps,
    ),
  );

  const ascRes = query(newCtx, {
    tests: { $: { order: { string: 'asc' } } },
  }).data.tests.map((x) => x.string);

  expect(ascRes).toEqual(vs);

  const descRes = query(newCtx, {
    tests: { $: { order: { string: 'desc' } } },
  }).data.tests.map((x) => x.string);

  // @ts-expect-error: doesn't like toReversed()
  expect(descRes).toEqual(vs.toReversed());
});

test('$isNull', () => {
  const q = { books: { $: { where: { title: { $isNull: true } } } } };
  expect(query(ctx, q).data.books.length).toEqual(0);
  const chunks = [
    tx.books[randomUUID()].update({ title: null }),
    tx.books[randomUUID()].update({ pageCount: 20 }),
  ];
  const txSteps = instaml.transform({ attrsStore: zenecaAttrsStore }, chunks);
  const newCtx = transact(store, zenecaAttrsStore, txSteps);
  expect(query(newCtx, q).data.books.map((x) => x.title)).toEqual([
    null,
    undefined,
  ]);
});

test('$isNull with relations', () => {
  const q = { users: { $: { where: { bookshelves: { $isNull: true } } } } };
  expect(query(ctx, q).data.users.length).toEqual(0);
  const chunks = [tx.users[randomUUID()].update({ handle: 'dww' })];
  const txSteps = instaml.transform({ attrsStore: zenecaAttrsStore }, chunks);
  const newCtx = transact(store, zenecaAttrsStore, txSteps);
  expect(query(newCtx, q).data.users.map((x) => x.handle)).toEqual(['dww']);

  const bookId = query(ctx, {
    books: { $: { where: { title: 'The Count of Monte Cristo' } } },
  }).data.books[0].id;

  const usersWithBook = query(ctx, {
    users: {
      $: {
        where: { 'bookshelves.books.title': 'The Count of Monte Cristo' },
      },
    },
  }).data.users.map((x) => x.handle);

  const ctxWithNullTitle = transact(
    newCtx.store,
    newCtx.attrsStore,
    instaml.transform(newCtx, [tx.books[bookId].update({ title: null })]),
  );

  const usersWithNullTitle = query(ctxWithNullTitle, {
    users: {
      $: {
        where: { 'bookshelves.books.title': { $isNull: true } },
      },
    },
  }).data.users.map((x) => x.handle);

  expect(usersWithNullTitle).toEqual([...usersWithBook, 'dww']);
});

test('$isNull with reverse relations', () => {
  const q = {
    bookshelves: { $: { where: { 'users.id': { $isNull: true } } }, users: {} },
  };
  expect(query(ctx, q).data.bookshelves.length).toBe(0);

  const chunks = [
    tx.bookshelves[randomUUID()].update({ name: 'Lonely shelf' }),
  ];
  const txSteps = instaml.transform({ attrsStore: zenecaAttrsStore }, chunks);
  const newCtx = transact(store, zenecaAttrsStore, txSteps);
  expect(query(newCtx, q).data.bookshelves.map((x) => x.name)).toEqual([
    'Lonely shelf',
  ]);
});

test('$not and $ne', () => {
  const qNot = { tests: { $: { where: { val: { $not: 'a' } } } } };
  const qNe = { tests: { $: { where: { val: { $ne: 'a' } } } } };
  const chunks = [
    tx.tests[randomUUID()].update({ val: 'a' }),
    tx.tests[randomUUID()].update({ val: 'b' }),
    tx.tests[randomUUID()].update({ val: 'c' }),
    tx.tests[randomUUID()].update({ val: null }),
    tx.tests[randomUUID()].update({ undefinedVal: 'd' }),
  ];
  const txSteps = instaml.transform({ attrsStore: zenecaAttrsStore }, chunks);
  const newCtx = transact(store, zenecaAttrsStore, txSteps);
  const expected = ['b', 'c', null, undefined];
  expect(query(newCtx, qNot).data.tests.map((x) => x.val)).toEqual(expected);
  expect(query(newCtx, qNe).data.tests.map((x) => x.val)).toEqual(expected);
});

test('comparators', () => {
  const schema = i.schema({
    entities: {
      tests: i.entity({
        string: i.string().indexed(),
        number: i.number().indexed(),
        date: i.date().indexed(),
        boolean: i.boolean().indexed(),
      }),
    },
  });

  const txSteps: any[] = [];
  for (let i = 0; i < 5; i++) {
    txSteps.push(
      tx.tests[randomUUID()].update({
        string: `${i}`,
        number: i,
        date: i,
        boolean: i % 2 === 0,
      }),
    );
  }

  const newCtx = transact(
    store,
    zenecaAttrsStore,
    instaml.transform(
      { attrsStore: zenecaAttrsStore, schema: schema },
      txSteps,
    ),
  );

  function runQuery(dataType, op, value) {
    const res = query(newCtx, {
      tests: {
        $: { where: { [dataType]: { [op]: value } } },
      },
    });
    return res.data.tests.map((x) => x[dataType]);
  }

  expect(runQuery('string', '$gt', '2')).toEqual(['3', '4']);
  expect(runQuery('string', '$gte', '2')).toEqual(['2', '3', '4']);
  expect(runQuery('string', '$lt', '2')).toEqual(['0', '1']);
  expect(runQuery('string', '$lte', '2')).toEqual(['0', '1', '2']);

  expect(runQuery('number', '$gt', 2)).toEqual([3, 4]);
  expect(runQuery('number', '$gte', 2)).toEqual([2, 3, 4]);
  expect(runQuery('number', '$lt', 2)).toEqual([0, 1]);
  expect(runQuery('number', '$lte', 2)).toEqual([0, 1, 2]);

  expect(runQuery('date', '$gt', 2)).toEqual([3, 4]);
  expect(runQuery('date', '$gte', 2)).toEqual([2, 3, 4]);
  expect(runQuery('date', '$lt', 2)).toEqual([0, 1]);
  expect(runQuery('date', '$lte', 2)).toEqual([0, 1, 2]);

  // Accepts string dates
  expect(
    runQuery('date', '$lt', JSON.parse(JSON.stringify(new Date()))),
  ).toEqual([0, 1, 2, 3, 4]);
  expect(
    runQuery('date', '$gt', JSON.parse(JSON.stringify(new Date()))),
  ).toEqual([]);

  expect(runQuery('boolean', '$gt', true)).toEqual([]);
  expect(runQuery('boolean', '$gte', true)).toEqual([true, true, true]);
  expect(runQuery('boolean', '$lt', true)).toEqual([false, false]);
  expect(runQuery('boolean', '$lte', true)).toEqual([
    true,
    false,
    true,
    false,
    true,
  ]);
});

test('fields', () => {
  expect(query(ctx, { users: { $: { fields: ['handle'] } } }).data).toEqual({
    users: [
      { handle: 'joe', id: 'ce942051-2d74-404a-9c7d-4aa3f2d54ae4' },
      { handle: 'alex', id: 'ad45e100-777a-4de8-8978-aa13200a4824' },
      { handle: 'stopa', id: 'a55a5231-5c4d-4033-b859-7790c45c22d5' },
      { handle: 'nicolegf', id: '0f3d67fc-8b37-4b03-ac47-29fec4edc4f7' },
    ],
  });

  expect(
    query(ctx, {
      users: {
        $: { where: { handle: 'alex' }, fields: ['handle'] },
        bookshelves: { $: { fields: ['name'] } },
      },
    }).data,
  ).toEqual({
    users: [
      {
        handle: 'alex',
        id: 'ad45e100-777a-4de8-8978-aa13200a4824',
        bookshelves: [
          {
            name: 'Nonfiction',
            id: '8164fb78-6fa3-4aab-8b92-80e706bae93a',
          },
          {
            name: 'Short Stories',
            id: '4ad10e00-1353-437e-9fee-2a89eb53575d',
          },
        ],
      },
    ],
  });

  // id is always included
  expect(query(ctx, { users: { $: { fields: [] } } }).data).toEqual({
    users: [
      { id: 'ce942051-2d74-404a-9c7d-4aa3f2d54ae4' },
      { id: 'ad45e100-777a-4de8-8978-aa13200a4824' },
      { id: 'a55a5231-5c4d-4033-b859-7790c45c22d5' },
      { id: '0f3d67fc-8b37-4b03-ac47-29fec4edc4f7' },
    ],
  });
});
