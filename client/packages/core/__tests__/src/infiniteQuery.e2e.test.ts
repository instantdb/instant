import { describe, expect, vi } from 'vitest';
import { getInfiniteQueryInitialSnapshot, i, id } from '../../src';
import { makeE2ETest } from './utils/e2e';

async function addNumberItem(db: any, value: number) {
  await db.transact(db.tx.items[id()].update({ value }));
}

async function addNumberItems(db: any, values: number[]) {
  await db.transact(values.map((value) => db.tx.items[id()].update({ value })));
}

async function getItemIdByValue(db: any, value: number): Promise<string> {
  const items = (
    await db.queryOnce({
      items: {
        $: {
          order: {
            value: 'asc',
          },
        },
      },
    })
  ).data.items;

  const match = items.find((item: any) => item.value === value);
  if (!match) {
    throw new Error(`Expected to find item with value ${value}`);
  }

  return match.id;
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

describe('get initial data for useSyncExternalStore', () => {
  test('empty result', async ({ db }) => {
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
    const result = getInfiniteQueryInitialSnapshot(db, {
      items: {
        $: {
          limit: 4,
          order: {
            value: 'asc',
          },
        },
      },
    });
    expect(result.data).toEqual(response.data);
    scrollSub.unsubscribe();
  });
});

describe('infinite scroll number line', () => {
  test('no order field', async ({ db }) => {
    let response: Record<string, any> = {};
    const callback = vi.fn<(response: any) => void>((resp) => {
      response = resp;
    });

    const scrollSub = db.subscribeInfiniteQuery(
      {
        items: {
          $: {
            limit: 4,
          },
        },
      },
      callback,
    );

    await addNumberItem(db, 0);
    await addNumberItem(db, 1);
    await addNumberItem(db, 2);
    await addNumberItem(db, 3);

    await expect.poll(() => getLoadedValues(response)).toEqual([0, 1, 2, 3]);
    await expect
      .poll(() => getLoadedValues(response))
      .not.toEqual([3, 2, 10, 1, 2, 3]);
    scrollSub.unsubscribe();
  });

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

    await addNumberItems(db, [0, 1, 2, 3]);

    await expect.poll(() => getLoadedValues(response)).toContain(3);
    await addNumberItems(db, [5, 6, 7, 8]);
    await expect.poll(() => getLoadedValues(response)).toEqual([0, 1, 2, 3]);
    await expect.poll(() => response.canLoadNextPage).toBe(true);
    scrollSub.loadNextPage();
    await expect
      .poll(() => getLoadedValues(response))
      .toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
    scrollSub.unsubscribe();
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
    scrollSub.unsubscribe();
  });

  test('add zero twice', async ({ db }) => {
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
              value: 'desc',
            },
          },
        },
      },
      callback,
    );
    addNumberItem(db, 0);
    addNumberItem(db, 0);
    await expect.poll(() => getLoadedValues(response)).toEqual([0, 0]);
    scrollSub.unsubscribe();
  });
});

