import { expect, test as test } from 'vitest';
import { i } from '@instantdb/core';
import {
  diffSchemas,
  Identifier,
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

const systemCatalogIdentNames = {
  $users: new Set(['id', 'email', 'linkedPrimaryUser', 'linkedGuestUsers']),
  $files: new Set(['id', 'path']),
} as const;

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

const simpleSummary = (result: MigrationTx[]) => {
  let simpleSummary: Record<string, Identifier[]> = {};
  for (const tx of result) {
    simpleSummary[tx.type] = simpleSummary[tx.type] || [];
    simpleSummary[tx.type].push(tx.identifier);
  }
  return simpleSummary;
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
    systemCatalogIdentNames,
  );
  console.log(result);
  expectTxType(result, 'delete-attr', 2);
});

test('delete and add - intent', async () => {
  const result = await diffSchemas(
    simpleSchemaBefore,
    simpleSchemaAfter,
    createChooser([]),
    systemCatalogIdentNames,
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
    systemCatalogIdentNames,
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
    systemCatalogIdentNames,
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
    systemCatalogIdentNames,
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
    systemCatalogIdentNames,
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
    systemCatalogIdentNames,
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
    systemCatalogIdentNames,
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
    systemCatalogIdentNames,
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
    systemCatalogIdentNames,
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
    systemCatalogIdentNames,
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
    systemCatalogIdentNames,
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
    systemCatalogIdentNames,
  );
  console.log(result);
  expectTxType(result, 'update-attr', 1);
  expect((result[0] as any).partialAttr['on-delete']).toBe('cascade');
});

test('update link delete restrict', async () => {
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
            onDelete: 'restrict',
            label: 'songs',
          },
          reverse: { on: 'songs', has: 'one', label: 'albums' },
        },
      },
    }),
    createChooser([]),
    systemCatalogIdentNames,
  );
  console.log(result);
  expectTxType(result, 'update-attr', 1);
  expect((result[0] as any).partialAttr['on-delete']).toBe('restrict');
});

test('update link delete cascade to restrict', async () => {
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
            onDelete: 'restrict',
            label: 'songs',
          },
          reverse: { on: 'songs', has: 'one', label: 'albums' },
        },
      },
    }),
    createChooser([]),
    systemCatalogIdentNames,
  );
  console.log(result);
  expectTxType(result, 'update-attr', 1);
  expect((result[0] as any).partialAttr['on-delete']).toBe('restrict');
});

test('system catalog attrs are ignored when adding entities', async () => {
  const result = await diffSchemas(
    i.schema({
      entities: {},
    }),
    i.schema({
      entities: {
        $users: i.entity({
          email: i.string(),
          fullName: i.string().optional(),
        }),
        $files: i.entity({
          path: i.string().unique().indexed(),
        }),
      },
      links: {
        fileOwner: {
          forward: {
            on: '$files',
            has: 'one',
            label: 'owner',
          },
          reverse: {
            on: '$users',
            has: 'many',
            label: 'ownedFiles',
          },
        },
        $usersLinkedPrimaryUser: {
          forward: {
            on: '$users',
            has: 'one',
            label: 'linkedPrimaryUser',
            onDelete: 'cascade',
          },
          reverse: {
            on: '$users',
            has: 'many',
            label: 'linkedGuestUsers',
          },
        },
      },
    }),
    createChooser([]),
    systemCatalogIdentNames,
  );
  expect(simpleSummary(result)).toEqual({
    'add-attr': [
      {
        namespace: '$users',
        attrName: 'fullName',
      },
      {
        attrName: 'owner',
        namespace: '$files',
      },
    ],
  });
});

test('system catalog attrs are ignored when deleting entities', async () => {
  const result = await diffSchemas(
    i.schema({
      entities: {
        $users: i.entity({
          email: i.string(),
          fullName: i.string().optional(),
        }),
        $files: i.entity({
          path: i.string().unique().indexed(),
        }),
      },
      links: {
        fileOwner: {
          forward: {
            on: '$files',
            has: 'one',
            label: 'owner',
          },
          reverse: {
            on: '$users',
            has: 'many',
            label: 'ownedFiles',
          },
        },
        $usersLinkedPrimaryUser: {
          forward: {
            on: '$users',
            has: 'one',
            label: 'linkedPrimaryUser',
            onDelete: 'cascade',
          },
          reverse: {
            on: '$users',
            has: 'many',
            label: 'linkedGuestUsers',
          },
        },
      },
    }),
    i.schema({
      entities: {},
    }),
    createChooser([]),
    systemCatalogIdentNames,
  );
  expect(simpleSummary(result)).toEqual({
    'delete-attr': [
      {
        attrName: 'fullName',
        namespace: '$users',
      },
      {
        attrName: 'owner',
        namespace: '$files',
      },
    ],
  });
});

test('system catalog attrs are ignored when changing entities', async () => {
  const result = await diffSchemas(
    i.schema({
      entities: {
        $users: i.entity({
          email: i.string(),
          fullName: i.string().optional(),
        }),
        $files: i.entity({
          path: i.string().unique().indexed(),
        }),
      },
      links: {
        fileOwner: {
          forward: {
            on: '$files',
            has: 'one',
            label: 'owner',
          },
          reverse: {
            on: '$users',
            has: 'many',
            label: 'ownedFiles',
          },
        },
        $usersLinkedPrimaryUser: {
          forward: {
            on: '$users',
            has: 'one',
            label: 'linkedPrimaryUser',
            onDelete: 'cascade',
          },
          reverse: {
            on: '$users',
            has: 'many',
            label: 'linkedGuestUsers',
          },
        },
      },
    }),
    i.schema({
      entities: {
        $users: i.entity({
          email: i.number(),
          fullName: i.number().optional(),
        }),
        $files: i.entity({
          path: i.string().unique().indexed(),
        }),
      },
      links: {
        fileOwner: {
          forward: {
            on: '$files',
            has: 'one',
            label: 'owner',
          },
          reverse: {
            on: '$users',
            has: 'one',
            label: 'ownedFiles',
          },
        },
        $usersLinkedPrimaryUser: {
          forward: {
            on: '$users',
            has: 'many',
            label: 'linkedPrimaryUser',
            onDelete: 'cascade',
          },
          reverse: {
            on: '$users',
            has: 'many',
            label: 'linkedGuestUsers',
          },
        },
      },
    }),
    createChooser([]),
    systemCatalogIdentNames,
  );
  expect(simpleSummary(result)).toEqual({
    'check-data-type': [
      {
        attrName: 'fullName',
        namespace: '$users',
      },
    ],
    unique: [
      {
        namespace: '$files',
        attrName: 'owner',
      },
    ],
  });
});
