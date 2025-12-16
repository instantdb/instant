import { test, expect } from 'vitest';
import movieAttrs from './data/movies/attrs.json';
import movieTriples from './data/movies/triples.json';
import {
  matchPattern,
  query,
  querySingle,
  queryWhere,
} from '../../src/datalog';
import {
  AttrsStoreClass,
  createStore,
  getAttrByFwdIdentName,
} from '../../src/store';
import { InstantDBAttr } from '../../src';

const movieAttrsStore = new AttrsStoreClass(
  movieAttrs as unknown as Record<string, InstantDBAttr>,
  null,
);

const store = createStore(
  movieAttrsStore,
  movieTriples as [string, string, any, number][],
);

test('matchPattern', () => {
  expect(
    matchPattern(
      ['?movieId', 'movie/director', '?directorId'],
      [200, 'movie/director', 100],
      { '?movieId': 200 },
    ),
  ).toEqual({ '?movieId': 200, '?directorId': 100 });
  expect(
    matchPattern(
      ['?movieId', 'movie/director', '?directorId'],
      [200, 'movie/director', 100],
      { '?movieId': 202 },
    ),
  ).toEqual(null);
});

function aid(friendlyName) {
  const [etype, label] = friendlyName.split('/');
  const attr = getAttrByFwdIdentName(movieAttrsStore, etype, label);
  return attr?.id;
}

function mid(movieName) {
  const [eid] = querySingle(store, ['?eid', aid('movie/title'), movieName], {});
  return eid['?eid'];
}

function pid(movieName) {
  const [eid] = querySingle(store, ['?eid', aid('person/name'), movieName], {});
  return eid['?eid'];
}

test('querySingle', () => {
  const res = querySingle(store, ['?movieId', aid('movie/year'), 1987], {});
  const movieIds = res.map((x) => x['?movieId']).sort();
  expect(movieIds).toEqual(
    [mid('Predator'), mid('RoboCop'), mid('Lethal Weapon')].sort(),
  );
});

test('queryWhere', () => {
  expect(
    queryWhere(store, [
      ['?movieId', aid('movie/title'), 'The Terminator'],
      ['?movieId', aid('movie/director'), '?directorId'],
      ['?directorId', aid('person/name'), '?directorName'],
    ]),
  ).toEqual([
    {
      '?movieId': mid('The Terminator'),
      '?directorId': pid('James Cameron'),
      '?directorName': 'James Cameron',
    },
  ]);
});

test('query', () => {
  expect(
    query(store, {
      find: ['?directorName'],
      where: [
        ['?movieId', aid('movie/title'), 'The Terminator'],
        ['?movieId', aid('movie/director'), '?directorId'],
        ['?directorId', aid('person/name'), '?directorName'],
      ],
    }),
  ).toEqual([['James Cameron']]);

  expect(
    query(store, {
      find: ['?movieId'],
      where: [
        ['?movieId', aid('movie/director'), '?directorId'],
        ['?directorId', aid('person/name'), 'James Cameron'],
        ['?movieId', aid('movie/title'), 'Aliens'],
      ],
    }),
  ).toEqual([[mid('Aliens')]]);
});

test('play', () => {
  expect(
    query(store, {
      find: ['?eid', '?attr', '?v'],
      where: [['?eid', '?attr', '?v']],
    }).length,
  ).toEqual(movieTriples.length);
  expect(
    query(store, {
      find: ['?year'],
      where: [
        ['?id', aid('movie/title'), 'Alien'],
        ['?id', aid('movie/year'), '?year'],
      ],
    }),
  ).toEqual([[1979]]);
  expect(
    query(store, {
      find: ['?directorName'],
      where: [
        ['?movieId', aid('movie/title'), 'RoboCop'],
        ['?movieId', aid('movie/director'), '?directorId'],
        ['?directorId', aid('person/name'), '?directorName'],
      ],
    }),
  ).toEqual([['Paul Verhoeven']]);
  expect(
    query(store, {
      find: ['?value'],
      where: [[mid('The Terminator'), '?attr', '?value']],
    })
      .map((x) => x[0])
      .sort(),
  ).toEqual(
    [
      'The Terminator',
      1984,
      pid('James Cameron'),
      pid('Arnold Schwarzenegger'),
      pid('Linda Hamilton'),
      pid('Michael Biehn'),
      mid('The Terminator'),
      mid('Terminator 2: Judgment Day'),
    ].sort(),
  );
  expect(
    new Set(
      query(store, {
        find: ['?directorName', '?movieTitle'],
        where: [
          ['?arnoldId', aid('person/name'), 'Arnold Schwarzenegger'],
          ['?movieId', aid('movie/cast'), '?arnoldId'],
          ['?movieId', aid('movie/title'), '?movieTitle'],
          ['?movieId', aid('movie/director'), '?directorId'],
          ['?directorId', aid('person/name'), '?directorName'],
        ],
      }),
    ),
  ).toEqual(
    new Set([
      ['James Cameron', 'The Terminator'],
      ['John McTiernan', 'Predator'],
      ['Mark L. Lester', 'Commando'],
      ['James Cameron', 'Terminator 2: Judgment Day'],
      ['Jonathan Mostow', 'Terminator 3: Rise of the Machines'],
    ]),
  );
});
