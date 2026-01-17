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

export function uuidCompare(uuid_a: string, uuid_b: string) {
  return compareByteArrays(uuidToByteArray(uuid_a), uuidToByteArray(uuid_b));
}

function id(): string {
  return v4();
}

export default id;
