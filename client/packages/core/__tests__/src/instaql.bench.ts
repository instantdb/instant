import { bench } from 'vitest';

import zenecaAttrs from './data/zeneca/attrs.json';
import zenecaTriples from './data/zeneca/triples.json';
import { createStore, AttrsStoreClass } from '../../src/store';
import query from '../../src/instaql';

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

bench('big query', () => {
  query(ctx, {
    users: {
      bookshelves: {
        books: {},
        users: {
          bookshelves: {},
        },
      },
    },
  });
});