describe('unique queries', () => {
  test('descending', async ({ db }) => {
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
              value: 'desc',
            },
          },
        },
      },
      callback,
    );

    await addNumberItems(db, [4, 5]);

    await expect.poll(() => getLoadedValues(response)).toEqual([5, 4]);
    await addNumberItems(db, [1]);
    await expect.poll(() => getLoadedValues(response)).toEqual([5, 4, 1]);
    await addNumberItems(db, [1, 2, 3]);
    await expect.poll(() => getLoadedValues(response)).toEqual([5, 4, 3, 2]);
    await expect.poll(() => response.canLoadNextPage).toEqual(true);
    scrollSub.loadNextPage();
    await expect
      .poll(() => getLoadedValues(response))
      .toEqual([5, 4, 3, 2, 1, 1]);
    scrollSub.unsubscribe();
  });

  test('duplicate boundary values across pages (desc)', async ({ db }) => {
    let response: Record<string, any> = {};
    const callback = vi.fn<(response: any) => void>((resp) => {
      response = resp;
    });

    const scrollSub = db.subscribeInfiniteQuery(
      {
        items: {
          $: {
            limit: 3,
            order: {
              value: 'desc',
            },
          },
        },
      },
      callback,
    );

    await addNumberItems(db, [5, 4, 3, 2, 2, 2, 1]);

    await expect.poll(() => getLoadedValues(response)).toEqual([5, 4, 3]);
    await expect.poll(() => response.canLoadNextPage).toEqual(true);

    scrollSub.loadNextPage();
    await expect
      .poll(() => getLoadedValues(response))
      .toEqual([5, 4, 3, 2, 2, 2]);
    await expect.poll(() => response.canLoadNextPage).toEqual(true);

    scrollSub.loadNextPage();
    await expect
      .poll(() => getLoadedValues(response))
      .toEqual([5, 4, 3, 2, 2, 2, 1]);
    await expect.poll(() => response.canLoadNextPage).toEqual(false);
    scrollSub.unsubscribe();
  });

  test('rapid loadNextPage calls do not duplicate pages', async ({ db }) => {
    let response: Record<string, any> = {};

    const scrollSub = db.subscribeInfiniteQuery(
      {
        items: {
          $: {
            limit: 2,
            order: {
              value: 'asc',
            },
          },
        },
      },
      (resp: any) => {
        response = resp;
      },
    );

    await addNumberItems(db, [1, 2, 3, 4, 5, 6]);

    await expect.poll(() => getLoadedValues(response)).toEqual([1, 2]);
    await expect.poll(() => response.canLoadNextPage).toEqual(true);

    scrollSub.loadNextPage();

    await expect.poll(() => getLoadedValues(response)).toEqual([1, 2, 3, 4]);
    await expect.poll(() => response.canLoadNextPage).toEqual(true);
    scrollSub.unsubscribe();
  });

  test('deleting an item', async ({ db }) => {
    let response: Record<string, any> = {};

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
      (resp: any) => {
        response = resp;
      },
    );

    await addNumberItems(db, [1, 2, 3, 4, 5, 6]);
    await expect.poll(() => getLoadedValues(response)).toEqual([1, 2, 3, 4]);
    await expect.poll(() => response.canLoadNextPage).toBe(true);

    scrollSub.loadNextPage();
    await expect
      .poll(() => getLoadedValues(response))
      .toEqual([1, 2, 3, 4, 5, 6]);
    await expect.poll(() => response.canLoadNextPage).toEqual(false);

    const threeId = await getItemIdByValue(db, 3);
    await db.transact(db.tx.items[threeId].delete());

    await expect.poll(() => getLoadedValues(response)).toEqual([1, 2, 4, 5, 6]);
    await expect.poll(() => response.canLoadNextPage).toEqual(false);
    scrollSub.unsubscribe();
  });

  test('updating an out-of-window item can reorder into visible chunk', async ({
    db,
  }) => {
    let response: Record<string, any> = {};

    const scrollSub = db.subscribeInfiniteQuery(
      {
        items: {
          $: {
            limit: 3,
            order: {
              value: 'asc',
            },
          },
        },
      },
      (resp: any) => {
        response = resp;
      },
    );

    await addNumberItems(db, [10, 20, 30, 40, 50, 60]);
    const sixtyId = await getItemIdByValue(db, 60);
    await db.transact(db.tx.items[sixtyId].update({ value: 15 }));

    await expect.poll(() => getLoadedValues(response)).toEqual([10, 15, 20]);
    await expect.poll(() => response.canLoadNextPage).toEqual(true);

    scrollSub.loadNextPage();
    await expect
      .poll(() => getLoadedValues(response))
      .toEqual([10, 15, 20, 30, 40, 50]);
    await expect.poll(() => response.canLoadNextPage).toEqual(false);
    scrollSub.unsubscribe();
  });

  test('page size 1, asc', async ({ db }) => {
    let response: Record<string, any> = {};
    const callback = vi.fn<(response: any) => void>((resp) => {
      response = resp;
    });

    const scrollSub = db.subscribeInfiniteQuery(
      {
        items: {
          $: {
            limit: 1,
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

    await expect.poll(() => getLoadedValues(response)).toEqual([0]);
    await expect.poll(() => response.canLoadNextPage).toEqual(true);
    scrollSub.loadNextPage();
    await expect.poll(() => getLoadedValues(response)).toEqual([0, 1]);
  });

  test('page size 1, desc', async ({ db }) => {
    let response: Record<string, any> = {};
    const callback = vi.fn<(response: any) => void>((resp) => {
      response = resp;
    });

    const scrollSub = db.subscribeInfiniteQuery(
      {
        items: {
          $: {
            limit: 1,
            order: {
              value: 'desc',
            },
          },
        },
      },
      callback,
    );

    await addNumberItem(db, 0);
    await addNumberItem(db, -1);

    await expect.poll(() => getLoadedValues(response)).toEqual([0]);
    await expect.poll(() => response.canLoadNextPage).toEqual(true);
    scrollSub.loadNextPage();
    await expect.poll(() => getLoadedValues(response)).toEqual([0, -1]);
  });
});
