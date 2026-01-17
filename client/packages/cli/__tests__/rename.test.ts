import { test, expect } from 'vitest';
import { buildAutoRenameSelector } from '../src/rename';
import {
  diffSchemas,
  i,
  MigrationTx,
  MigrationTxTypes,
} from '@instantdb/platform';

const beforeSchema = i.schema({
  entities: {
    animals: i.entity({
      name: i.string(),
      age: i.number(),
      speccies: i.string(), // spelled wrong!
    }),
  },
  links: {
    friend: {
      forward: {
        has: 'many',
        label: 'mother', // from mother -> parent
        on: 'animals',
        required: false,
      },
      reverse: {
        has: 'many',
        label: 'child',
        on: 'animals',
        required: false,
      },
    },
  },
});
const afterSchema = i.schema({
  entities: {
    animals: i.entity({
      name: i.string(),
      age: i.number(),
      species: i.string(), // spelled correct!
    }),
  },
  links: {
    friend: {
      forward: {
        has: 'many',
        label: 'parent',
        on: 'animals',
        required: false,
      },
      reverse: {
        has: 'many',
        label: 'child',
        on: 'animals',
        required: false,
      },
    },
  },
});

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

test('works without flags', async () => {
  const fun = buildAutoRenameSelector({
    rename: [],
  });

  const result = await diffSchemas(beforeSchema, afterSchema, fun, {});

  console.log(result);
  expectTxType(result, 'delete-attr', 2);
  expectTxType(result, 'add-attr', 2);
});

test('simple attr flag', async () => {
  const fun = buildAutoRenameSelector({
    rename: ['animals.speccies:animals.species'],
  });

  const result = await diffSchemas(beforeSchema, afterSchema, fun, {});

  console.log(result);
  expectTxType(result, 'update-attr', 1);
});

test('simple link flag', async () => {
  const fun = buildAutoRenameSelector({
    rename: ['animals.mother:animals.parent'],
  });

  const result = await diffSchemas(beforeSchema, afterSchema, fun, {});

  console.log(result);
  expectTxType(result, 'update-attr', 1);
  expectTxType(result, 'delete-attr', 1);
  expectTxType(result, 'add-attr', 1);
});

test('both links and base attrs', async () => {
  const fun = buildAutoRenameSelector({
    rename: [
      'animals.speccies:animals.species',
      'animals.mother:animals.parent',
    ],
  });

  const result = await diffSchemas(beforeSchema, afterSchema, fun, {});

  console.log(result);
  expectTxType(result, 'update-attr', 2);
});

test('nonexisting flag', async () => {
  const fun = buildAutoRenameSelector({
    rename: ['animals.favoriteFood:animals.favoriteFood'],
  });

  const result = await diffSchemas(beforeSchema, afterSchema, fun, {});

  console.log(result);
  expectTxType(result, 'delete-attr', 2);
  expectTxType(result, 'add-attr', 2);
});
