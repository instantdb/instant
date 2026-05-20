import { expect, test } from 'vitest';
import weakHash from '../../../src/utils/weakHash';

test('no collisions across many integer-varying queries', () => {
  const shapes = [
    (i: number) => ({ users: { $: { where: { id: i } } } }),
    (i: number) => ({ posts: { $: { where: { authorId: i } }, author: {} } }),
    (i: number) => ({
      items: {
        $: {
          where: {
            tag: 'b14fae2f-ce9b-4677-b6a9-6dddd81914d0',
            n: i,
          },
        },
      },
    }),
  ];

  for (const shape of shapes) {
    const hashes = new Set<string>();
    for (let i = 0; i < 100_000; i++) {
      const hash = weakHash(shape(i));
      expect(hashes.has(hash), `collision at i=${i}`).toBe(false);
      hashes.add(hash);
    }
  }
});

test('is stable across object key order and undefined values', () => {
  expect(weakHash({ b: 2, a: 1, c: undefined })).toBe(weakHash({ a: 1, b: 2 }));
});

test('keeps array and top-level undefined explicit', () => {
  expect(weakHash([undefined])).not.toBe(weakHash([]));
  expect(weakHash([undefined])).not.toBe(weakHash([null]));
  expect(weakHash(undefined)).not.toBe(weakHash(null));
});

test('handles bigint values without throwing', () => {
  expect(() => weakHash({ id: 123n })).not.toThrow();
  expect(weakHash(123n)).not.toBe(weakHash(123));
  expect(weakHash(123n)).not.toBe(weakHash('123'));
  expect(weakHash(123n)).not.toBe(weakHash('123n'));
});
