export function coerceToDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    let dateValue = value;

    if (typeof value === 'string') {
      dateValue = fixDateString(value);
    }

    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      if (typeof value === 'string') {
        const alternativeDate = tryAlternativeParsing(value);
        if (alternativeDate) {
          return alternativeDate;
        }
      }
      throw new Error(
        `Invalid date value: ${value} (processed as: ${dateValue})`,
      );
    }
    return date;
  }

  throw new Error(`Cannot coerce value to Date: ${value}`);
}

function fixDateString(dateStr: string): string {
  let fixed = dateStr.trim();

  // Remove literal quote characters from the beginning and end
  fixed = fixed.replace(/^["']|["']$/g, '');

  // Fix timezone offset format: -08 -> -08:00, +05 -> +05:00
  fixed = fixed.replace(/([+-]\d{2})(?!:)$/, '$1:00');

  // Replace space between date and time with 'T' for ISO format
  fixed = fixed.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/, '$1T$2');

  return fixed;
}

function tryAlternativeParsing(dateStr: string): Date | null {
  const isoMatch = dateStr.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z?$/,
  );
  if (isoMatch) {
    const [, year, month, day, hour, minute, second, ms = '0'] = isoMatch;
    const date = new Date(
      Date.UTC(
        parseInt(year),
        parseInt(month) - 1, // Month is 0-indexed
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second),
        parseInt(ms),
      ),
    );

    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}
