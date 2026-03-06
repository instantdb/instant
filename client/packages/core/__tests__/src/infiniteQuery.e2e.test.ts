import { describe, expect, vi } from 'vitest';
import { i, id } from '../../src';
import { makeE2ETest } from './utils/e2e';

async function addNumberItem(db: any, value: number) {
  await db.transact(db.tx.items[id()].update({ value }));
}

async function addNumberItems(db: any, values: number[]) {
  await db.transact(values.map((value) => db.tx.items[id()].update({ value })));
}

const getLoadedValues = (response: Record<string, any>): number[] =>
  (response.data?.items || []).map((item: any) => item.value);

const test = makeE2ETest({
  schema: i.schema({
    entities: {
      items: i.entity({
        value: i.number().indexed(),
      }),
    },
  }),
});

describe('infinite scroll number line', () => {
  test('adding new numbers', async ({ db }) => {
    let response: Record<string, any> = {};
    const callback = vi.fn<(response: any) => void>((resp) => {
      response = resp;
    });

    const scrollSub = db.subscribeInfiniteQuery(
      {
        items: {
          $: {
            limit: 4,
            order: {
              value: 'asc',
            },
          },
        },
      },
      callback,
    );

    await addNumberItem(db, 0);
    await addNumberItem(db, 1);
    await addNumberItem(db, 2);
    await addNumberItem(db, 3);

    await expect.poll(() => getLoadedValues(response)).toContain(3);
    await addNumberItems(db, [5, 6, 7, 8]);
    await expect.poll(() => getLoadedValues(response)).toEqual([0, 1, 2, 3]);
    scrollSub.loadMore();
    await expect
      .poll(() => getLoadedValues(response))
      .toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
    await expect.poll(() => response.canLoadMore).toEqual(false);
    await addNumberItems(db, [9]);
    await expect.poll(() => response.canLoadMore).toEqual(true);
    scrollSub.loadMore();
    await expect
      .poll(() => getLoadedValues(response))
      .toEqual([0, 1, 2, 3, 5, 6, 7, 8, 9]);
  });

  test('adding negative numbers', async ({ db }) => {
    let response: Record<string, any> = {};
    const callback = vi.fn<(response: any) => void>((resp) => {
      response = resp;
    });

    const scrollSub = db.subscribeInfiniteQuery(
      {
        items: {
          $: {
            limit: 4,
            order: {
              value: 'asc',
            },
          },
        },
      },
      callback,
    );

    await addNumberItems(db, [0, 1, 2, 3]);

    await expect.poll(() => getLoadedValues(response)).toEqual([0, 1, 2, 3]);

    await addNumberItem(db, -1);

    await expect
      .poll(() => getLoadedValues(response))
      .toEqual([-1, 0, 1, 2, 3]);

    await addNumberItems(db, [-4]);
    await expect
      .poll(() => getLoadedValues(response))
      .toEqual([-4, -1, 0, 1, 2, 3]);
    await addNumberItems(db, [-2]);
    await expect
      .poll(() => getLoadedValues(response))
      .toEqual([-4, -2, -1, 0, 1, 2, 3]);

    await addNumberItems(db, [4, 5, 6]);

    await expect
      .poll(() => getLoadedValues(response))
      .toEqual([-4, -2, -1, 0, 1, 2, 3]);

    await expect.poll(() => response.canLoadMore).toEqual(true);

    scrollSub.loadMore();

    await expect.poll(() => response.canLoadMore).toEqual(false);
  });
});
