import { describe, expect, test } from 'vitest';
import { parseFieldValue } from '../edit-row-dialog';

describe('parseFieldValue', () => {
  test.each([
    ['1e6', 1000000],
    ['1e3', 1000],
    ['1e+6', 1000000],
    ['1E6', 1000000],
    ['1e-7', 0.0000001],
    ['-1.25e3', -1250],
    [1e21, 1e21],
    [1e-7, 1e-7],
    ['1000000', 1000000],
    ['1000', 1000],
    ['-1000', -1000],
    ['0', 0],
    ['-12.5', -12.5],
  ])('preserves the numeric value of %s', (value, expected) => {
    expect(parseFieldValue(value, 'number')).toBe(expected);
  });

  test('preserves formatted-number conversion', () => {
    expect(parseFieldValue('$1,234.50', 'number')).toBe(1234.5);
  });

  test('preserves empty and null values', () => {
    expect(parseFieldValue('', 'number')).toBe('');
    expect(parseFieldValue(null, 'number')).toBeNull();
  });
});
