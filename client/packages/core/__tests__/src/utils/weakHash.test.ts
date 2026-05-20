import { expect, test } from 'vitest';
import weakHash from '../../../src/utils/weakHash';

function proSearchPropertyQuery(propertyId: number) {
  return {
    pro_search_properties: {
      $: {
        where: {
          pro_searches: 'b14fae2f-ce9b-4677-b6a9-6dddd81914d0',
          propertyId,
        },
      },
      pro_searches: {},
    },
  };
}

test('does not collide for known property-card queries', () => {
  expect(weakHash(proSearchPropertyQuery(936))).not.toBe(
    weakHash(proSearchPropertyQuery(27140)),
  );
});

test('does not collide across many property-card query ids', () => {
  const hashes = new Set<string>();

  for (let propertyId = 0; propertyId < 100_000; propertyId++) {
    const hash = weakHash(proSearchPropertyQuery(propertyId));
    expect(hashes.has(hash), `collision at propertyId=${propertyId}`).toBe(
      false,
    );
    hashes.add(hash);
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
