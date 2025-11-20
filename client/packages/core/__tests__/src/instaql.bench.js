import { bench, describe } from 'vitest';

import zenecaAttrs from './data/zeneca/attrs.json';
import * as instaml from '../../src/instaml';
import zenecaTriples from './data/zeneca/triples.json';
import { createStore, transact, getAllTriples } from '../../src/store';
import query from '../../src/instaql';
import { id, txInit } from '../../src';

function generateRandomString(length) {
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

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

describe('entity caching', () => {
  const emptyStore = createStore({}, []);
  const tx = txInit();

  const chunks = [];
  for (let i = 0; i < 100000; i++) {
    chunks.push(
      tx.hi[id()].create({
        name: generateRandomString(10),
        age: Math.floor(Math.random() * 100),
        bio: generateRandomString(50),
      }),
    );
  }

  const txSteps = instaml.transform({ attrs: store.attrs }, chunks);

  const newStore = transact(emptyStore, txSteps);

  console.log(newStore.attrs);

  const attrs = newStore.attrs;
  const triples = getAllTriples(newStore);
  console.log(triples.length);
});
