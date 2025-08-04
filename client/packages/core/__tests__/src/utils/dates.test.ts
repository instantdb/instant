import { describe, it, expect } from 'vitest';
import { coerceToDate } from '../../../src/utils/dates.ts';

describe('coerceToDate', () => {
  describe('parse-date-value-works-for-valid-dates', () => {
    const validDateStrings = [
      'Sat, 05 Apr 2025 18:00:31 GMT',
      '2025-01-01T00:00:00Z',
      '2025-01-01',
      '2025-01-02T00:00:00-08',
      '"2025-01-02T00:00:00-08"',
      '2025-01-15 20:53:08',
      '"2025-01-15 20:53:08"',
      'Wed Jul 09 2025',
      '8/4/2025, 11:02:31 PM',
    ];

    validDateStrings.forEach((dateString) => {
      it(`Date string \`${dateString}\` parses.`, () => {
        const result = coerceToDate(dateString);

        // Verify the result is a valid Date
        expect(result).toBeInstanceOf(Date);
        expect(result.getTime()).not.toBeNaN();

        // Additional specific validations for known cases
        switch (dateString) {
          case 'Sat, 05 Apr 2025 18:00:31 GMT':
            expect(result.toISOString()).toBe('2025-04-05T18:00:31.000Z');
            break;
          case '2025-01-01T00:00:00Z':
            expect(result.toISOString()).toBe('2025-01-01T00:00:00.000Z');
            break;
          case '2025-01-01':
            expect(result.toISOString()).toBe('2025-01-01T00:00:00.000Z');
            break;
          case '2025-01-02T00:00:00-08':
            expect(result.toISOString()).toBe('2025-01-02T08:00:00.000Z');
            break;
          case '"2025-01-02T00:00:00-08"':
            expect(result.toISOString()).toBe('2025-01-02T08:00:00.000Z');
            break;
          case '2025-01-15 20:53:08':
            expect(result.toISOString()).toBe('2025-01-15T20:53:08.000Z');
            break;
          case '"2025-01-15 20:53:08"':
            expect(result.toISOString()).toBe('2025-01-15T20:53:08.000Z');
            break;
          case 'Wed Jul 09 2025':
            expect(result.getUTCFullYear()).toBe(2025);
            expect(result.getUTCMonth()).toBe(6); // July is month 6 (0-indexed)
            expect(result.getUTCDate()).toBe(9);
            expect(result.getUTCHours()).toBe(0);
            expect(result.getUTCMinutes()).toBe(0);
            expect(result.getUTCSeconds()).toBe(0);
            break;
          case '8/4/2025, 11:02:31 PM':
            expect(result.toISOString()).toBe('2025-08-04T23:02:31.000Z');
            break;
          default:
            throw new Error(`Unexpected date string: ${dateString}`);
        }
      });
    });
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
      expect(result.getTime()).toBe(timestamp);
    });

    it('should throw for unsupported types', () => {
      expect(() => coerceToDate(true)).toThrow();
      expect(() => coerceToDate({})).toThrow();
      expect(() => coerceToDate(null)).toThrow();
    });
  });
});
