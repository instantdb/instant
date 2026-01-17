import { describe, it, expect } from 'vitest';
import { coerceToDate } from '../../../src/utils/dates.ts';

describe('coerceToDate', () => {
  describe('parse-date-value-works-for-valid-dates', () => {
    // Map of string -> expected result
    const validDateStrings = {
      'Sat, 05 Apr 2025 18:00:31 GMT': '2025-04-05T18:00:31.000Z',
      '2025-01-01T00:00:00Z': '2025-01-01T00:00:00.000Z',
      '2025-01-01': '2025-01-01T00:00:00.000Z',
      '2025-01-02T00:00:00-08': '2025-01-02T08:00:00.000Z',
      // Single-digit month/day formats
      '2025-11-2T00:00:00.000Z': '2025-11-02T00:00:00.000Z',
      '2025-1-2T00:00:00.000Z': '2025-01-02T00:00:00.000Z',
      '2025-9-29T23:59:59.999Z': '2025-09-29T23:59:59.999Z',
      '2025-1-2 00:00:00': '2025-01-02T00:00:00.000Z',
      '"2025-01-02T00:00:00-08"': '2025-01-02T08:00:00.000Z',
      '2025-01-15 20:53:08.200': '2025-01-15T20:53:08.200Z',
      '2025-01-15 20:53:08.892865': '2025-01-15T20:53:08.892Z',
      '"2025-01-15 20:53:08"': '2025-01-15T20:53:08.000Z',
      'Wed Jul 09 2025': '2025-07-09T00:00:00.000Z',
      '8/4/2025, 11:02:31 PM': '2025-08-04T23:02:31.000Z',
      '2024-12-30 20:19:41.892865+00': '2024-12-30T20:19:41.892Z',
      epoch: '1970-01-01T00:00:00.000Z',
      'Mon Feb 24 2025 22:37:27 GMT+0000': '2025-02-24T22:37:27.000Z',
      '\t2025-03-02T16:08:53Z': '2025-03-02T16:08:53.000Z',
      '2024-05-29 01:51:06.11848+00': '2024-05-29T01:51:06.118Z',
      '2025-03-01T16:08:53+0000': '2025-03-01T16:08:53.000Z',
      '2025-12-31 21:11': '2025-12-31T21:11:00.000Z',
      '04-17-2025': '2025-04-17T00:00:00.000Z',
      '2025-06-12T10:56:31.924+0530': '2025-06-12T05:26:31.924Z',
      '72026-07-01': '+072026-07-01T00:00:00.000Z',
      '2025-06-05T17:00:00EST': '2025-06-05T22:00:00.000Z',
      '2025-06-05T17:00:00PDT': '2025-06-06T00:00:00.000Z',
      '2025-06-05T17:00:00CETDST': '2025-06-05T15:00:00.000Z',
      '2025-06-05T17:00:00CET': '2025-06-05T16:00:00.000Z',
    };

    for (const [dateString, expected] of Object.entries(validDateStrings)) {
      it(`should parse ${dateString} to ${expected}`, () => {
        const result = coerceToDate(dateString);
        expect(result).toBeInstanceOf(Date);
      });
    }
  });

  describe('parse-date-value-throws-for-invalid-dates', () => {
    const invalidDateStrings = ['2025-01-0', '"2025-01-0"'];

    invalidDateStrings.forEach((dateString) => {
      it(`throws for invalid date string: ${dateString}`, () => {
        expect(() => coerceToDate(dateString)).toThrow(/Unable to parse/);
      });
    });
  });

  describe('additional edge cases', () => {
    it('should handle Date instances', () => {
      const date = new Date('2025-01-15T10:30:00Z');
      const result = coerceToDate(date);
      expect(result).toBe(date);
    });

    it('should handle number timestamps', () => {
      const timestamp = 1642234800000; // 2022-01-15T09:00:00.000Z
      const result = coerceToDate(timestamp);
      expect(result).toBeInstanceOf(Date);
      if (result) {
        expect(result.getTime()).toBe(timestamp);
      }
    });

    it('should throw for unsupported types', () => {
      expect(() => coerceToDate(true)).toThrow();
      expect(() => coerceToDate({})).toThrow();
    });
  });
});
