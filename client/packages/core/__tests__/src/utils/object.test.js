import { test, expect, describe } from 'vitest';

import { assocInMutative, dissocInMutative } from '../../../src/utils/object';

describe('assocInMutative', () => {
  test('adds value at a shallow path', () => {
    const obj = { a: 1 };
    assocInMutative(obj, ['b'], 2);
    expect(obj).toEqual({ a: 1, b: 2 });
  });

  test('adds value at a nested path', () => {
    const obj = { a: {} };
    assocInMutative(obj, ['a', 'b', 'c'], 3);
    expect(obj).toEqual({ a: { b: { c: 3 } } });
  });
});

describe('dissocInMutative', () => {
  test('deletes a shallow property', () => {
    const obj = { a: 1, b: 2 };
    dissocInMutative(obj, ['a']);
    expect(obj).toEqual({ b: 2 });
  });

  test('deletes a nested property', () => {
    const obj = { a: { b: { c: 3, d: 4 } } };
    dissocInMutative(obj, ['a', 'b', 'c']);
    expect(obj).toEqual({ a: { b: { d: 4 } } });
  });
});
