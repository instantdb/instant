import { xxHash32 } from 'js-xxhash';

export function stem(word: string) {
  word = word.toLowerCase().replaceAll(/[^a-z]/g, '');
  if (word.endsWith('ing') && word.length > 4) {
    word = word.slice(0, -3);
  } else if (word.endsWith('ed') && word.length > 3) {
    word = word.slice(0, -2);
  } else if (word.endsWith('s') && word.length > 3 && !word.endsWith('ss')) {
    word = word.slice(0, -1);
  } else if (word.endsWith('ly') && word.length > 3) {
    word = word.slice(0, -2);
  } else if (word.endsWith('er') && word.length > 4) {
    word = word.slice(0, -2);
  } else if (word.endsWith('est') && word.length > 4) {
    word = word.slice(0, -3);
  }
  return word;
}

export type Sketch = {
  rows: number;
  columns: number;
  buckets: Uint32Array;
};

export type HashFn = (word: string, seed: number) => number;

export function hash32(word: string, seed: number): number {
  return xxHash32(word, seed >>> 0) >>> 0;
}

export function createSketch({
  rows,
  columns,
}: {
  rows: number;
  columns: number;
}) {
  return {
    rows,
    columns,
    buckets: new Uint32Array(rows * columns),
  };
}

export function add(sketch: Sketch, word: string, amount: number) {
  const { rows, columns, buckets } = sketch;
  for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
    const hash = hash32(word, rowIdx);
    const columnIdx = hash % columns;
    const globalIdx = rowIdx * columns + columnIdx;
    buckets[globalIdx]! += amount;
  }
}

export function check(sketch: Sketch, word: string) {
  const { rows, columns, buckets } = sketch;
  let approx = Infinity;
  for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
    const hash = hash32(word, rowIdx);
    const columnIdx = hash % columns;
    const globalIdx = rowIdx * columns + columnIdx;
    approx = Math.min(approx, buckets[globalIdx]!);
  }
  return approx;
}

export function buildSketch(
  entries: Array<[string, number]>,
  rows: number,
  columns: number,
): Sketch {
  const sketch = createSketch({ rows, columns });
  for (const [word, count] of entries) {
    add(sketch, word, count);
  }
  return sketch;
}
