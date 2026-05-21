/**
 * Stable, non-cryptographic 64-bit hash.
 *
 * We aren't concerned with the hash being decoded.
 *
 * We _do_ want to make sure hashes remain the same, even
 * when objects undergo serializing and deserializing.
 *
 * Inspired by cyrb53 (Math.imul + xxhash-style avalanche).
 * https://stackoverflow.com/a/52171480
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
  if (input && typeof input.toJSON === 'function') {
    return stableStringify(input.toJSON());
  }

  if (Array.isArray(input)) {
    let out = '[';
    for (let i = 0; i < input.length; i++) {
      if (i > 0) out += ',';
      out += stableStringify(input[i]);
    }
    return out + ']';
  }

  if (input && typeof input === 'object') {
    const keys = Object.keys(input);
    keys.sort();
    let out = '{';
    let first = true;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = input[key];
      if (value === undefined) continue;
      if (!first) out += ',';
      out += JSON.stringify(key) + ':' + stableStringify(value);
      first = false;
    }
    return out + '}';
  }

  if (input === undefined) {
    return 'undefined';
  }

  if (typeof input === 'bigint') {
    return `${input}n`;
  }

  return JSON.stringify(input) ?? String(input);
}
