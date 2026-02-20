import { Cursor } from '@instantdb/core';

export function decrementCursor(cursor: Cursor) {
  return [decrementUuid(cursor[0]), cursor[1], cursor[2], cursor[3]];
}

export function incrementCursor(cursor: Cursor) {
  return [incrementUuid(cursor[0]), cursor[1], cursor[2], cursor[3]];
}

export function decrementUuid(uuid: string): string {
  const hex = uuid
    .replace(/-/g, '')
    .split('')
    .map((c) => parseInt(c, 16));

  // Subtract 1 with borrow propagation (right to left)
  for (let i = hex.length - 1; i >= 0; i--) {
    if (hex[i] > 0) {
      hex[i]--;
      break;
    } else {
      hex[i] = 15; // borrow: 0 becomes F, carry continues
    }
  }

  const flat = hex.map((n) => n.toString(16)).join('');
  return `${flat.slice(0, 8)}-${flat.slice(8, 12)}-${flat.slice(12, 16)}-${flat.slice(16, 20)}-${flat.slice(20)}`;
}

export function incrementUuid(uuid: string): string {
  const hex = uuid
    .replace(/-/g, '')
    .split('')
    .map((c) => parseInt(c, 16));

  for (let i = hex.length - 1; i >= 0; i--) {
    if (hex[i] < 15) {
      hex[i]++;
      break;
    } else {
      hex[i] = 0; // carry: F becomes 0, carry continues
    }
  }

  const flat = hex.map((n) => n.toString(16)).join('');
  return `${flat.slice(0, 8)}-${flat.slice(8, 12)}-${flat.slice(12, 16)}-${flat.slice(16, 20)}-${flat.slice(20)}`;
}
