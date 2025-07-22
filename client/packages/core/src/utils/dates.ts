// Main parse function that handles strings and numbers
export function coerceToDate(x: unknown): Date {
  if (x instanceof Date) {
    return x;
  }
  if (typeof x === 'string') {
    const result = dateStrToInstant(x) || jsonStrToInstant(x);
    if (!result) {
      throw new Error(`Unable to parse date string ${x}`);
    }
    return result;
  } else if (typeof x === 'number') {
    return new Date(x);
  }
  throw new Error(`Invalid date value type: ${typeof x}`);
}

// Date parsing functions
function zonedDateTimeStrToInstant(s) {
  return new Date(s);
}

function localDateTimeStrToInstant(s) {
  // Parse as UTC since there's no timezone info
  return new Date(s + 'Z');
}

function localDateStrToInstant(s) {
  // Parse date and set to start of day in UTC
  return new Date(s + 'T00:00:00Z');
}

// Custom date formatters
function offioDateStrToInstant(s) {
  // Format: "yyyy-MM-dd HH:mm:ss"
  // Treat as UTC
  const [datePart, timePart] = s.split(' ');
  return new Date(datePart + 'T' + timePart + 'Z');
}

function zenecaDateStrToInstant(s) {
  // Format: "yyyy-MM-dd HH:mm:ss.n"
  // Treat as UTC
  const [datePart, timeWithNanos] = s.split(' ');
  // JavaScript Date can handle fractional seconds
  return new Date(datePart + 'T' + timeWithNanos + 'Z');
}

function rfc1123ToInstant(s) {
  // RFC 1123 format is natively supported by Date constructor
  return new Date(s);
}

function dowMonDayYearStrToInstant(s) {
  // Format: "EEE MMM dd yyyy" (e.g., "Wed Jan 15 2025")
  // Parse and set to start of day UTC
  const date = new Date(s);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

// Array of parsers
const dateParsers = [
  zonedDateTimeStrToInstant,
  localDateTimeStrToInstant,
  localDateStrToInstant,
  rfc1123ToInstant,
  offioDateStrToInstant,
  zenecaDateStrToInstant,
  dowMonDayYearStrToInstant,
];

// Try to parse with a specific parser
function tryParseDateString(parser, s) {
  try {
    const result = parser(s);
    // Check if result is valid date
    if (result instanceof Date && !isNaN(result.getTime())) {
      return result;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Try all parsers until one succeeds
function dateStrToInstant(s) {
  for (const parser of dateParsers) {
    const instant = tryParseDateString(parser, s);
    if (instant) {
      return instant;
    }
  }
  return null;
}

// Parse JSON string and then try date parsing
function jsonStrToInstant(maybeJson: string) {
  try {
    const s = JSON.parse(maybeJson);
    if (typeof s === 'string') {
      return dateStrToInstant(s);
    }
    return null;
  } catch (e) {
    return null;
  }
}
