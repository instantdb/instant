/**
 *
 * Unique Hashing implementation inspired by djb2/fnv1a algorithms,
 * where we are not concerned with the hash being decoded.
 * Focuses on speed while maintaining good hash distribution
 *
 * Note: We could also use something like Murmurhash instead
 * https://github.com/jensyt/imurmurhash-js/blob/master/imurmurhash.js
 *
 * @param {any} input - Value to hash
 * @returns {string} - Hash in hex format
 */
export default function weakHash(input: any): string {
  // Handle primitives without JSON stringify for better performance
  if (typeof input === 'number') {
    // Use a larger number space for numeric values
    return (Math.abs(input * 2654435761) >>> 0).toString(16);
  }
  if (typeof input === 'boolean') return input ? '1' : '0';
  if (input === null) return 'null';
  if (input === undefined) return 'undefined';

  // For strings, use FNV-1a algorithm
  if (typeof input === 'string') {
    let hash = 0x811c9dc5; // FNV offset basis (32 bit)
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash +=
        (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      hash = hash >>> 0; // Convert to unsigned 32-bit after each iteration
    }
    return hash.toString(16);
  }

  // For arrays, hash elements directly
  if (Array.isArray(input)) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      // Add array position to hash calculation
      hash ^= (i + 1) * 2654435761;
      // Recursively hash array elements
      const elementHash = weakHash(input[i]);
      // Mix the element hash into the running hash
      for (let j = 0; j < elementHash.length; j++) {
        hash ^= elementHash.charCodeAt(j);
        hash *= 16777619; // FNV prime (32 bit)
        hash = hash >>> 0;
      }
    }
    return hash.toString(16);
  }

  // For objects, hash keys and values
  if (typeof input === 'object') {
    let hash = 0x811c9dc5;
    const keys = Object.keys(input).sort(); // Sort for consistency

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      // Hash the key using string hash
      const keyHash = weakHash(key);
      hash ^= parseInt(keyHash, 16);
      hash *= 16777619;
      hash = hash >>> 0;

      // Hash the value recursively
      const valueHash = weakHash(input[key]);
      hash ^= parseInt(valueHash, 16);
      hash *= 16777619;
      hash = hash >>> 0;
    }
    return hash.toString(16);
  }

  // Fallback for other types
  return weakHash(String(input));
}
