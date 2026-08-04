import { describe, expect, test } from 'vitest';
import { formatVal } from '../format-value';

describe('formatVal', () => {
  test('formats boolean values as visible text', () => {
    expect(formatVal(true)).toBe('true');
    expect(formatVal(false)).toBe('false');
  });
});
