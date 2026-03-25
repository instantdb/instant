import { create } from 'mutative';

// Helpers from object.ts in core

function isEmpty(obj: any) {
  return obj && Object.keys(obj).length === 0;
}

/**
 * Like `assocInMutative`, but
 *
 * - for arrays: inserts the value at the specified index, instead of replacing it
 */
function insertInMutative(obj: any, path: any[], value: any) {
  if (!obj) {
    return;
  }
  if (path.length === 0) {
    return;
  }

  let current = obj || {};
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = typeof path[i + 1] === 'number' ? [] : {};
    }
    current = current[key];
  }

  const key = path[path.length - 1];
  if (Array.isArray(current) && typeof key === 'number') {
    current.splice(key, 0, value);
  } else {
    current[key] = value;
  }
}

function assocInMutative(obj: any, path: any[], value: any) {
  if (!obj) {
    return;
  }
  if (path.length === 0) {
    return;
  }

  let current = obj || {};
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = typeof path[i + 1] === 'number' ? [] : {};
    }
    current = current[key];
  }

  current[path[path.length - 1]] = value;
}

function dissocInMutative(obj: any, path: any[]) {
  if (!obj) {
    return;
  }
  if (path.length === 0) {
    return;
  }

  const [key, ...restPath] = path;

  if (!(key in obj)) {
    return;
  }

  if (restPath.length === 0) {
    if (Array.isArray(obj)) {
      obj.splice(key, 1);
    } else {
      delete obj[key];
    }
    return;
  }

  dissocInMutative(obj[key], restPath);
  if (isEmpty(obj[key])) {
    delete obj[key];
  }
}

export type EditOp = '+' | '-' | 'r';
export type Edit = [(string | number)[], EditOp, ...any[]];

export function apply(base: any, edits: Edit[]) {
  return create(base, (draft) => {
    for (let [path, op, value] of edits) {
      switch (op) {
        case '+':
          insertInMutative(draft, path, value);
          break;
        case 'r':
          assocInMutative(draft, path, value);
          break;
        case '-':
          dissocInMutative(draft, path);
          break;
      }
    }
  });
}
