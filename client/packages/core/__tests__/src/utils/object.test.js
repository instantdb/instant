import { test, expect, describe } from 'vitest';

import {
  assocInMutative,
  dissocInMutative,
  insertInMutative,
} from '../../../src/utils/object';

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

describe('insertInMutative', () => {
  test('it works on normal objects', () => {
    const obj1 = { a: 1 };
    insertInMutative(obj1, ['b'], 2);
    expect(obj1).toEqual({ a: 1, b: 2 });

    const obj2 = { a: {} };
    assocInMutative(obj2, ['a', 'b', 'c'], 3);
    expect(obj2).toEqual({ a: { b: { c: 3 } } });
  });

  test('inserts on arrays', () => {
    const obj0 = [];
    insertInMutative(obj0, [0], 'a');
    expect(obj0).toEqual(['a']);

    const obj1 = ['b'];
    insertInMutative(obj1, [0], 'a');
    expect(obj1).toEqual(['a', 'b']);

    const obj2 = ['b'];
    insertInMutative(obj2, [1], 'a');
    expect(obj2).toEqual(['b', 'a']);

    const obj3 = { x: ['b'] };
    insertInMutative(obj3, ['x', 0], 'a');
    expect(obj3).toEqual({ x: ['a', 'b'] });

    const obj4 = { w: { x: { y: ['a', 'b', 'c', 'd'], z: 4 } } };
    insertInMutative(obj4, ['w', 'x', 'y', 1], 'a');
    expect(obj4).toEqual({ w: { x: { y: ['a', 'a', 'b', 'c', 'd'], z: 4 } } });

    const obj5 = { w: { x: { y: ['a', 'b', 'c', 'd'], z: 4 } } };
    insertInMutative(obj5, ['w', 'x', 'z'], 'a');
    expect(obj5).toEqual({ w: { x: { y: ['a', 'b', 'c', 'd'], z: 'a' } } });
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
  test('works on arrays', () => {
    const obj = { a: { b: { c: ['a', 'b', 'c', 'd'] } } };
    dissocInMutative(obj, ['a', 'b', 'c', 1]);
    expect(obj).toEqual({ a: { b: { c: ['a', 'c', 'd'] } } });
  });
});
