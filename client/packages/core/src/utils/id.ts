import { v4 } from 'uuid';

function uuidToByteArray(uuid: string) {
  const hex = uuid.replace(/-/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

function compareByteArrays(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function isDash(i: number): boolean {
  return i === 8 || i === 13 || i === 18 || i === 23;
}

// The value of a hex digit, or -1.
function hexValue(c: number): number {
  if (c >= 48 && c <= 57) return c - 48; // 0-9
  const lower = c | 32;
  if (lower >= 97 && lower <= 102) return lower - 87; // a-f, A-F
  return -1;
}

// Compares two UUIDs digit by digit, which gives the same order as their bytes
// (and Postgres' uuid order) without allocating. Returns undefined as soon as
// a character it needs is not where a canonical UUID has it, so malformed ids
// keep the byte comparison and its parseInt behaviour.
function compareCanonicalUuids(a: string, b: string): number | undefined {
  if (a.length !== 36 || b.length !== 36) return undefined;
  for (let i = 0; i < 36; i++) {
    if (isDash(i)) {
      if (a.charCodeAt(i) !== 45 || b.charCodeAt(i) !== 45) return undefined;
      continue;
    }
    const x = hexValue(a.charCodeAt(i));
    const y = hexValue(b.charCodeAt(i));
    if (x < 0 || y < 0) return undefined;
    if (x !== y) {
      // The byte at i may hold the next digit too, which must also parse.
      const next = i + 1;
      if (
        next < 36 &&
        !isDash(next) &&
        (hexValue(a.charCodeAt(next)) < 0 || hexValue(b.charCodeAt(next)) < 0)
      ) {
        return undefined;
      }
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

export function uuidCompare(uuid_a: string, uuid_b: string) {
  // instaql breaks sort ties with this, so it runs O(n log n) times for a
  // result whose order values are mostly equal. Parsing both ids into byte
  // arrays on every call dominates the sort for large results.
  if (uuid_a === uuid_b) return 0;
  return (
    compareCanonicalUuids(uuid_a, uuid_b) ??
    compareByteArrays(uuidToByteArray(uuid_a), uuidToByteArray(uuid_b))
  );
}

function id(): string {
  return v4();
}

export default id;
