import { bench } from 'vitest';

import zenecaAttrs from './data/zeneca/attrs.json';
import zenecaTriples from './data/zeneca/triples.json';
import { createStore } from '../../src/store';
import query from '../../src/instaql';

const zenecaIdToAttr = zenecaAttrs.reduce((res, x) => {
  res[x.id] = x;
  return res;
}, {});

const store = createStore(zenecaIdToAttr, zenecaTriples);

bench('big query', () => {
  query(
    { store },
    {
      users: {
        bookshelves: {
          books: {},
          users: {
            bookshelves: {},
          },
        },
      },
    },
  );
});
