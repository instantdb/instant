import { expect, test as test } from 'vitest';
import { i } from '@instantdb/core';
import {
  diffSchemas,
  MigrationTx,
  MigrationTxTypes,
  RenamePromptItem,
  RenameResolveFn,
} from '../../src/migrations';

const simpleSchemaBefore = i.schema({
  entities: {
    songs: i.entity({
      artistName: i.string(),
      title: i.string(),
    }),
    albums: i.entity({
      name: i.string(),
    }),
  },
});

const simpleSchemaAfter = i.schema({
  entities: {
    songs: i.entity({
      title: i.string(),
      artist: i.string(),
    }),
  },
});

const createChooser = (
  pickThese: (RenamePromptItem<string> | string)[],
): RenameResolveFn<string> => {
  return async function (created, promptData) {
    console.log('chooser choosing from', [created, ...promptData]);
    const options = [created, ...promptData];
    const selected = options.find((option) => {
      return pickThese.some(
        (provided) => JSON.stringify(option) === JSON.stringify(provided),
      );
    });
    if (selected) {
      return selected;
    } else {
      return created;
    }
  };
};

const expectTxType = (
  txSteps: MigrationTx[],
  type: keyof MigrationTxTypes,
  count?: number,
) => {
  const countMatched = txSteps.filter((step) => step.type == type).length;
  if (count) {
    expect(countMatched).toBe(count);
    return;
  }
  expect(countMatched).toBeGreaterThan(0);
};

test('delete simple entitity', async () => {
  const result = await diffSchemas(
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string(),
        }),
      },
    }),
    i.schema({
      entities: {},
    }),
    createChooser(['artist']),
  );
  console.log(result);
  expectTxType(result, 'delete-attr', 2);
});

test('delete and add - intent', async () => {
  const result = await diffSchemas(
    simpleSchemaBefore,
    simpleSchemaAfter,
    createChooser([]),
  );
  console.log(result);
  expectTxType(result, 'delete-attr', 3);

  // Make sure the albums table id field is deleted
  const idDeleted = result.find(
    (step) =>
      step.type === 'delete-attr' &&
      step.identifier.namespace === 'albums' &&
      step.identifier.attrName === 'id',
  );

  expect(idDeleted).toBeDefined();
});

test('rename - intent', async () => {
  const result = await diffSchemas(
    simpleSchemaBefore,
    simpleSchemaAfter,
    createChooser([
      {
        from: 'artistName',
        to: 'artist',
      },
    ]),
  );
  console.log(result);
  expectTxType(result, 'delete-attr', 2);
});

test('change data type', async () => {
  const result = await diffSchemas(
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string(),
          year: i.string(),
        }),
      },
    }),
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string(),
          year: i.number(),
        }),
      },
    }),
    createChooser([]),
  );

  console.log(result);
  expectTxType(result, 'check-data-type', 1);
  expect(
    result[0].type === 'check-data-type' &&
      result[0]['checked-data-type'] === 'number',
  );
});

test('make required', async () => {
  const result = await diffSchemas(
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string().optional(),
        }),
      },
    }),
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string(),
        }),
      },
    }),
    createChooser([]),
  );
  console.log(result);

  expectTxType(result, 'required', 1);
  const found = result.find(
    (step) =>
      step.type === 'required' &&
      step.identifier.namespace === 'albums' &&
      step.identifier.attrName === 'name',
  );
  expect(found).toBeDefined();
});

test('add index', async () => {
  const result = await diffSchemas(
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string(),
        }),
      },
    }),
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string().indexed(),
        }),
      },
    }),
    createChooser([]),
  );

  expectTxType(result, 'index', 1);
  const found = result.find(
    (step) =>
      step.type === 'index' &&
      step.identifier.namespace === 'albums' &&
      step.identifier.attrName === 'name',
  );
  expect(found).toBeDefined();
});

test('remove index', async () => {
  const result = await diffSchemas(
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string().indexed(),
        }),
      },
    }),
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string(),
        }),
      },
    }),
    createChooser([]),
  );

  expectTxType(result, 'remove-index', 1);
  const found = result.find(
    (step) =>
      step.type === 'remove-index' &&
      step.identifier.namespace === 'albums' &&
      step.identifier.attrName === 'name',
  );
  expect(found).toBeDefined();
});

