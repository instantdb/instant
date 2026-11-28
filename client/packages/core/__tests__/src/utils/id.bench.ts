import { bench } from 'vitest';
import { v4 } from 'uuid';
import { compareOrder } from '../../../src/instaql.ts';

// A large result ordered by a field most rows share, such as a timestamp
// written in one batch: nearly every comparison falls through to the id.
const rows = Array.from({ length: 15000 }, (_, i) => ({
  id: v4(),
  value: Math.floor(i / 1000),
}));

bench('sort 15,000 rows with tied order values', () => {
  [...rows].sort((a, b) =>
    compareOrder(a.id, a.value, b.id, b.value, 'number'),
  );
});
