import { describe, it, expect } from 'vitest';
import { uuidCompare } from '../../../src/utils/id.ts';

// The comparison before the fast path, copied as it was.
function uuidToByteArray(uuid: string) {
  const hex = uuid.replace(/-/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

function byteCompare(uuid_a: string, uuid_b: string): number {
  const a = uuidToByteArray(uuid_a);
  const b = uuidToByteArray(uuid_b);
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

// Deterministic, so a failure reproduces.
function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x80000000;
  };
}

function randomUuid(random: () => number, digits = '0123456789abcdef') {
  let s = '';
  for (let i = 0; i < 32; i++)
    s += digits[Math.floor(random() * digits.length)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

// Puts a hex digit where a canonical uuid has a dash, now and then.
function moveDashes(uuid: string, random: () => number) {
  return uuid.replace(/-/g, (dash) => (random() < 0.1 ? 'a' : dash));
}

// A copy of `uuid` that keeps its first `prefix` characters and differs after.
function sharingPrefix(uuid: string, prefix: number, random: () => number) {
  return uuid.slice(0, prefix) + randomUuid(random).slice(prefix);
}

function expectSameOrder(a: string, b: string) {
  expect(Math.sign(uuidCompare(a, b))).toBe(byteCompare(a, b));
  expect(Math.sign(uuidCompare(b, a))).toBe(byteCompare(b, a));
}

describe('uuidCompare', () => {
  it('matches the byte order for canonical uuids', () => {
    const random = seeded(1);
    for (let i = 0; i < 20000; i++) {
      const a = randomUuid(random);
      // Shared prefixes of every length, so later characters decide too.
      let b = sharingPrefix(a, i % 37, random);
      if (i % 3 === 0) b = b.toUpperCase();
      expectSameOrder(a, b);
    }
  });

  it('ignores case', () => {
    const a = 'ABCDEF01-2345-4678-9abc-def012345678';
    expect(uuidCompare(a, a.toLowerCase())).toBe(0);
  });

  it('keeps the byte order for ids with non-hex characters', () => {
    // parseInt skips a byte it cannot parse and reads a partial one ("0g").
    expectSameOrder(
      'g0000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
    );
    expectSameOrder(
      'ag000000-0000-4000-8000-000000000000',
      'a5000000-0000-4000-8000-000000000000',
    );
    expectSameOrder(
      'ab000000-0000-4000-8000-000000000000',
      'bg000000-0000-4000-8000-000000000000',
    );
    const random = seeded(3);
    for (let i = 0; i < 20000; i++) {
      const digits = '0123456789abcdefABCDEFgz -';
      const a = moveDashes(randomUuid(random, digits), random);
      const b = moveDashes(
        sharingPrefix(a, i % 37, random).replace(/[0-9]/g, (d) =>
          random() < 0.1 ? 'g' : d,
        ),
        random,
      );
      expectSameOrder(a, b);
    }
  });

  it('keeps the byte order for ids that are not canonical', () => {
    // Same hex digits, dash moved: equal as bytes, different as strings.
    expectSameOrder(
      '0123abcd-0000-4000-8000-000000000001',
      '0123abc-d0000-4000-8000-000000000001',
    );
    // A digit where the first dash belongs shifts every later byte.
    expectSameOrder(
      '0123abcd-1000-4000-8000-000000000000',
      '0123abcd20000-4000-8000-00000000000-',
    );
    // An odd number of hex digits leaves a last byte of one digit.
    expectSameOrder('abc', 'abd');
  });

  it('sorts consistently', () => {
    const random = seeded(2);
    const ids = Array.from({ length: 2000 }, () => randomUuid(random));
    const sorted = [...ids].sort(uuidCompare);
    for (let i = 1; i < sorted.length; i++) {
      expect(byteCompare(sorted[i - 1], sorted[i])).toBeLessThanOrEqual(0);
    }
  });
});
