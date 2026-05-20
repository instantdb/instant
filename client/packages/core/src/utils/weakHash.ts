/**
 * Unique Hashing implementation inspired by djb2/fnv1a algorithms,
 * where we are not concerned with the hash being decoded.
 * Focuses on speed while maintaining good hash distribution.
 *
 * Note: We could also use something like 64-bit MurmurHash instead.
 * https://github.com/jensyt/imurmurhash-js/blob/master/imurmurhash.js
 *
 * @param {any} input - Value to hash
 * @returns {string} - Hash in hex format
 */
export default function weakHash(input: any): string {
  const str = stableStringify(input);
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;

  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

function stableStringify(input: any): string {
  if (Array.isArray(input)) {
    return `[${Array.from(input, stableStringify).join(',')}]`;
  }

  if (input && typeof input === 'object') {
    const pairs = Object.keys(input)
      .filter((key) => input[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(input[key])}`);

    return `{${pairs.join(',')}}`;
  }

  if (input === undefined) {
    return 'undefined';
  }

  return JSON.stringify(input) ?? String(input);
}
