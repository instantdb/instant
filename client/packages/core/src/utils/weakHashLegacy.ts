/**
 * Pre-v1.0.39 weakHash, kept verbatim for one-time IndexedDB migration.
 *
 * The current `weakHash` produces different output for the same input, so
 * entries persisted by older clients live under stale keys. When we encounter
 * a cache miss under the new hash we fall back to looking up the legacy hash,
 * migrate the entry, and delete the legacy key.
 *
 * Safe to delete once we're confident no users are still on a version that
 * wrote with this hash (a few releases past v1.0.39).
 */
export default function weakHashLegacy(input: any): string {
  if (typeof input === 'number') {
    return (Math.abs(input * 2654435761) >>> 0).toString(16);
  }
  if (typeof input === 'boolean') return input ? '1' : '0';
  if (input === null) return 'null';
  if (input === undefined) return 'undefined';

  if (typeof input === 'string') {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash +=
        (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      hash = hash >>> 0;
    }
    return hash.toString(16);
  }

  if (Array.isArray(input)) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      hash ^= (i + 1) * 2654435761;
      const elementHash = weakHashLegacy(input[i]);
      for (let j = 0; j < elementHash.length; j++) {
        hash ^= elementHash.charCodeAt(j);
        hash *= 16777619;
        hash = hash >>> 0;
      }
    }
    return hash.toString(16);
  }

  if (typeof input === 'object') {
    let hash = 0x811c9dc5;
    const keys = Object.keys(input).sort();

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (input[key] === undefined) {
        continue;
      }
      const keyHash = weakHashLegacy(key);
      hash ^= parseInt(keyHash, 16);
      hash *= 16777619;
      hash = hash >>> 0;

      const valueHash = weakHashLegacy(input[key]);
      hash ^= parseInt(valueHash, 16);
      hash *= 16777619;
      hash = hash >>> 0;
    }
    return hash.toString(16);
  }

  return weakHashLegacy(String(input));
}