test('rename and make changes', async () => {
  const result = await diffSchemas(
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string().indexed(),
        }),
      },
    }),
    i.schema({
      entities: {
        albums: i.entity({
          name2: i.string(),
        }),
      },
    }),
    createChooser([{ from: 'name', to: 'name2' }]),
  );

  console.log(result);
  expectTxType(result, 'update-attr', 1);
  expectTxType(result, 'remove-index', 1);

  const found = result.find(
    (step) =>
      step.type === 'update-attr' &&
      step.identifier.namespace === 'albums' &&
      step.identifier.attrName === 'name',
  );
  expect(found).toBeDefined();
});

test('make optional', async () => {
  const result = await diffSchemas(
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string(),
        }),
      },
    }),
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string().optional(),
        }),
      },
    }),
    createChooser([]),
  );

  expectTxType(result, 'remove-required', 1);
});

test('create-link', async () => {
  const result = await diffSchemas(
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string(),
          year: i.number(),
        }),
        songs: i.entity({
          name: i.string(),
        }),
      },
    }),
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string(),
          year: i.number(),
        }),
        songs: i.entity({
          name: i.string(),
        }),
      },
      links: {
        songAlbum: {
          forward: { on: 'albums', has: 'many', label: 'songs' },
          reverse: { on: 'songs', has: 'one', label: 'albums' },
        },
      },
    }),
    createChooser([]),
  );

  console.log(result);

  expectTxType(result, 'add-attr', 1);

  const found = result.find(
    (tx) =>
      tx.type === 'add-attr' &&
      tx['reverse-identity']?.attrName === 'albums' &&
      tx['reverse-identity']?.namespace === 'songs' &&
      tx['forward-identity']?.attrName === 'songs' &&
      tx['forward-identity']?.namespace === 'albums' &&
      tx['unique?'] === true,
  );
  expect(found).toBeDefined();
});

test('delete link', async () => {
  const result = await diffSchemas(
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string(),
        }),
        songs: i.entity({
          name: i.string(),
        }),
      },
      links: {
        songAlbum: {
          forward: { on: 'albums', has: 'many', label: 'songs' },
          reverse: { on: 'songs', has: 'one', label: 'albums' },
        },
      },
    }),
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string(),
        }),
        songs: i.entity({
          name: i.string(),
        }),
      },
      links: {},
    }),
    createChooser([]),
  );
  console.log(result);
  expectTxType(result, 'delete-attr', 1);
});

test('update link cardinality', async () => {
  const result = await diffSchemas(
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string(),
        }),
        songs: i.entity({
          name: i.string(),
        }),
      },
      links: {
        songAlbum: {
          forward: { on: 'albums', has: 'one', label: 'songs' },
          reverse: { on: 'songs', has: 'one', label: 'albums' },
        },
      },
    }),
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string(),
        }),
        songs: i.entity({
          name: i.string(),
        }),
      },
      links: {
        songAlbum: {
          forward: { on: 'albums', has: 'many', label: 'songs' },
          reverse: { on: 'songs', has: 'one', label: 'albums' },
        },
      },
    }),
    createChooser([]),
  );
  console.log(result);
  expectTxType(result, 'update-attr', 1);
  expect((result[0] as any).partialAttr.cardinality).toBe('many');
});

test('update link delete cascade', async () => {
  const result = await diffSchemas(
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string(),
        }),
        songs: i.entity({
          name: i.string(),
        }),
      },
      links: {
        songAlbum: {
          forward: { on: 'albums', has: 'one', label: 'songs' },
          reverse: { on: 'songs', has: 'one', label: 'albums' },
        },
      },
    }),
    i.schema({
      entities: {
        albums: i.entity({
          name: i.string(),
        }),
        songs: i.entity({
          name: i.string(),
        }),
      },
      links: {
        songAlbum: {
          forward: {
            on: 'albums',
            has: 'one',
            onDelete: 'cascade',
            label: 'songs',
          },
          reverse: { on: 'songs', has: 'one', label: 'albums' },
        },
      },
    }),
    createChooser([]),
  );
  console.log(result);
  expectTxType(result, 'update-attr', 1);
  expect((result[0] as any).partialAttr['on-delete']).toBe('cascade');
});
