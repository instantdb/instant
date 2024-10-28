/**
 *
 * Optimized MurmurHash3 implementation (32-bit), where we want consistent,
 * unique hashing and are not concerned with the hash being decoded.
 * Focuses on speed while maintaining good hash distribution
 */
export default function weakHash(input: any) {
  // Convert input to string if necessary
  const str = typeof input === 'string'
    ? input
    : JSON.stringify(Array.isArray(input) ? input : Object.entries(input).sort());

  // MurmurHash3's mixing function
  let h1 = 0xdeadbeef;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;

  for (let i = 0; i < str.length; i++) {
    let k1 = str.charCodeAt(i);

    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = Math.imul(h1, 5) + 0xe6546b64;
  }

  // Final mixing
  h1 ^= str.length;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;

  // Convert to unsigned 32-bit integer and return as hex
  return (h1 >>> 0).toString(16);
}
